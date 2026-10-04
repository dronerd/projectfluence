#!/usr/bin/env python3
"""Generate the fixed VocabStream readings as versioned public AAC assets.

Dry run by default. Run with --generate --limit 3 to audition a small sample,
then --generate to resume the full corpus. Existing valid clips are skipped.
FFmpeg (or imageio-ffmpeg) converts the provider MP3 to compact browser-compatible M4A.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/vocabstream/data"
CONFIG = json.loads((ROOT / "apps/vocabstream/audio-config.json").read_text())
OUTPUT = ROOT / "public/vocabstream/audio" / CONFIG["version"]
AAC_BITRATE = CONFIG["bitrate"]
MODEL = CONFIG["model"]
VOICE = CONFIG["voice"]
SPEED = CONFIG["speed"]
INSTRUCTIONS = CONFIG["instructions"]
VERSION = f"{CONFIG['version']}|{MODEL}|{VOICE}|{SPEED}|{INSTRUCTIONS}|"


def clip_text(word: str, example: str) -> str:
    return f"{word.strip()}. {example.strip()}"


def clip_id(word: str, example: str) -> str:
    """FNV-1a 64-bit; keep in sync with apps/vocabstream/src/pages/speech.ts."""
    value = 0xCBF29CE484222325
    for byte in (VERSION + word.strip() + "\0" + example.strip()).encode("utf-8"):
        value = ((value ^ byte) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{value:016x}"


def entries() -> dict[str, tuple[str, str]]:
    clips = {}
    for lesson in sorted(DATA.glob("*/Lesson*.json")):
        for item in json.loads(lesson.read_text()).get("words", []):
            word, example = str(item.get("word") or "").strip(), str(item.get("example") or "").strip()
            if not word:
                continue
            identifier = clip_id(word, example)
            previous = clips.get(identifier)
            if previous is not None and previous != (word, example):
                raise RuntimeError(f"Audio ID collision in {lesson}")
            clips[identifier] = (word, example)
    return clips


def valid_mp3(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    with path.open("rb") as stream:
        start = stream.read(3)
    return start == b"ID3" or start[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")


def valid_m4a(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    data = path.read_bytes()
    offset, boxes = 0, set()
    while offset + 8 <= len(data):
        size = int.from_bytes(data[offset:offset + 4], "big")
        kind = data[offset + 4:offset + 8]
        if size < 8 or offset + size > len(data):
            return False
        boxes.add(kind)
        offset += size
    return offset == len(data) and {b"ftyp", b"moov", b"mdat"}.issubset(boxes)


def ffmpeg_executable() -> str:
    executable = os.getenv("FFMPEG_BINARY") or shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise RuntimeError("FFmpeg is required; install ffmpeg or imageio-ffmpeg") from None


def convert(identifier: str, ffmpeg: str) -> int:
    source = OUTPUT / f"{identifier}.mp3"
    destination = OUTPUT / f"{identifier}.m4a"
    if valid_m4a(destination):
        source.unlink(missing_ok=True)
        return destination.stat().st_size
    temporary = OUTPUT / f"{identifier}.tmp.m4a"
    result = subprocess.run([
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
        "-c:a", "aac", "-b:a", AAC_BITRATE, "-movflags", "+faststart", "-y", str(temporary),
    ], capture_output=True, text=True, timeout=45)
    if result.returncode or not valid_m4a(temporary):
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Audio conversion failed: {result.stderr[:200]}")
    temporary.replace(destination)
    source.unlink()
    return destination.stat().st_size


def api_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if key:
        return key
    env_file = ROOT / "api/speakwise/.env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.partition("=")[2].strip().strip('"').strip("'")
    raise RuntimeError("Set OPENAI_API_KEY in the environment or api/speakwise/.env")


def generate(identifier: str, word: str, example: str, key: str) -> int:
    destination = OUTPUT / f"{identifier}.mp3"
    if valid_mp3(destination):
        return destination.stat().st_size
    payload = json.dumps({
        "model": MODEL,
        "voice": VOICE,
        "input": clip_text(word, example),
        "instructions": INSTRUCTIONS,
        "speed": SPEED,
        "response_format": "mp3",
    }).encode()
    for attempt in range(6):
        request = urllib.request.Request(
            "https://api.openai.com/v1/audio/speech", data=payload,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                content_type = response.headers.get("Content-Type", "")
                if "audio" not in content_type:
                    raise RuntimeError(f"Unexpected content type: {content_type}")
                body = response.read()
            temporary = destination.with_suffix(".mp3.tmp")
            temporary.write_bytes(body)
            if not valid_mp3(temporary):
                temporary.unlink(missing_ok=True)
                raise RuntimeError("Invalid or empty MP3 returned")
            temporary.replace(destination)
            return len(body)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504):
                raise RuntimeError(f"Speech API returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError):
            pass
        if attempt == 5:
            raise RuntimeError("Speech API unavailable after six attempts")
        time.sleep(min(30, 2 ** attempt + random.random()))
    raise AssertionError("unreachable")


def process_clip(identifier: str, word: str, example: str, key: str | None, ffmpeg: str) -> int:
    if not valid_mp3(OUTPUT / f"{identifier}.mp3"):
        if key is None:
            raise RuntimeError("Source MP3 is missing; run --generate to create it")
        generate(identifier, word, example, key)
    return convert(identifier, ffmpeg)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", action="store_true", help="Make paid API requests for missing source clips")
    parser.add_argument("--convert-only", action="store_true", help="Convert existing source clips without API requests")
    parser.add_argument("--check", action="store_true", help="Fail if any current lesson reading lacks a valid prepared clip")
    parser.add_argument("--limit", type=int, default=0, help="Maximum new clips to generate in this run")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent requests, from 1 to 12")
    args = parser.parse_args()
    if args.limit < 0 or not 1 <= args.workers <= 12:
        parser.error("--limit must be nonnegative and --workers must be between 1 and 12")
    clips = entries()
    remaining = [(identifier, *clip) for identifier, clip in clips.items() if not valid_m4a(OUTPUT / f"{identifier}.m4a")]
    sources = sum(valid_mp3(OUTPUT / f"{identifier}.mp3") for identifier, *_ in remaining)
    print(f"{len(clips)} unique readings; {len(clips) - len(remaining)} ready; {sources} source MP3s; {len(remaining)} remaining", flush=True)
    if args.check:
        return 1 if remaining else 0
    if not (args.generate or args.convert_only) or not remaining:
        return 0
    if args.generate and args.convert_only:
        parser.error("Select one of --generate or --convert-only")
    key = api_key() if args.generate else None
    ffmpeg = ffmpeg_executable()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    selected = remaining if args.generate else [item for item in remaining if valid_mp3(OUTPUT / f"{item[0]}.mp3")]
    selected = selected[:args.limit] if args.limit else selected
    failures = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_clip, identifier, word, example, key, ffmpeg): identifier for identifier, word, example in selected}
        for index, future in enumerate(as_completed(futures), 1):
            identifier = futures[future]
            try:
                future.result()
            except Exception as exc:
                failures.append((identifier, str(exc)))
            if index % 50 == 0 or index == len(selected):
                print(f"Processed {index}/{len(selected)}; failures {len(failures)}", flush=True)
    for identifier, error in failures[:20]:
        print(f"FAILED {identifier}: {error}")
    if failures:
        print(f"{len(failures)} clips failed; rerun --generate to retry", flush=True)
    else:
        print("All selected clips are available", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
