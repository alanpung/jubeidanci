#!/usr/bin/env python3
"""
Rebuild the CEFR level assignment (and word_frequency rank) of
words/english_merged.json using authoritative external sources instead of the
ad-hoc levels that were baked in when the file was assembled.

Data sources
------------
1. CEFR-J vocabulary profile (A1-B2, ~7.8k entries)
   https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv
2. Octanove vocabulary profile (C1-C2, ~2.1k entries)
   https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv
3. FrequencyWords en_50k (rank order, 1 = most frequent)
   https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt

Decision order per word
-----------------------
1. Anchor hit (CEFR-J / Octanove), including spelling variants separated by "/".
2. Morphological derivation: strip English suffixes/prefixes until a stem is in
   the anchor table; derived word inherits the stem level (+1 for the more
   academic suffixes, capped at C1).
3. Frequency fallback: rank percentiles calibrated on the anchor words
   themselves, so a word the anchor lists do not know gets the level that
   anchor words of the same frequency band carry.
4. Keep the existing level (multi-word phrases and vocabulary-list entries that
   have neither an anchor nor a frequency rank).

Usage
-----
  python3 scripts/rebuild-cefr-levels.py            # dry run, prints a report
  python3 scripts/rebuild-cefr-levels.py --write    # rewrite words/english_merged.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_PATH = os.path.join(ROOT, "words", "english_merged.json")
CACHE_DIR = os.path.join(ROOT, "scripts", "data")

CEFRJ_URL = "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv"
OCTANOVE_URL = "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv"
FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"
GOOGLE_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
LEVEL_INDEX = {l: i for i, l in enumerate(LEVELS)}

POS_ALIASES = {
    "n": "noun", "v": "verb", "v1": "verb", "adj": "adjective", "a": "adjective",
    "adv": "adverb", "r": "adverb", "pron": "pronoun", "prep": "preposition",
    "conj": "conjunction", "num": "number", "numeral": "number", "art": "determiner",
    "det": "determiner", "int": "interjection", "as-is": "", "pos_edited": "",
}


def normalize_pos(pos: str) -> str:
    p = (pos or "").strip().lower()
    p = p.strip("[]")
    return POS_ALIASES.get(p, p)


def easier(a: str, b: str) -> str:
    """Return the easier (lower) of two CEFR levels."""
    if a not in LEVEL_INDEX:
        return b
    if b not in LEVEL_INDEX:
        return a
    return a if LEVEL_INDEX[a] <= LEVEL_INDEX[b] else b


def fetch(url: str, filename: str) -> str:
    """Download (once) into scripts/data and return the local path."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, filename)
    if not os.path.exists(path):
        print(f"downloading {url} …", file=sys.stderr)
        with urllib.request.urlopen(url, timeout=120) as resp:
            data = resp.read()
        with open(path, "wb") as fh:
            fh.write(data)
    return path


def load_anchor() -> tuple[dict[tuple[str, str], str], dict[str, str]]:
    """
    Returns (by_word_pos, by_word) levels from CEFR-J (A1-B2) + Octanove (C1-C2).

    A headword is listed once per part of speech, and the same spelling often
    carries an everyday sense (A1) plus a rare sense (C1) — e.g. "man" (n, A1)
    vs "man" (v, C1), "secure" (adj, B2) vs "secure" (v, C2). Because the app
    shows one entry per word, we keep the *easiest* level for the bare form and
    the exact level for a (word, pos) match.
    """
    by_word_pos: dict[tuple[str, str], str] = {}
    by_word: dict[str, str] = {}

    def ingest(path: str) -> None:
        with open(path, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                level = (row.get("CEFR") or "").upper().strip()
                if level not in LEVEL_INDEX:
                    continue
                word = row["headword"].strip().lower()
                pos = normalize_pos(row.get("pos") or "")
                key = (word, pos)
                if key in by_word_pos:
                    by_word_pos[key] = easier(by_word_pos[key], level)
                else:
                    by_word_pos[key] = level
                if word in by_word:
                    by_word[word] = easier(by_word[word], level)
                else:
                    by_word[word] = level

    ingest(fetch(CEFRJ_URL, "cefrj-vocabulary-profile-1.5.csv"))
    ingest(fetch(OCTANOVE_URL, "octanove-vocabulary-profile-c1c2-1.0.csv"))
    return by_word_pos, by_word


def load_freq() -> dict[str, int]:
    """word -> frequency rank (1 = most frequent)."""
    path = fetch(FREQ_URL, "en_50k.txt")
    ranks: dict[str, int] = {}
    with open(path, encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            parts = line.split()
            if len(parts) >= 2:
                ranks[parts[0].lower()] = i
    return ranks


# ---------------------------------------------------------------------------
# Morphology
# ---------------------------------------------------------------------------

# (suffix, replacement, level shift). Order matters: longest suffix first.
SUFFIXES: list[tuple[str, str, int]] = [
    ("izations", "ize", 1), ("isation", "ise", 1), ("ization", "ize", 1),
    ("ations", "ate", 1), ("ation", "ate", 1), ("itions", "ite", 1), ("ition", "ite", 1),
    ("ements", "e", 1), ("ement", "e", 1), ("ments", "ment", 0), ("ment", "", 1),
    ("ities", "ity", 0), ("ity", "e", 1), ("ities", "e", 1),
    ("nesses", "ness", 0), ("ness", "", 0),
    ("fully", "ful", 0), ("fulness", "ful", 0), ("lessly", "less", 0), ("lessness", "less", 0),
    ("ful", "", 0), ("less", "", 0),
    ("ously", "ous", 0), ("ousness", "ous", 0), ("ous", "", 1),
    ("ively", "ive", 0), ("iveness", "ive", 0), ("ive", "e", 1),
    ("ably", "able", 0), ("ably", "e", 1), ("ably", "", 1), ("able", "e", 1), ("able", "", 1),
    ("ibly", "ible", 0), ("ible", "e", 1), ("ible", "", 1),
    ("ally", "al", 0), ("ally", "ic", 1), ("ically", "ic", 0), ("ically", "", 1),
    ("ical", "ic", 0), ("ic", "", 1), ("al", "", 1),
    ("ance", "e", 1), ("ances", "e", 1), ("ence", "e", 1), ("ences", "e", 1),
    ("ant", "e", 1), ("ent", "e", 1),
    ("ier", "y", 0), ("iest", "y", 0), ("ily", "y", 0), ("iness", "y", 0),
    ("ly", "", 0),
    ("ers", "er", 0), ("er", "e", 0), ("er", "", 0),
    ("ors", "or", 0), ("or", "e", 0), ("or", "", 0),
    ("est", "e", 0), ("est", "", 0),
    ("ies", "y", 0),
    ("ing", "e", 0), ("ing", "", 0),
    ("ed", "e", 0), ("ed", "y", 0), ("ed", "", 0),
    ("es", "e", 0), ("es", "", 0), ("s", "", 0),
]

PREFIXES: list[tuple[str, int]] = [
    ("over", 1), ("under", 1), ("mis", 1), ("dis", 1), ("non", 1),
    ("un", 0), ("in", 1), ("im", 1), ("ir", 1), ("il", 1), ("re", 0), ("pre", 1),
]


def variants(word: str) -> list[str]:
    """All lookup forms for a dictionary entry word."""
    w = word.strip().lower()
    out = [w]
    if "/" in w:  # "airplane/aeroplane", "analyze/analyse"
        out.extend(p.strip() for p in w.split("/") if p.strip())
    return out


def stem_candidates(word: str) -> list[tuple[str, int]]:
    """Yield (candidate stem, level shift) for a single-word entry."""
    out: list[tuple[str, int]] = []

    def add(c: str, shift: int) -> None:
        if len(c) >= 3 and c != word:
            out.append((c, shift))

    # doubled consonant (running -> run, stopped -> stop)
    m = re.match(r"^(.*?)(.)\2(ed|ing|er|est)$", word)
    if m:
        add(m.group(1) + m.group(2), 0)

    for suffix, repl, shift in SUFFIXES:
        if word.endswith(suffix) and len(word) > len(suffix) + 2:
            stem = word[: -len(suffix)] + repl
            add(stem, shift)
            # "carrying" -> "carry" (y -> i before suffix)
            if stem and len(stem) >= 3:
                add(stem + "y", shift)

    for prefix, shift in PREFIXES:
        if word.startswith(prefix) and len(word) > len(prefix) + 2:
            add(word[len(prefix):], shift)

    return out


def shift_level(level: str, shift: int) -> str:
    idx = min(LEVEL_INDEX[level] + shift, LEVEL_INDEX["C1"])
    return LEVELS[idx]


def derive_level(word: str, anchor: dict[str, str]) -> tuple[str, str] | None:
    """Return (level, stem) if a morphological stem is found in the anchor."""
    best: tuple[str, str] | None = None
    for cand, shift in stem_candidates(word):
        lvl = anchor.get(cand)
        if not lvl:
            continue
        new_lvl = shift_level(lvl, shift)
        if best is None or LEVEL_INDEX[new_lvl] < LEVEL_INDEX[best[0]]:
            best = (new_lvl, cand)
    return best


# ---------------------------------------------------------------------------
# Frequency fallback
# ---------------------------------------------------------------------------

def load_google() -> dict[str, int]:
    """
    Web-frequency ranks (1 = most frequent). en_50k is from 2018 and predates
    everyday modern words — "wifi" ranks 34k there, "podcast" 23k. Anything in
    the top 5k/10k here is common enough that it cannot be C1/C2, so we use it
    as a ceiling on the assigned level.
    """
    path = fetch(GOOGLE_URL, "google-10000-english-no-swears.txt")
    ranks: dict[str, int] = {}
    with open(path, encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            w = line.strip().lower()
            if w:
                ranks[w] = i
    return ranks


def google_ceiling(google: dict[str, int], forms: list[str]) -> str | None:
    rank = None
    for f in forms:
        if f in google:
            rank = google[f] if rank is None else min(rank, google[f])
    if rank is None:
        return None
    if rank <= 5000:
        return "B1"
    if rank <= 10000:
        return "B2"
    return None


def calibrate(anchor: dict[str, str], freq: dict[str, int]) -> list[int]:
    """Rank cut-offs between levels, calibrated on anchor words."""
    buckets: dict[str, list[int]] = defaultdict(list)
    for word, level in anchor.items():
        rank = freq.get(word)
        if rank:
            buckets[level].append(rank)

    medians = []
    for level in LEVELS:
        vals = sorted(buckets[level])
        medians.append(vals[len(vals) // 2] if vals else 0)

    # boundary between two levels = midpoint of their median ranks
    cuts = []
    for a, b in zip(medians, medians[1:]):
        cuts.append(int(round((a + b) / 2)))
    return cuts


def level_from_rank(rank: int, cuts: list[int]) -> str:
    for i, cut in enumerate(cuts):
        if rank <= cut:
            return LEVELS[i]
    return "C2"


# ---------------------------------------------------------------------------
# Data hygiene
# ---------------------------------------------------------------------------

# Misspellings / non-English entries that used to sit in A1-A2. `None` drops
# the entry (either because the correct spelling is already present, or because
# the entry is not an English word at all).
CORRECTIONS: dict[str, str | None] = {
    "realy": None,        # misspelling whose definition is actually "relay"; "really" exists
    "lyin": "lying",
    "werent": "weren't",
    "tshirt": "t-shirt",
    "atleast": "at least",
    "everytime": "every time",
    "checkin": "check-in",
    "merci": None,        # French, not English
    "choc": None,         # entry carries the definition of "shock"
}


def clean_entries(words: list[dict]) -> tuple[list[dict], list[str]]:
    """Rewrite misspelled headwords and drop the invalid ones."""
    present = {w["word"].lower() for w in words}
    out: list[dict] = []
    log: list[str] = []

    for w in words:
        key = (w.get("word") or "").strip().lower()
        if key not in CORRECTIONS:
            out.append(w)
            continue

        fix = CORRECTIONS[key]
        if fix is None:
            log.append(f"dropped '{w['word']}' (invalid entry)")
            continue
        if fix.lower() in present:
            log.append(f"dropped '{w['word']}' ('{fix}' already exists)")
            continue
        log.append(f"renamed '{w['word']}' -> '{fix}'")
        w["word"] = fix
        present.add(fix.lower())
        out.append(w)

    return out, log


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="rewrite english_merged.json")
    parser.add_argument("--out", default=None, help="write to this path instead of words/english_merged.json")
    args = parser.parse_args()

    with open(WORDS_PATH, encoding="utf-8") as fh:
        words = json.load(fh)

    words, clean_log = clean_entries(words)
    if clean_log:
        print("=== data hygiene ===")
        for line in clean_log:
            print(f"  {line}")
        print()

    _anchor_pos, anchor_word = load_anchor()
    freq = load_freq()
    google = load_google()
    cuts = calibrate(anchor_word, freq)

    before = Counter(w.get("cefr_level") for w in words)
    sources = Counter()
    changes = Counter()
    examples: dict[str, list[str]] = defaultdict(list)

    new_freq_count = 0

    for w in words:
        raw = (w.get("word") or "").strip()
        key = raw.lower()
        old = w.get("cefr_level") or ""
        new = None
        source = ""

        forms = variants(key)

        # 1. anchor — the easiest level the spelling carries across all its
        #    senses. Our own `pos` field is unreliable ("time" is tagged verb),
        #    so matching on it would promote everyday words to the level of a
        #    rare sense ("time" v. = B2, "state" v. = B2).
        for v in forms:
            if v in anchor_word:
                new = anchor_word[v]
                source = "anchor"
                break
        if new is None:
            for v in forms:
                if " " in v:  # multi-word entry: fall back to its head word
                    head = v.split()[-1]
                    if head in anchor_word:
                        new = anchor_word[head]
                        source = "anchor-head"
                        break

        # 2. morphology
        if new is None and " " not in key:
            for v in forms:
                got = derive_level(v, anchor_word)
                if got:
                    new, _stem = got
                    source = "derived"
                    break

        # 3. frequency percentile
        rank = None
        for v in variants(key):
            if v in freq:
                rank = freq[v]
                break
        if rank is None and " " in key:
            rank = freq.get(key.split()[0])

        if new is None and rank:
            new = level_from_rank(rank, cuts)
            source = "frequency"

        # 4. nothing found -> keep
        if new is None:
            new = old if old in LEVEL_INDEX else "B2"
            source = "kept"

        # 5. Reconcile with frequency. CEFR-J is a Japanese textbook profile and
        #    labels a few rare-but-early-taught words (colonel, catholic, …) as
        #    A1/A2, which would pollute the beginner courses. An anchor may be
        #    one level *easier* than its frequency band, never more.
        if new is not None and rank:
            freq_level = level_from_rank(rank, cuts)
            idx = max(LEVEL_INDEX[new], LEVEL_INDEX[freq_level] - 1)
            if LEVELS[idx] != new:
                source += "+freq"
                new = LEVELS[idx]

        # 6. ceiling from modern web frequency (wifi/podcast/app …)
        ceiling = google_ceiling(google, forms)
        if ceiling:
            capped = easier(new, ceiling)
            if capped != new:
                source += "+cap"
                new = capped

        if rank is not None:
            if w.get("word_frequency") != rank:
                new_freq_count += 1
            w["word_frequency"] = rank

        w["cefr_level"] = new
        sources[source] += 1
        if new != old:
            changes[(old, new)] += 1
            if len(examples[f"{old}->{new}"]) < 6:
                examples[f"{old}->{new}"].append(raw)

    after = Counter(w.get("cefr_level") for w in words)

    print("=== sources ===")
    for k, v in sources.most_common():
        print(f"  {k:14} {v}")
    print()
    print("=== level counts (before -> after) ===")
    for lvl in LEVELS:
        print(f"  {lvl}: {before.get(lvl,0):>6} -> {after.get(lvl,0):>6}")
    print()
    print(f"=== frequency rank refreshed for {new_freq_count} entries ===")
    print(f"=== frequency cut-offs: {cuts} (A1|A2 | A2|B1 | B1|B2 | B2|C1 | C1|C2) ===")
    print()
    print("=== biggest changes ===")
    for (old, new), n in sorted(changes.items(), key=lambda kv: -kv[1])[:15]:
        print(f"  {old} -> {new}: {n}   e.g. {', '.join(examples[f'{old}->{new}'])}")

    if args.write or args.out:
        target = args.out or WORDS_PATH
        # Compact, like the original file, to keep the diff readable.
        with open(target, "w", encoding="utf-8") as fh:
            json.dump(words, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"\nwrote {target}")
    else:
        print("\n(dry run — pass --write to apply)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
