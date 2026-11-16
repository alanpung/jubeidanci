#!/usr/bin/env python3
"""
Final content cleanup for the writing exercises.

Target prompt-card layout:

  A1 / A2   Write about <topic> in English.
            Requirements: <paragraphs>, <word count>
            [中文范文 panel]            ← no English vocab hints

  B1        Write about <topic> in English.
            Requirements: 3-4 paragraphs, 100-150 words
            [中文结构提示 panel]
            Key vocabulary hints: ...   ← a few English vocabs

  B2        Write about <topic> in English.
            Requirements: 4-6 paragraphs, 150-200 words
            Key vocabulary hints: ...   ← sufficient vocab, no structure line

  Advanced  Write about <topic> in English.
            Requirements: 4-8 paragraphs, 200-400 words
            Key vocabulary & phrases: ...  ← sufficient vocab, no structure line

The Chinese essay is NOT inlined into `sentence` any more — it lives only in
the dedicated `chineseEssay` field and the renderer places it between the
requirements and the vocabulary hints. That removes the duplicate rendering.
"""

import glob
import re
import os

CONTENT_DIR = "content"

# Level -> (paragraphs, word count, keep vocab hints?, vocab label, vocab count)
LEVEL_SPEC = {
    "a1":        ("1 paragraph",     "30-50 words",  False, "Key vocabulary hints",  0),
    "a2":        ("1 paragraph",     "50-80 words",  False, "Key vocabulary hints",  0),
    "b1":        ("3-4 paragraphs",  "100-150 words", True, "Key vocabulary hints",  6),
    "b2":        ("4-6 paragraphs",  "150-200 words", True, "Key vocabulary hints",  14),
    "advanced":  ("4-8 paragraphs",  "200-400 words", True, "Key vocabulary & phrases", 16),
}

# Chinese essay label per level
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


def get_srs_vocabs(body):
    """Extract the srsWords list (these are the level's own key words)."""
    srs = get_field(body, "srsWords")
    if srs:
        return re.findall(r'"([^"]+)"', srs)
    # srsWords may be unquoted space-separated
    line = re.search(r'^srsWords:\s*(.+)$', body, re.MULTILINE)
    if line:
        return re.findall(r'"([^"]+)"', line.group(1))
    return []


def get_extra_vocabs(body):
    """
    Pull the unit's topic-specific vocab list out of the current `sentence`.

    The extra vocab was appended after the original srsWords, so we can
    recover it by taking the sentence's vocab list and removing the srsWords
    prefix.
    """
    sentence = get_field(body, "sentence") or ""
    srs = get_srs_vocabs(body)
    srs_lower = {w.lower() for w in srs}

    vocab_line = None
    for seg in sentence.split("||"):
        seg = seg.strip()
        if seg.startswith("Key vocabulary"):
            vocab_line = seg
            break
    if not vocab_line:
        return []

    after_colon = vocab_line.split(":", 1)[1] if ":" in vocab_line else ""
    words = [w.strip() for w in after_colon.split(",") if w.strip()]

    # The first N words that match srsWords are the original ones; the rest
    # are the extra topic vocab.
    extra = []
    seen_srs = 0
    for w in words:
        if w.lower() in srs_lower:
            seen_srs += 1
            continue
        extra.append(w)
    return extra


def process_file(filepath, level):
    paragraphs, word_count, keep_vocab, vocab_label, vocab_count = LEVEL_SPEC[level]

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

                # 1. Topic line
                topic = ""
                for seg in old_sentence.split("||"):
                    seg = seg.strip()
                    if seg.startswith("Write about"):
                        topic = seg
                        break
                if not topic:
                    topic = "Write about this topic in English."

                # 2. Build the new sentence
                parts = [topic, f"Requirements: {paragraphs}, {word_count}"]

                if keep_vocab:
                    srs = get_srs_vocabs(body)
                    extra = get_extra_vocabs(body)
                    all_vocabs = []
                    seen = set()
                    for w in srs + extra:
                        if w.lower() not in seen:
                            all_vocabs.append(w)
                            seen.add(w.lower())
                    if all_vocabs:
                        parts.append(f"{vocab_label}: {', '.join(all_vocabs[:vocab_count])}")

                new_sentence = " || ".join(parts)
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
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("---".join(new_blocks))
        return True
    return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")

    for level in ["a1", "a2", "b1", "b2", "advanced"]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed = 0
        for f in files:
            if process_file(f, level):
                changed += 1
        print(f"{level}: {changed}/{len(files)} files updated")

    print("\nDone!")


if __name__ == "__main__":
    main()
