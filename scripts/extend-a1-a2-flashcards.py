#!/usr/bin/env python3
"""Extend the A1 and A2 flashcard decks to match every word in the dictionary
at that level that wasn't already in the deck.

The bundled dictionary has more entries at A1/A2 than the original
1000-word deck held, so the existing 10 units feel like a sample of the
level rather than the full level. This script doesn't reorganise the existing
10 units; it appends new unit files so every level is up to 1,082 / 1,484
words, matching the dictionary counts at the time CEFR was rebuilt.

Layout chosen so each existing unit stays untouched and each new unit lands
on a tidy per-lesson grid where possible:

  * A1: 10 x (10 lessons x 10 words) + 1 x (8 lessons x 10 + 1 lesson x 2)
        = 1,000 + 82 = 1,082
  * A2: 10 x (10 lessons x 10 words) + 4 x (10 lessons x 10) + 1 x (8x10+4)
        = 1,000 + 400 + 84 = 1,484

Words already in the deck are not touched. Words newly added are picked
from the dictionary pool (CEFR = level, useful_for_flashcard != false,
not blocklisted), scored against the unit's theme so a "Food" unit gets
food words, and ranked by web frequency inside that bucket.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys as _sys
import importlib.util
from collections import Counter, defaultdict

# Import the shared helpers (parsing, theme scoring, blocklist) from the
# existing realignment script so we don't fork the conventions.
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
WORDS_PATH = os.path.join(ROOT, "words", "english_merged.json")
CONTENT_DIR = os.path.join(ROOT, "content")

_sys.path.insert(0, HERE)

_spec = importlib.util.spec_from_file_location(
    "realign_flashcard_levels",
    os.path.join(HERE, "realign-flashcard-levels.py"),
)
_realign = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_realign)  # type: ignore[union-attr]

BLOCKLIST = _realign.BLOCKLIST
THEME_KEYWORDS = _realign.THEME_KEYWORDS
TITLE_THEME_HINTS = _realign.TITLE_THEME_HINTS
NO_THEME_TITLES = _realign.NO_THEME_TITLES
theme_for_title = _realign.theme_for_title
theme_score = _realign.theme_score
parse_unit = _realign.parse_unit
render_unit = _realign.render_unit


# ---------------------------------------------------------------------------
# Plan: which units to add and with what cards
# ---------------------------------------------------------------------------

# (level, target_total, new_unit_specs) where each new_unit_spec is
# (target_words, theme_hint, icon, color)
PLAN = {
    "A1": {
        "target": 1082,
        "course": "a1-flashcard-course",
        "new_units": [
            # 82 words = 8 lessons × 10 words + 1 lesson × 2 words
            {"count": 82, "lessons": [(10, 8), (2, 1)],
             "theme": "everyday", "icon": "🌟", "color": "#FF9800"},
        ],
    },
    "A2": {
        "target": 1484,
        "course": "a2-flashcard-course",
        "new_units": [
            # 4 x 100-word units (full 10 lessons × 10 words)
            {"count": 100, "lessons": [(10, 10)],
             "theme": "travel", "icon": "✈️", "color": "#03A9F4"},
            {"count": 100, "lessons": [(10, 10)],
             "theme": "food", "icon": "🍽️", "color": "#FF7043"},
            {"count": 100, "lessons": [(10, 10)],
             "theme": "health", "icon": "💚", "color": "#43A047"},
            {"count": 100, "lessons": [(10, 10)],
             "theme": "work", "icon": "💼", "color": "#5E35B1"},
            # 84-word tail (8 × 10 + 1 × 4)
            {"count": 84, "lessons": [(10, 8), (4, 1)],
             "theme": "everyday", "icon": "🌐", "color": "#26A69A"},
        ],
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def pool_for(level: str) -> list[dict]:
    """All dictionary entries at this CEFR level that are usable & pronounceable."""
    with open(WORDS_PATH, encoding="utf-8") as fh:
        words = json.load(fh)
    out = []
    for w in words:
        if (w.get("cefr_level") or "").upper() != level:
            continue
        if w.get("useful_for_flashcard") is False:
            continue
        if not w.get("word"):
            continue
        if not w.get("english_translation"):
            continue
        key = w["word"].strip().lower()
        if not key or " " in key or len(key) < 2:
            continue
        if key in BLOCKLIST:
            continue
        out.append(w)
    return out


def existing_fronts(level: str) -> set[str]:
    fronts = set()
    files = sorted(glob.glob(os.path.join(CONTENT_DIR, f"{level.lower()}-flashcard-unit-*.md")))
    for f in files:
        _, lessons = parse_unit(f)
        for _, cards in lessons:
            for c in cards:
                fronts.add(c["front"].strip().lower())
    return fronts


def available_words(level: str) -> list[dict]:
    fronts = existing_fronts(level)
    pool = pool_for(level)
    return [w for w in pool if w["word"].strip().lower() not in fronts]


def rank_within_pool(pool: list[dict]) -> list[dict]:
    """Sort by web-frequency rank ascending (more frequent first)."""
    return sorted(pool, key=lambda w: (w.get("word_frequency") or 10**9, w["word"].lower()))


def pick_for_theme(pool: list[dict], theme: str, count: int) -> list[dict]:
    """Rank pool by (theme_score desc, frequency asc) and return top `count`."""
    scored = [(theme_score(w, theme), w) for w in pool]
    scored.sort(key=lambda pair: (-pair[0], pair[1].get("word_frequency") or 10**9,
                                  pair[1]["word"].lower()))
    return [w for _, w in scored[:count]]


def to_card(w: dict) -> dict:
    meaning = (w.get("english_translation") or w.get("definition_zh") or "").strip()
    translation = (w.get("definition_zh") or w.get("english_translation") or "").strip()
    if not meaning:
        meaning = (w.get("english_translation") or "").strip()
    return {
        "front": w["word"],
        "meaning": meaning.replace("\n", " ").replace('"', '\\"'),
        "translation": translation.replace("\n", " ").replace('"', '\\"'),
        "srsWords": w["word"],
    }


def plan_lessons(lessons_spec: list[tuple[int, int]]) -> list[int]:
    """Expand a lesson spec like [(10, 8), (2, 1)] -> [10,10,...,10,2]."""
    out = []
    for size, reps in lessons_spec:
        out.extend([size] * reps)
    return out


def render_new_unit(level: str, course_id: str, unit_idx: int,
                    title: str, lessons_spec: list[tuple[int, int]],
                    icon: str, color: str, pool: list[dict]) -> tuple[str, list[dict]]:
    """Render a new unit file's body and return (text, picked_cards)."""
    lesson_sizes = plan_lessons(lessons_spec)
    total = sum(lesson_sizes)
    theme = theme_for_title(title) or "everyday"

    # Pick top `total` words for the theme.
    picked = pick_for_theme(pool, theme, total)

    out = []
    out.append("---\n")
    out.append(
        f'unitTitle: "Unit {unit_idx}: {title}"\n'
        f'description: "{title} - {total} {level} Flashcard Vocabulary Words"\n'
        f'icon: "{icon}"\n'
        f'color: "{color}"\n'
        f'targetLanguage: "en"\n'
        f'sourceLanguage: "en"\n'
        f'level: "{level}"\n'
        f'courseId: "{course_id}"\n'
        f'questionType: "flashcard-review"\n'
        f"---\n\n"
    )

    idx = 0
    for li, size in enumerate(lesson_sizes, start=1):
        title_part = " ".join(title.lower().split()[0:3])
        out.append("---\n")
        out.append(
            f'lessonTitle: "Lesson {li}: {title} Part {li}"\n'
            f'description: "Practice {size} key vocabulary flashcards for {title} Part {li}"\n'
            f'icon: "{icon}"\n'
            f'color: "{color}"\n'
            f"---\n"
        )
        for _ in range(size):
            if idx >= len(picked):
                break
            card = to_card(picked[idx])
            out.append(
                "[flashcard-review]\n"
                f'front: "{card["front"]}"\n'
                f'meaning: "{card["meaning"]}"\n'
                f'translation: "{card["translation"]}"\n'
                f'srsWords: "{card["srsWords"]}"\n\n'
            )
            idx += 1
    text = "".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text).rstrip() + "\n"
    return text, picked


def theme_label(theme: str) -> str:
    titles = {
        "everyday": "Everyday Vocabulary",
        "family": "People & Relationships",
        "food": "Food & Dining",
        "school": "Education & Learning",
        "work": "Work & Career",
        "travel": "Travel & Places",
        "time": "Time, Calendar & Weather",
        "shop": "Shopping & Money",
        "health": "Health & Body",
        "nature": "Nature & Environment",
        "society": "Society & Public Life",
        "science": "Science & Discovery",
        "media": "Media & Communication",
        "culture": "Arts & Culture",
        "mind": "Mind & Behaviour",
        "econ": "Economy & Finance",
        "academic": "Academic Thought",
    }
    return titles.get(theme, "Vocabulary Expansion")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    for level, plan in PLAN.items():
        existing_files = sorted(
            glob.glob(os.path.join(CONTENT_DIR, f"{level.lower()}-flashcard-unit-*.md"))
        )
        n_existing = len(existing_files)
        last_unit_num = n_existing
        n_target = plan["target"]
        course_id = plan["course"]

        # Words in deck vs target
        pool = available_words(level)
        taken = 0
        for f in existing_files:
            _, lessons = parse_unit(f)
            for _, cards in lessons:
                taken += len(cards)
        n_to_add = n_target - taken
        print(f"\n{level}: {taken} existing, {len(pool)} available, "
              f"need {n_to_add} more to reach {n_target}")

        # Drain pool into new units in order
        used_pool = 0
        for ui, spec in enumerate(plan["new_units"]):
            unit_idx = last_unit_num + ui + 1
            title = theme_label(spec["theme"]) + " (Extra)"
            unit_text, picked = render_new_unit(
                level=level,
                course_id=course_id,
                unit_idx=unit_idx,
                title=title,
                lessons_spec=spec["lessons"],
                icon=spec["icon"],
                color=spec["color"],
                pool=pool[used_pool:],
            )
            used_pool += len(picked)

            path = os.path.join(
                CONTENT_DIR, f"{level.lower()}-flashcard-unit-{unit_idx}.md"
            )
            if args.write:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(unit_text)
            print(f"  + new unit {unit_idx}: {title} "
                  f"({len(picked)} words) -> {os.path.basename(path)}")

        # Update course description
        course_path = os.path.join(CONTENT_DIR, f"{level.lower()}-flashcard-course.md")
        if args.write and os.path.exists(course_path):
            content = open(course_path, encoding="utf-8").read()
            course_title = {
                "A1": "Comprehensive A1 Elementary Flashcard Vocabulary Course with "
                       f"11 Units (1,082 Words total) by Alan P",
                "A2": "Comprehensive A2 Pre-Intermediate Flashcard Vocabulary Course with "
                       f"15 Units (1,484 Words total) by Alan P",
            }[level]
            content = re.sub(
                r"(?<=courseTitle: ).*",
                lambda _m: '"' + (
                    {"A1": "A1 Flashcard",
                     "A2": "A2 Flashcard"}[level]
                ) + '"',
                content, count=1,
            )
            content = re.sub(
                r"(?<=description: ).*",
                lambda _m: f'"{course_title}"',
                content, count=1,
            )
            with open(course_path, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"  ! updated course description: {course_title}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
