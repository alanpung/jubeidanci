#!/usr/bin/env python3
"""
A2 Translation Course — content renderer.

The A2 translation sentences are no longer generated procedurally. They live in
a hand-authored, topic-aligned sentence bank at:

    content-src/a2-translation/unit-{1..10}.json

Each unit file holds 10 lessons, and each lesson holds 10 Chinese→English
sentence pairs that are written specifically for that lesson's topic (so
"Train Station" sentences really talk about platforms, tickets and departures).

This script is deliberately dumb: it validates the bank and renders it into the
`content/a2-translation-unit-{1..10}.md` files consumed by the app. It never
invents a sentence.

Why this replaced scripts/generate-a2-translations.ts
-----------------------------------------------------
The old script built 990 of its 1000 sentences with `buildSentencePair()`,
which picked words out of four *generic* A1/A2 pools (PEOPLE, PLACE_ADJS,
OBJECT_ADJS, TRANSITIVE_VERBS …) by `globalIdx % pool.length` and dropped them
into fixed templates. The lesson topic was only ever used for the front-matter
`description`, never for the sentence itself — which is why a "Train Station"
lesson could contain sentences about beaches and wishes. It also had no
difficulty ceiling, so sentences drifted well past A2.

Run:  python3 scripts/generate-a2-topic-sentences.py
"""

import json
import os
import re
import sys
from typing import Dict, List

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK_DIR = os.path.join(ROOT, "content-src", "a2-translation")
CONTENT_DIR = os.path.join(ROOT, "content")

UNIT_FILES = [os.path.join(BANK_DIR, f"unit-{i}.json") for i in range(1, 11)]
WORD_RE = re.compile(r"[a-z][a-z']*")


def srs_words(sentences: List[Dict[str, str]]) -> List[str]:
    """Distinct lowercase word tokens across the answer and its alternative.

    Mirrors what the course used before: function words included, punctuation
    dropped, first-seen order preserved. These seed per-word SRS cards.
    """
    seen: Dict[str, None] = {}
    for item in sentences:
        for text in (item["en"], item.get("alt", "")):
            for token in WORD_RE.findall(text.lower()):
                seen.setdefault(token, None)
    return list(seen)


def quote(value: str) -> str:
    return '"{}"'.format(value.replace('"', '\\"'))


def render_unit(data: Dict) -> str:
    unit_num = data["unit"]
    title = data["unitTitle"]
    icon = data["icon"]
    color = data["color"]

    out = [
        "---",
        f'unitTitle: "{title}"',
        f'description: "{title} - A2 Translation Practice (Unit {unit_num}, 10 Lessons x 10 Sentences)"',
        f'icon: "{icon}"',
        f'color: "{color}"',
        'targetLanguage: "en"',
        'sourceLanguage: "zh"',
        'level: "A2"',
        'courseId: "a2-translation-course"',
        'questionType: "translation"',
        "---",
        "",
    ]

    for l_idx, lesson in enumerate(data["lessons"], start=1):
        lesson_title = lesson["title"]
        out += [
            "---",
            f'lessonTitle: "Lesson {l_idx}: {lesson_title}"',
            f'description: "Translate A2 sentences about {lesson_title}"',
            f'icon: "{icon}"',
            f'color: "{color}"',
            "---",
            "",
        ]
        blocks = []
        for s in lesson["sentences"]:
            words = " ".join(quote(w) for w in srs_words([s]))
            blocks.append(
                "\n".join(
                    [
                        "[translation]",
                        'text: "Translate this sentence into English"',
                        f'sentence: {quote(s["zh"])}',
                        f'answer: {quote(s["en"])}',
                        "acceptAlso: {}".format(quote(s["alt"]) if s.get("alt") else ""),
                        f"srsWords: {words}",
                    ]
                )
            )
        out.append("\n\n".join(blocks))
        out.append("")

    return "\n".join(out).rstrip("\n") + "\n"


def main() -> int:
    errors: List[str] = []
    total = 0

    for path in UNIT_FILES:
        if not os.path.exists(path):
            errors.append(f"missing bank file: {path}")
            continue
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        unit_num = data.get("unit")
        lessons = data.get("lessons", [])
        if len(lessons) != 10:
            errors.append(f"unit {unit_num}: expected 10 lessons, found {len(lessons)}")

        for l_idx, lesson in enumerate(lessons, start=1):
            sentences = lesson.get("sentences", [])
            if len(sentences) != 10:
                errors.append(
                    f"unit {unit_num} lesson {l_idx} ({lesson.get('title')}): "
                    f"expected 10 sentences, found {len(sentences)}"
                )
            answers = []
            for s in sentences:
                if not s.get("zh") or not s.get("en"):
                    errors.append(f"unit {unit_num} lesson {l_idx}: empty zh/en pair")
                    continue
                if s["en"] in answers:
                    errors.append(f"unit {unit_num} lesson {l_idx}: duplicate answer '{s['en']}'")
                answers.append(s["en"])
                if s.get("alt") and s["alt"] == s["en"]:
                    errors.append(f"unit {unit_num} lesson {l_idx}: alt duplicates answer '{s['en']}'")
            total += len(sentences)

        out_path = os.path.join(CONTENT_DIR, f"a2-translation-unit-{unit_num}.md")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(render_unit(data))
        print(f"wrote {out_path}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"Rendered {total} topic-aligned A2 sentences across 10 units.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
