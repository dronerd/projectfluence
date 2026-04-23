#!/usr/bin/env python3
"""
update_lessons.py

Robust version: auto-detects data locations so you can run it from project root
or from inside the data/ folder. Behavior:

- Reads the big JSON array from "json of C2 vocabularies.txt"
- Updates Lesson1.json .. Lesson100.json in word-proficiency/
- Each lesson gets 10 consecutive entries
- Creates a backup folder (timestamped) for original lesson files
- Stops if vocabulary entries run out
"""
import json
import re
from pathlib import Path
import shutil
from datetime import datetime
import sys

# --- CONFIG ---
LESSON_TEMPLATE = "Lesson{}.json"   # Lesson1.json ... Lesson100.json
LESSONS = range(1, 101)
WORDS_PER_LESSON = 10
# ----------------

def auto_detect_paths():
    """
    Detect where the vocab file and lesson directory are.
    Priority:
      1) If script is located in project_root (sibling 'data' folder exists with expected files), use that.
      2) If script is located inside data/, use that folder as base.
      3) If either of the above is true, set paths accordingly.
      4) Else fallback to current working directory assumptions.
    Returns: (VOCAB_PATH (Path), LESSON_DIR (Path))
    """
    script_dir = Path(__file__).resolve().parent
    cwd = Path.cwd()

    # Candidate locations to check (ordered)
    candidates = [
        # script is in project root: project_root/data/...
        script_dir / "data" / "json of C2 vocabularies.txt",
        # script is inside data/
        script_dir / "json of C2 vocabularies.txt",
        # running from project root but script located elsewhere: cwd/data/...
        cwd / "data" / "json of C2 vocabularies.txt",
        # running from data/ (cwd is data/)
        cwd / "json of C2 vocabularies.txt",
        # parent of script (if script in nested folder)
        script_dir.parent / "data" / "json of C2 vocabularies.txt",
    ]

    for candidate in candidates:
        if candidate.exists():
            # resolve appropriate lesson dir relative to candidate
            candidate_parent = candidate.parent  # either data/ or something
            # if candidate_parent is 'data' folder then lessons are inside candidate_parent/word-proficiency
            if (candidate_parent / "word-proficiency").exists():
                return (candidate, candidate_parent / "word-proficiency")
            # else maybe candidate_parent is project root and data folder sibling exists:
            if (candidate_parent / "data" / "word-proficiency").exists():
                return (candidate_parent / "data" / "json of C2 vocabularies.txt",
                        candidate_parent / "data" / "word-proficiency")

    # Fallback guesses
    # 1) cwd/data/...
    if (cwd / "data" / "json of C2 vocabularies.txt").exists():
        return (cwd / "data" / "json of C2 vocabularies.txt", cwd / "data" / "word-proficiency")
    # 2) cwd/json of C2 vocabularies.txt
    if (cwd / "json of C2 vocabularies.txt").exists() and (cwd / "word-proficiency").exists():
        return (cwd / "json of C2 vocabularies.txt", cwd / "word-proficiency")
    # 3) script_dir guesses
    if (script_dir / "data" / "json of C2 vocabularies.txt").exists():
        return (script_dir / "data" / "json of C2 vocabularies.txt", script_dir / "data" / "word-proficiency")
    if (script_dir / "json of C2 vocabularies.txt").exists():
        # script inside data/
        return (script_dir / "json of C2 vocabularies.txt", script_dir / "word-proficiency")

    # If we still haven't found the files, return defaults (the original locations)
    return (script_dir / "data" / "json of C2 vocabularies.txt", script_dir / "data" / "word-proficiency")


def load_vocab_list(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Vocabulary file not found: {path}")
    raw = path.read_text(encoding='utf-8')

    # Quick attempt: try normal JSON parse first
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
        else:
            raise ValueError("Top-level JSON is not a list.")
    except Exception:
        pass

    # Heuristic cleanup:
    start = raw.find('[')
    end = raw.rfind(']')
    candidate = raw[start:end+1] if (start != -1 and end != -1 and start < end) else raw
    candidate = re.sub(r',\s*(\]|\})', r'\1', candidate)
    candidate = re.sub(r'\([^)]*many more[^)]*\)', '', candidate, flags=re.I)
    candidate = re.sub(r'\.{3,}', '', candidate)

    try:
        data = json.loads(candidate)
        if not isinstance(data, list):
            raise ValueError("Parsed JSON is not a list.")
        return data
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse vocabulary JSON after cleanup. JSONDecodeError: {e}") from e

def normalize_vocab_entry(entry: dict):
    keys = [
        "word",
        "meaning",
        "japaneseMeaning",
        "synonyms",
        "antonyms",
        "example",
        "japaneseExample"
    ]
    normalized = {}
    for k in keys:
        if k in entry:
            normalized[k] = entry.get(k, "")
        else:
            fallback = None
            alt_keys = {
                "japaneseMeaning": ["japanese_meaning", "japanese"],
                "japaneseExample": ["japanese_example"],
            }.get(k, [])
            for ak in alt_keys:
                if ak in entry:
                    fallback = entry[ak]
                    break
            normalized[k] = fallback if fallback is not None else entry.get(k, "") if isinstance(entry, dict) else ""
    return normalized

def main():
    VOCAB_PATH, LESSON_DIR = auto_detect_paths()
    print("Using vocab path:", VOCAB_PATH)
    print("Using lesson dir:", LESSON_DIR)

    try:
        vocab_list = load_vocab_list(VOCAB_PATH)
    except Exception as e:
        print("ERROR while loading vocab list:", e)
        sys.exit(1)

    total_vocab = len(vocab_list)
    print(f"Total vocabulary entries found: {total_vocab}")

    # Prepare backup directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = LESSON_DIR / f"backup_{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    print("Backups will be saved to:", backup_dir)

    # iterate lessons
    for lesson_num in LESSONS:
        start_idx = (lesson_num - 1) * WORDS_PER_LESSON
        end_idx = start_idx + WORDS_PER_LESSON
        if start_idx >= total_vocab:
            print(f"No more vocabulary left. Stopping at lesson {lesson_num}.")
            break

        selected = vocab_list[start_idx:end_idx]
        normalized_words = [normalize_vocab_entry(e) for e in selected]

        lesson_path = LESSON_DIR / LESSON_TEMPLATE.format(lesson_num)
        # backup existing lesson file if present
        if lesson_path.exists():
            shutil.copy2(lesson_path, backup_dir / lesson_path.name)
            try:
                existing = json.loads(lesson_path.read_text(encoding='utf-8'))
            except Exception:
                existing = None
        else:
            existing = None

        # Build lesson content: preserve other keys if possible
        if isinstance(existing, dict):
            lesson_data = existing
            lesson_data['words'] = normalized_words
        else:
            lesson_data = {
                "lesson_id": f"lesson-{lesson_num}",
                "title": f"Lesson {lesson_num}",
                "words": normalized_words
            }

        lesson_path.write_text(json.dumps(lesson_data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"Wrote {len(normalized_words)} words to {lesson_path.name} (entries {start_idx}..{end_idx-1}).")

    print("Done.")

if __name__ == "__main__":
    main()
