#!/usr/bin/env python3
"""
decapitalize_words.py

Place this file in: backend/data/

What it does:
- Scans the folder `word_proficiency` (relative to this script) for files named Lesson*.json
- For each file, it converts each entry's `word` value to lowercase (e.g. "Temperate" -> "temperate").
- Writes changes back to the original file (unless --dry-run) and can save a timestamped backup.

Usage:
  python decapitalize_words.py           # run and apply changes, creating backups by default
  python decapitalize_words.py --dry-run # show what would change but do not write
  python decapitalize_words.py --no-backup # apply changes without creating backups

"""
from pathlib import Path
import json
import argparse
import shutil
from datetime import datetime


def process_file(path: Path, make_backup: bool) -> dict:
    """Load JSON file, decapitalize words, and overwrite file if changed.
    Returns a dict with statistics and changed words.
    """
    stats = {"file": str(path), "changed": 0, "changes": []}
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
    except Exception as e:
        stats["error"] = f"Failed to read/parse JSON: {e}"
        return stats

    if not isinstance(data, dict):
        stats["error"] = "JSON root is not an object/dict"
        return stats

    words = data.get("words")
    if not isinstance(words, list):
        stats["error"] = "No 'words' list found in JSON"
        return stats

    changed_any = False
    for i, entry in enumerate(words):
        if not isinstance(entry, dict):
            continue
        original = entry.get("word")
        if isinstance(original, str) and original != original.lower():
            new = original.lower()
            entry["word"] = new
            stats["changed"] += 1
            stats["changes"].append({"index": i, "from": original, "to": new})
            changed_any = True

    if changed_any:
        if make_backup:
            backup_dir = path.parent / "_backups"
            backup_dir.mkdir(exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = backup_dir / f"{path.name}.{stamp}.bak"
            shutil.copy2(path, backup_path)
            stats["backup"] = str(backup_path)

        # write updated JSON back (preserve unicode characters)
        try:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            stats["written"] = True
        except Exception as e:
            stats["error"] = f"Failed to write JSON: {e}"
    else:
        stats["written"] = False

    return stats


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Decapitalize 'word' fields in Lesson JSON files")
    p.add_argument("--dry-run", action="store_true", help="Show changes but don't write files")
    p.add_argument("--no-backup", action="store_true", help="Do not create backup copies of modified files")
    p.add_argument("--pattern", default="Lesson*.json", help="Filename glob pattern to search for (default: Lesson*.json)")
    args = p.parse_args()

    script_dir = Path(__file__).resolve().parent

    #ここを変えることで、どのフォルダの中のレッスンをdecapitalizeしたいか指定できる
    target_dir = script_dir / "word-proficiency"

    if not target_dir.exists() or not target_dir.is_dir():
        print(f"Target folder not found: {target_dir}")
        raise SystemExit(1)

    files = sorted(target_dir.glob(args.pattern))
    if not files:
        print(f"No files matching pattern '{args.pattern}' found in {target_dir}")
        raise SystemExit(0)

    overall = {"files_processed": 0, "files_changed": 0, "total_word_changes": 0, "details": []}

    for f in files:
        overall["files_processed"] += 1
        stats = process_file(f, make_backup=(not args.no_backup) and (not args.dry_run))
        overall["details"].append(stats)
        if stats.get("changed", 0) > 0:
            overall["files_changed"] += 1
            overall["total_word_changes"] += stats.get("changed", 0)
            print(f"{f.name}: {stats['changed']} words changed")
            for change in stats.get("changes", []):
                print(f"  - {change['from']} -> {change['to']}")
            if args.dry_run:
                print("  (dry-run: not written)")
            else:
                print(f"  backup: {stats.get('backup', 'no backup')}")
        else:
            print(f"{f.name}: no changes needed")

    print("\nSummary:")
    print(f"  files scanned: {overall['files_processed']}")
    print(f"  files changed: {overall['files_changed']}")
    print(f"  words modified: {overall['total_word_changes']}")

    # exit code: 0 if ok
    raise SystemExit(0)
