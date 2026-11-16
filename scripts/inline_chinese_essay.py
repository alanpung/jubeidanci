#!/usr/bin/env python3
"""
Restructure the `sentence` field so the Chinese essay renders right after
the requirements.

The app renders `exercise.sentence` as the prompt card, and the parser turns
' || ' separators into newlines (whitespace-pre-wrap), so each ' || ' segment
becomes its own line. Currently the sentence says "a Chinese essay is provided
below" but nothing actually follows it.

New layout for A1/A2/B1:
  Write about <topic> in English.
  Requirements: <paragraphs>, <word count>
  中文范文:
  <the Chinese essay>
  Key vocabulary hints: ...

For B2/Advanced (no Chinese essay):
  Write about <topic> in English.
  Requirements: <paragraphs>, <word count>
  Key vocabulary hints: ...
  Suggested structure: ...
"""

import glob
import re
import os

CONTENT_DIR = "content"

# Levels that get a Chinese essay rendered inline
CHINESE_LEVELS = {"a1", "a2", "b1"}

# Label for the Chinese essay block
CHINESE_LABEL = {
    "a1": "中文范文 (Chinese essay to translate):",
    "a2": "中文范文 (Chinese essay to translate):",
    "b1": "中文结构提示 (Chinese structure guide):",
}


def get_field(body, field):
    pattern = rf'^{field}:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, body, re.MULTILINE)
    if match:
        return match.group(1)
    return None


def set_field(body, field, value):
    pattern = rf'(^{field}:\s*")((?:[^"\\]|\\.)*)(")'
    if re.search(pattern, body, re.MULTILINE):
        return re.sub(pattern, lambda m: f'{m.group(1)}{value}{m.group(3)}', body, count=1, flags=re.MULTILINE)
    return body


def get_lesson_title(meta):
    match = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
    if match:
        return match.group(1)
    return ""


def get_chinese_text(body, level):
    """
    Get the Chinese essay text for a writing block.
    - A1: 'chineseEssay' field
    - A2/B1: 'core' field (which now holds the Chinese text)
    """
    field = "chineseEssay" if level == "a1" else "core"
    value = get_field(body, field)
    if not value:
        return None
    # Sanity check: must actually contain Chinese characters
    if not any("\u4e00" <= ch <= "\u9fff" for ch in value):
        return None
    return value


def process_file(filepath, level):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    blocks = content.split("---")
    changed = False
    new_blocks = [blocks[0]]

    i = 1
    while i < len(blocks):
        if i + 1 < len(blocks):
            meta = blocks[i]
            body = blocks[i + 1] if i + 1 < len(blocks) else ""

            if "lessonTitle" in meta and "[writing]" in body:
                old_sentence = get_field(body, "sentence") or ""

                # Split the existing sentence into its ' || ' segments
                segments = [s.strip() for s in old_sentence.split("||")]

                topic = None
                req = None
                vocab = None
                structure = None
                others = []

                for seg in segments:
                    if seg.startswith("Write about"):
                        topic = seg
                    elif seg.startswith("Requirements:"):
                        req = seg
                    elif seg.startswith("Key vocabulary"):
                        vocab = seg
                    elif seg.startswith("Suggested structure:"):
                        structure = seg
                    elif seg.startswith("Write a well-structured"):
                        others.append(seg)
                    else:
                        # Legacy scaffolding notice lines — drop them, we now
                        # render the essay inline.
                        others.append(seg)

                # Rebuild
                new_parts = []
                if topic:
                    new_parts.append(topic)
                if req:
                    new_parts.append(req)

                chinese = get_chinese_text(body, level)
                if chinese and level in CHINESE_LEVELS:
                    new_parts.append(CHINESE_LABEL[level])
                    new_parts.append(chinese)

                if vocab:
                    new_parts.append(vocab)
                if structure:
                    new_parts.append(structure)

                # Preserve any remaining non-scaffolding hints
                for o in others:
                    if o.startswith("A Chinese essay") or o.startswith("A Chinese structure"):
                        continue
                    if o.startswith("Write a well-structured"):
                        new_parts.append(o)

                new_sentence = " || ".join(new_parts)

                if new_sentence != old_sentence:
                    body = set_field(body, "sentence", new_sentence)
                    changed = True

            new_blocks.append(meta)
            new_blocks.append(body)
            i += 2
        else:
            new_blocks.append(blocks[i])
            i += 1

    if changed:
        new_content = "---".join(new_blocks)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True
    return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")

    for level in ["a1", "a2", "b1", "b2", "advanced"]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed_count = 0
        for f in files:
            if process_file(f, level):
                changed_count += 1
        print(f"{level}: {changed_count}/{len(files)} files updated")

    print("\nDone!")


if __name__ == "__main__":
    main()
