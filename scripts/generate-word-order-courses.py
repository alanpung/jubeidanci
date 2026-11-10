#!/usr/bin/env python3
"""Generate CEFR A2-C2 Word Order courses.

Structure mirrors content/a1-word-order-unit-*.md (5 units x 20 lessons x 10
questions = 1000 questions per level) but, per the request for A2+, contains
ONLY [word-order] exercises -- no [matching-pairs] hint blocks.

Each question:
  - answer:    tokens of a real dictionary example sentence
  - words:     answer tokens + one distractor
  - text:      the FULL Chinese sentence translation, matching the A1 course
               style (e.g. "我吃苹果。"). Translations come from
               words/sentence_translations_zh.json, built by
               scripts/translate-sentences.py.
  - srsWords:  the target lemma + one other content word from the sentence

The generator is deterministic and idempotent: a level whose course file
already exists is skipped unless --force is given.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_PATH = ROOT / "words" / "english_merged.json"
TRANSLATIONS_PATH = ROOT / "words" / "sentence_translations_zh.json"
CONTENT_DIR = ROOT / "content"

# English sentence -> full Chinese sentence translation.
TRANSLATIONS: dict[str, str] = {}

LEVELS = ["A2", "B1", "B2", "C1", "C2"]
UNITS = 5
LESSONS_PER_UNIT = 20
QUESTIONS_PER_LESSON = 10
LESSONS_PER_LEVEL = UNITS * LESSONS_PER_UNIT           # 100
TARGET_WORDS = LESSONS_PER_LEVEL * QUESTIONS_PER_LESSON  # 1000
WORDS_PER_UNIT = TARGET_WORDS // UNITS                  # 200

TARGET_POS = {"noun", "verb", "adjective"}
ASCII_PRINTABLE = re.compile(r"^[\x20-\x7e]+$")
TOKEN_RE = re.compile(r"^[A-Za-z][A-Za-z'\-]*$")
WORD_RE = re.compile(r"^[a-z]{3,}$")
POS_PREFIX = re.compile(r"^[a-zA-Z]{1,4}\.\s*")
JUNK_GLOSS = re.compile(r"复数|过去式|过去分词|比较级|最高级|第三人称")
COMPARATIVE_GLOSS = re.compile(r"^[更最].{0,8}的?$")
TEMPLATE_SKELETON_MIN = 5

UNIT_NAMES = [
    "Core Sentences",
    "Everyday Sentences",
    "Actions & Descriptions",
    "Ideas & Context",
    "Advanced Sentences",
]
COLORS = ["#4A90D9", "#E67E22", "#27AE60", "#8E44AD", "#16A085"]
ICONS = ["🔤", "💬", "⚡", "💡", "🧩"]

# Function words and light verbs make poor SRS targets and poor distractors.
# Deliberately kept small so the A2 pool (the smallest one) still clears 1000.
STOP_WORDS = set(
    """
    a an the and or but if then than that this these those there here
    i you he she it we they me him her us them my your his its our their
    is am are was were be been being do does did done have has had having
    will would shall should can could may might must
    not no nor so such very just still also even ever never always often
    already yet too only much more most less least quite rather almost
    about above after again against all any as at because before below
    between both by during each few for from further how into itself
    of off on once other out over own same some through to under
    until up when where while which who whom why with within without
    one two three first last next another every either neither
    get got make made take took go went come came say said see saw know knew
    """.split()
)


def norm(word: str) -> str:
    """Lowercase a token and drop anything that is not a letter/apostrophe/hyphen."""
    return re.sub(r"[^a-z'\-]", "", word.lower())


def clean_gloss(raw) -> str | None:
    """Turn a multi-sense definition_zh into a short, purely Chinese hint."""
    text = str(raw or "")
    if JUNK_GLOSS.search(text):
        return None
    first_sense = re.split(r"[；;]", text)[0].strip()
    first_sense = POS_PREFIX.sub("", first_sense)
    first_sense = re.sub(r"[（(][^）)]*[）)]", "", first_sense)
    parts = re.split(r"[,，、]", first_sense)
    for part in parts:
        part = part.strip()
        if not part or len(part) > 8:
            continue
        # A single clean Chinese sense. Skip fragments that smuggle in Latin
        # text, stray spaces, or comparative/superlative glosses ("更容易的").
        if re.search(r"[A-Za-z0-9\s]", part):
            continue
        if COMPARATIVE_GLOSS.match(part):
            return None
        return part
    return None


def sentence_tokens(raw) -> list[str] | None:
    """Return clean word tiles, or None when the sentence is unsuitable."""
    text = str(raw or "").strip()
    if not ASCII_PRINTABLE.match(text):
        return None
    if '"' in text or "\\" in text or "`" in text:
        return None
    # Questions/exclamations lose their terminal punctuation when we strip the
    # tiles, leaving a sequence that reads like a statement.
    if "?" in text or "!" in text:
        return None
    text = re.sub(r"[.!?]+$", "", text).strip()
    tokens = text.split()
    if not (4 <= len(tokens) <= 14):
        return None
    # Reject internal punctuation (commas, "Mr.", semicolons, ...) so every
    # tile is a plain word just like in the A1 course.
    if any(not TOKEN_RE.match(tok) for tok in tokens):
        return None
    return tokens


def skeleton(tokens: list[str], word: str) -> str:
    """Sentence shape with the target lemma blanked out."""
    return " ".join("X" if norm(tok) == word else tok.lower() for tok in tokens)


def count_skeletons(data) -> collections.Counter:
    """Dictionary has thousands of machine-made example sentences built on a
    handful of fixed frames ("This X comes up often in everyday English",
    "He answered the question X", ...). Any frame reused >= 5 times is a
    template and is excluded, so word-order tiles come from natural sentences.
    """
    counts: collections.Counter = collections.Counter()
    for entry in data:
        tokens = sentence_tokens(entry.get("example_sentence_english"))
        if not tokens:
            continue
        word = str(entry.get("word") or "").strip().lower()
        counts[skeleton(tokens, word)] += 1
    return counts


def build_pool(data, level: str, skeleton_counts: collections.Counter) -> list[dict]:
    pool: list[dict] = []
    seen: set[str] = set()
    for entry in data:
        if entry.get("cefr_level") != level:
            continue
        word = str(entry.get("word") or "").strip()
        if not WORD_RE.match(word) or word in STOP_WORDS or word in seen:
            continue
        if entry.get("pos") not in TARGET_POS:
            continue
        tokens = sentence_tokens(entry.get("example_sentence_english"))
        if not tokens:
            continue
        gloss = clean_gloss(entry.get("definition_zh"))
        if not gloss:
            continue
        # The lemma must appear exactly once in its base form, else the hint
        # would not point at a specific word in the sentence.
        if [norm(tok) for tok in tokens].count(word) != 1:
            continue
        if skeleton_counts[skeleton(tokens, word)] >= TEMPLATE_SKELETON_MIN:
            continue
        freq = entry.get("word_frequency")
        freq = freq if isinstance(freq, (int, float)) else 10**9
        pool.append({"word": word, "gloss": gloss, "tokens": tokens, "freq": freq})
        seen.add(word)
    pool.sort(key=lambda e: (e["freq"], e["word"]))
    return pool


def pick_distractor(pool: list[dict], tokens: list[str], seed: int) -> str | None:
    """One plausible content word that is NOT part of the correct answer."""
    banned = {norm(tok) for tok in tokens} | STOP_WORDS
    n = len(pool)
    for k in range(1, n + 1):
        other = pool[(seed * 31 + k * 17) % n]
        for tok in other["tokens"]:
            word = norm(tok)
            if (
                len(word) >= 4
                and word not in banned
                and TOKEN_RE.match(tok)
                and not word.endswith("'s")
                and not word.endswith("'t")
                and not word.endswith("'ll")
                and not word.endswith("'re")
            ):
                return tok
    # Fallback: another lemma from the same level.
    for k in range(1, n + 1):
        word = pool[(seed * 31 + k * 17) % n]["word"]
        if len(word) >= 4 and word not in banned:
            return word
    return None


def srs_words(entry: dict, tokens: list[str]) -> list[str]:
    out = [entry["word"]]
    for tok in tokens:
        word = norm(tok)
        if (
            len(word) >= 4
            and word != entry["word"]
            and word not in STOP_WORDS
            and TOKEN_RE.match(tok)
        ):
            out.append(word)
            break
    return out


def render_question(entry: dict, distractor: str | None, missing: list[str]) -> str:
    tokens = entry["tokens"]
    sentence = " ".join(tokens)
    hint = TRANSLATIONS.get(sentence)
    if not hint:
        # Should not happen once the translation cache is complete. Keeping a
        # word-level fallback means regeneration never silently drops a hint.
        missing.append(sentence)
        hint = f"排列单词组成句子（提示：{entry['gloss']}）"
    words = list(tokens) + ([distractor] if distractor else [])
    return "\n".join(
        [
            "[word-order]",
            f'text: "{hint}"',
            "words: " + " ".join(f'"{w}"' for w in words),
            "answer: " + " ".join(f'"{w}"' for w in tokens),
            "random_order: true",
            "srsWords: " + " ".join(f'"{w}"' for w in srs_words(entry, tokens)),
        ]
    )


def render_course(level: str) -> str:
    cid = f"{level.lower()}-word-order-course"
    return (
        "\n".join(
            [
                "---",
                f'id: "{cid}"',
                f'courseTitle: "{level} Word Order"',
                f'description: "{level} Word Order Course '
                f'({UNITS} Units x {LESSONS_PER_UNIT} Lessons x '
                f'{QUESTIONS_PER_LESSON} Questions) by Alan P"',
                'sourceLanguage: "en"',
                'targetLanguage: "en"',
                f'level: "{level}"',
                'visibility: "private"',
                "---",
                "",
            ]
        )
    )


def render_unit(level: str, unit_no: int, entries: list[dict], missing: list[str]) -> str:
    cid = f"{level.lower()}-word-order-course"
    lines = [
        "---",
        f'unitTitle: "Word Order – Unit {unit_no}: {UNIT_NAMES[unit_no - 1]}"',
        'description: "Arrange the word tiles into the correct sentence order '
        f'({LESSONS_PER_UNIT} lessons x {QUESTIONS_PER_LESSON} questions)"',
        f'icon: "{ICONS[unit_no - 1]}"',
        f'color: "{COLORS[unit_no - 1]}"',
        'targetLanguage: "en"',
        'sourceLanguage: "zh"',
        f'level: "{level}"',
        f'courseId: "{cid}"',
        'questionType: "word-order"',
        "---",
        "",
    ]
    for li in range(LESSONS_PER_UNIT):
        chunk = entries[li * QUESTIONS_PER_LESSON : (li + 1) * QUESTIONS_PER_LESSON]
        lines += [
            "---",
            f'lessonTitle: "Lesson {li + 1}: Sentence Building"',
            'description: "Arrange the word tiles into the correct order"',
            f'icon: "{ICONS[unit_no - 1]}"',
            f'color: "{COLORS[unit_no - 1]}"',
            "---",
            "",
        ]
        for qi, entry in enumerate(chunk):
            seed = (unit_no - 1) * WORDS_PER_UNIT + li * QUESTIONS_PER_LESSON + qi
            distractor = pick_distractor(entries, entry["tokens"], seed)
            lines.append(render_question(entry, distractor, missing))
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--force", action="store_true", help="overwrite existing course files"
    )
    args = parser.parse_args()

    if not TRANSLATIONS_PATH.exists():
        raise RuntimeError(
            "Missing words/sentence_translations_zh.json -- run "
            "scripts/translate-sentences.py first"
        )
    TRANSLATIONS.update(json.loads(TRANSLATIONS_PATH.read_text(encoding="utf-8")))
    print(f"translations loaded: {len(TRANSLATIONS)}")

    data = json.loads(DICT_PATH.read_text())
    skeleton_counts = count_skeletons(data)
    missing: list[str] = []
    for level in LEVELS:
        course_path = CONTENT_DIR / f"{level.lower()}-word-order-course.md"
        if course_path.exists() and not args.force:
            print(f"{level}: already exists, skipped (use --force to regenerate)")
            continue
        pool = build_pool(data, level, skeleton_counts)
        if len(pool) < TARGET_WORDS:
            raise RuntimeError(
                f"{level}: clean pool only {len(pool)} words, need {TARGET_WORDS}"
            )
        entries = pool[:TARGET_WORDS]
        course_path.write_text(render_course(level))
        for unit_no in range(1, UNITS + 1):
            chunk = entries[(unit_no - 1) * WORDS_PER_UNIT : unit_no * WORDS_PER_UNIT]
            unit_path = CONTENT_DIR / f"{level.lower()}-word-order-unit-{unit_no}.md"
            unit_path.write_text(render_unit(level, unit_no, chunk, missing))
        print(
            f"{level}: wrote 1 course + {UNITS} units, "
            f"{TARGET_WORDS} word-order questions (pool={len(pool)} words)"
        )

    if missing:
        print(f"ERROR: {len(missing)} questions fell back to word-level hints")
        for sentence in missing[:10]:
            print(f"  {sentence}")
        raise SystemExit(1)
    print("all questions use full-sentence Chinese hints")


if __name__ == "__main__":
    main()
