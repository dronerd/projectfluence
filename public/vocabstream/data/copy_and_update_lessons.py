import os
import json
import re

SOURCE = os.path.normpath("eiken-pre2/Lesson1.json")

def extract_lesson_number(filename):
    m = re.search(r'Lesson\s*0*(\d+)', filename, re.IGNORECASE)
    if m:
        return m.group(1)
    m2 = re.search(r'(\d+)', filename)
    if m2:
        return m2.group(1)
    return None

def main():
    if not os.path.isfile(SOURCE):
        print(f"コピー元が見つかりません: {SOURCE}")
        return

    with open(SOURCE, 'r', encoding='utf-8') as f:
        try:
            src_data = json.load(f)
        except Exception as e:
            print(f"コピー元 JSON の読み込みエラー: {e}")
            return

    src_abs = os.path.abspath(SOURCE)

    for root, dirs, files in os.walk("."):
        for fname in files:
            if not fname.lower().endswith(".json"):
                continue

            target_rel = os.path.normpath(os.path.join(root, fname))
            target_abs = os.path.abspath(target_rel)

            if target_abs == src_abs:
                continue

            # rootが "./TOEIC-proficiency" のようになるので、そこからフォルダ名を取る
            folder_name = os.path.basename(root)
            if folder_name == ".":
                print(f"スキップ: {target_rel} (サブフォルダなし)")
                continue

            lesson_number = extract_lesson_number(fname) or "1"
            new_lesson_id = f"{folder_name}-{lesson_number}"
            new_title = f"Lesson {lesson_number}"

            new_data = dict(src_data)
            new_data["lesson_id"] = new_lesson_id
            new_data["title"] = new_title

            try:
                with open(target_rel, 'w', encoding='utf-8') as out:
                    json.dump(new_data, out, ensure_ascii=False, indent=2)
                print(f"上書き保存: {target_rel} -> lesson_id: {new_lesson_id}, title: {new_title}")
            except Exception as e:
                print(f"保存エラー ({target_rel}): {e}")

    print("処理が完了しました。")

if __name__ == "__main__":
    main()
