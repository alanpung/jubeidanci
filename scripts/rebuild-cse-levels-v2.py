#!/usr/bin/env python3
"""Recompute CSE 1-9 levels for every word in english_merged.json.

CSE 1-9 now mirrors the domestic exam ladder instead of the previous
CEFR-derived buckets. The lookup priority is lowest-exam-wins (a word
that appears in both the 小学 list and the 高考 list is taught at the
小学 level, i.e. CSE 2).

  CSE 1 → A1 words that are NOT in any of the 6 domestic lists
  CSE 2 → 小学 (mahavivo/english-wordlists 小学英语大纲词汇)
  CSE 3 → 初中 / 中考 (mahavivo/english-wordlists 中考英语词汇表)
  CSE 4 → 高中 / 高考 (mahavivo/english-wordlists Highschool_edited)
  CSE 5 → 大学英语四级 (mahavivo/english-wordlists CET4_edited)
  CSE 6 → 大学英语六级 (mahavivo/english-wordlists CET6_edited)
  CSE 7 → 英语专业八级 (mahavivo/english-wordlists 英语专业星标八级词汇)
  CSE 8 → CEFR C1 (Octanove vocabulary profile)
  CSE 9 → CEFR C2 (Octanove vocabulary profile)
  (no match) → CEFR fallback A1→1 A2→2 B1→3 B2→4 C1→5 C2→6

CEFR levels (A1-C2) are untouched. This script only rewrites the
`cse_level` field of every entry in `words/english_merged.json`.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
DICT = ROOT / "words" / "english_merged.json"
DATA = ROOT / "scripts" / "data"
CSE = DATA / "cse"
OCTANOVE = DATA / "octanove-vocabulary-profile-c1c2-1.0.csv"

# ---- Headword extraction ------------------------------------------------

_NON_WORD = re.compile(r"[^a-z']+")
_LEADING_BANG = re.compile(r"^[*★\s]+")
_TRAILING_NOTE = re.compile(r"\s+\d+\s*$")
_ZH_RANGE = re.compile(r"[\u4e00-\u9fff]")


def normalize(token: str) -> str:
    """Lowercase, drop punctuation, keep internal apostrophes."""
    if not token:
        return ""
    t = token.strip().lower()
    t = _LEADING_BANG.sub("", t)
    t = _TRAILING_NOTE.sub("", t)
    t = t.split()[0] if t else ""
    t = t.strip(".,;:!?()[]{}<>\"'`~*/")
    return t


def extract_plain(text: str) -> set[str]:
    """小学 + 高考: one word per line, possibly with leading '*'."""
    out: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or _ZH_RANGE.search(line):
            continue
        w = normalize(line)
        if w and _NON_WORD.sub("", w) == w and w.replace("'", "").isalpha() or ("'" in w and w.replace("'", "").isalpha()):
            out.add(w)
    return out


def extract_marked(text: str) -> set[str]:
    """中考 / CET4 / CET6 / 专八: 'word [ipa] pos. def', sometimes 'word1, word2 [ipa]'.
    Lines frequently contain Chinese on the same line. Trim at the first
    Chinese character (or first '['), then split comma-separated headwords.
    """
    out: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # take only the headword region: stop at first '[' or first Chinese
        head_region = line
        bracket = head_region.find("[")
        zh = _ZH_RANGE.search(head_region)
        cut = bracket if bracket != -1 else -1
        if zh:
            cut = min(cut, zh.start()) if cut != -1 else zh.start()
        if cut != -1:
            head_region = head_region[:cut]
        # split on commas
        for chunk in head_region.split(","):
            w = normalize(chunk)
            if not w:
                continue
            core = w.replace("'", "")
            if core.isalpha() and len(core) >= 1:
                out.add(w)
    return out


def load_octanove() -> tuple[set[str], set[str]]:
    c1: set[str] = set()
    c2: set[str] = set()
    with OCTANOVE.open() as f:
        next(f)  # header
        for line in f:
            parts = line.rstrip("\n").split(",")
            if len(parts) < 3:
                continue
            head, pos, cefr = parts[0].strip().lower(), parts[1].strip().lower(), parts[2].strip().upper()
            head = normalize(head)
            if not head:
                continue
            core = head.replace("'", "")
            if not core.isalpha():
                continue
            if cefr == "C1":
                c1.add(head)
            elif cefr == "C2":
                c2.add(head)
    return c1, c2


# ---- Mapping table ------------------------------------------------------

PRIMARY = [
    (2, "小学", CSE / "小学英语大纲词汇.txt", "plain"),
    (3, "初中", CSE / "中考英语词汇表.txt", "marked"),
    (4, "高中", CSE / "Highschool_edited.txt", "plain"),
    (5, "CET-4", CSE / "CET4_edited.txt", "marked"),
    (6, "CET-6", CSE / "CET6_edited.txt", "marked"),
    (7, "专八", CSE / "英语专业星标八级词汇.txt", "marked"),
]

CEFR_FALLBACK = {
    "A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6,
}


def main() -> int:
    # Build per-level membership sets
    levels: dict[int, set[str]] = {}
    print("Loading domestic exam wordlists …")
    for cse, label, path, mode in PRIMARY:
        text = path.read_text(encoding="utf-8", errors="replace")
        words = extract_plain(text) if mode == "plain" else extract_marked(text)
        levels[cse] = words
        print(f"  CSE {cse} ({label:>4}): {len(words):>5} headwords  ← {path.name}")

    print("Loading Octanove C1/C2 …")
    c1, c2 = load_octanove()
    levels[8] = c1
    levels[9] = c2
    print(f"  CSE 8 (C1  ): {len(c1):>5} headwords  ← octanove")
    print(f"  CSE 9 (C2  ): {len(c2):>5} headwords  ← octanove")

    # Build priority assignment: lowest-exam-wins
    cse_of: dict[str, int] = {}
    for cse in sorted(levels.keys()):
        for w in levels[cse]:
            cse_of.setdefault(w, cse)  # keep the smallest (first assigned)

    print(f"\nTotal unique words covered by exam lists: {len(cse_of)}")
    by_level = Counter(cse_of.values())
    for cse in sorted(by_level):
        print(f"  CSE {cse}: {by_level[cse]:>5}")

    # Load dictionary
    print(f"\nLoading {DICT} …")
    with DICT.open() as f:
        words = json.load(f)
    print(f"  {len(words)} entries")

    # Patch cse_level
    updated = 0
    same = 0
    old_dist = Counter()
    new_dist = Counter()
    fallback = 0
    for entry in words:
        old = entry.get("cse_level")
        w = (entry.get("word") or "").strip().lower()
        if w in cse_of:
            new = cse_of[w]
        else:
            cefr = (entry.get("cefr_level") or "").upper().strip()
            new = CEFR_FALLBACK.get(cefr, 1)  # unknowns default to CSE 1
            if w not in cse_of:
                fallback += 1
        if old != new:
            entry["cse_level"] = new
            updated += 1
        else:
            same += 1
        old_dist[old] += 1
        new_dist[new] += 1

    print(f"\nRewrote cse_level for {updated} entries ({same} already matched).")
    print(f"Used CEFR fallback for {fallback} entries (not in any exam list).")

    print("\nCSE level distribution after rebuild:")
    for cse in sorted(new_dist):
        before = old_dist.get(cse, 0)
        after = new_dist[cse]
        delta = after - before
        sign = "+" if delta >= 0 else ""
        print(f"  CSE {cse}: {after:>5}  (was {before:>5}, {sign}{delta})")

    # Save back
    print(f"\nWriting {DICT} …")
    with DICT.open("w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
