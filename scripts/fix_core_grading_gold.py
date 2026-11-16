#!/usr/bin/env python3
"""
Restore the English `core` field (the grading gold) for A2/B1 and move the
Chinese text into a dedicated `chineseEssay` field.

Why: `core` is the English text the local rule-based grader compares the
learner's essay against (see `buildInternal` in app/api/grade-writing/route.ts
and the schema comment in lib/content/exercise-schema.ts). If `core` holds
Chinese, every Chinese token is counted as "missing" content and the learner
can never pass.

Layout after this script:

  A1:  chineseEssay: <中文>   (no core — A1 never had one)
  A2:  chineseEssay: <中文>   core: <English simplified model>
  B1:  chineseEssay: <中文>   core: <English simplified model>
  B2:  (unchanged — no Chinese essay)
  Adv: (unchanged — no Chinese essay)
"""

import glob
import re
import os
import subprocess

CONTENT_DIR = "content"

# Commit where `core` still held the English simplified model for A2/B1.
BASE_COMMIT = "c3edb26"

# Level -> (chinese source field, has core in base)
LEVELS = {
    "a1": ("chineseEssay", False),
    "a2": ("core", True),
    "b1": ("core", True),
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
    # Field absent — insert it right before the `core:` line if present,
    # otherwise right after `text:`.
    lines = body.split('\n')
    new_lines = []
    inserted = False
    for line in lines:
        if not inserted and line.startswith('core:'):
            new_lines.append(f'{field}: "{value}"')
            inserted = True
        new_lines.append(line)
    if not inserted:
        new_lines2 = []
        done = False
        for line in new_lines:
            new_lines2.append(line)
            if not done and line.strip().startswith('text:'):
                new_lines2.append(f'{field}: "{value}"')
                done = True
        new_lines = new_lines2
    return '\n'.join(new_lines)


def get_lesson_titles(filepath):
    """Return the list of lesson titles in order for a unit file."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    blocks = content.split("---")
    titles = []
    i = 1
    while i < len(blocks):
        if i + 1 < len(blocks):
            meta = blocks[i]
            if "lessonTitle" in meta:
                m = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
                if m:
                    titles.append(m.group(1))
            i += 2
        else:
            i += 1
    return titles


def get_base_cores(filepath, level):
    """Read the English `core` values from the base commit for a unit file."""
    try:
        out = subprocess.run(
            ["git", "show", f"{BASE_COMMIT}:{filepath}"],
            capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return []
    cores = re.findall(r'^core:\s*"((?:[^"\\]|\\.)*)"', out, re.MULTILINE)
    return cores


def process_file(filepath, level):
    chinese_source_field, has_base_core = LEVELS[level]

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Collect the current Chinese texts (in lesson order).
    chinese_texts = []
    blocks = content.split("---")
    i = 1
    while i < len(blocks):
        if i + 1 < len(blocks):
            body = blocks[i + 1] if i + 1 < len(blocks) else ""
            if "[writing]" in body:
                val = get_field(body, chinese_source_field)
                chinese_texts.append(val)
            i += 2
        else:
            i += 1

    # The English `core` values from the base commit (lesson order).
    base_cores = get_base_cores(filepath, level) if has_base_core else []

    if len(chinese_texts) != len(base_cores) and has_base_core:
        print(f"  WARNING: {filepath} has {len(chinese_texts)} lessons but "
              f"{len(base_cores)} base cores — skipping core restore")
        return False

    # Rebuild the file.
    blocks = content.split("---")
    new_blocks = [blocks[0]]
    changed = False
    lesson_idx = 0
    i = 1
    while i < len(blocks):
        if i + 1 < len(blocks):
            meta = blocks[i]
            body = blocks[i + 1] if i + 1 < len(blocks) else ""
            if "[writing]" in body:
                chinese = chinese_texts[lesson_idx] if lesson_idx < len(chinese_texts) else None

                if chinese and chinese.strip():
                    # 1. Ensure chineseEssay holds the Chinese text.
                    if level == "a1":
                        body = set_field(body, "chineseEssay", chinese)
                    else:
                        # core currently holds Chinese — move it to chineseEssay
                        body = set_field(body, "chineseEssay", chinese)
                        # 2. Restore the English core from the base commit.
                        if lesson_idx < len(base_cores):
                            body = set_field(body, "core", base_cores[lesson_idx])
                    changed = True

                lesson_idx += 1
            new_blocks.append(meta)
            new_blocks.append(body)
            i += 2
        else:
            new_blocks.append(blocks[i])
            i += 1

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("---".join(new_blocks))
        return True
    return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")

    for level in ["a1", "a2", "b1"]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed = 0
        for f in files:
            if process_file(f, level):
                changed += 1
        print(f"{level}: {changed}/{len(files)} files updated")

    print("\nDone!")


if __name__ == "__main__":
    main()
