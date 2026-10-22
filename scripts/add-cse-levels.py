#!/usr/bin/env python3
"""Assign a China Standards of English (CSE) level to every word in
``words/english_merged.json``.

CSE levels (China's national English scale, GF 0018-2018) define the
vocabulary bands: 1 ≤ 1000, 2 ≤ 2000, 3 ≤ 3500, 4 ≤ 4500, 5 ≤ 6500,
6 ≤ 8000, 7 ≤ 11000, 8 ≤ 15000, 9 ≥ 15001 words. The bundled CEFR mapping
is used as the **anchor** so basic classroom vocabulary doesn't get
demoted by a noisy web frequency ranking:

    A1 -> CSE 2   (with the very top 10% most-frequent anchors promoted to CSE 1)
    A2 -> CSE 3
    B1 -> CSE 4
    B2 -> CSE 5
    C1 -> CSE 6
    C2 -> CSE 7  (last 30% by frequency in C2 split into CSE 8 / CSE 9)

The function is a *fixed table* — the only inputs are (cefr, word_frequency
percentile within the CEFR bucket). It does not pull from any external list.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
WORDS_PATH = os.path.normpath(os.path.join(HERE, "..", "words", "english_merged.json"))

# Anchor table — the simplest CEFR -> CSE map that matches the user's table
# (A1 ≈ CSE 2, A2 ≈ CSE 3, B1 ≈ CSE 4, B2 ≈ CSE 5, C1 ≈ CSE 6, C2 ≈ CSE 7/8/9).
CEFR_TO_CSE = {
    "A1": "2",
    "A2": "3",
    "B1": "4",
    "B2": "5",
    "C1": "6",
    "C2": "7",
}

VALID_CSE = {str(n) for n in range(1, 10)} | {"?"}


def cse_for(cefr: str, freq_pct_within_cefr: float | None) -> str:
    """CSE level for a word given its CEFR bucket and its frequency
    percentile *within* that bucket (lower = more frequent).
    """
    if cefr not in CEFR_TO_CSE:
        return "?"
    base = CEFR_TO_CSE[cefr]

    if cefr == "A1" and freq_pct_within_cefr is not None and freq_pct_within_cefr < 0.10:
        # The ten most-frequent A1 anchors (a, the, be, …) are foundational
        # enough to be CSE 1.
        return "1"

    if cefr == "C2":
        if freq_pct_within_cefr is None:
            return base
        # Tail of C2 is split between CSE 8 (advanced) and CSE 9 (mastery).
        if freq_pct_within_cefr > 0.85:
            return "9"
        if freq_pct_within_cefr > 0.65:
            return "8"

    return base


def precompute_pct_table(words: list[dict]) -> dict[str, dict[float, float]]:
    """Per CEFR bucket, percentile position (0..1) -> freq value, so we
    can map a word's frequency to its position in O(log n).
    """
    by_cefr: dict[str, list[float]] = defaultdict(list)
    for w in words:
        f = w.get("word_frequency")
        if isinstance(f, (int, float)) and (w.get("cefr_level") in CEFR_TO_CSE):
            by_cefr[w["cefr_level"]].append(f)

    table: dict[str, dict[float, float]] = {}
    for lvl, freqs in by_cefr.items():
        freqs_sorted = sorted(freqs)
        n = len(freqs_sorted)
        # freq_pct -> freq_value lookup: percent of words with frequency below this value
        table[lvl] = {freq: i / max(1, n - 1) for i, freq in enumerate(freqs_sorted)}
    return table


def pct_for(freq: float | None, bucket: dict[float, float] | None) -> float | None:
    if freq is None or not bucket:
        return None
    keys = list(bucket.keys())
    # binary search would be cleaner, but n is small.
    keys_sorted = sorted(keys)
    # nearest value lookup
    lo, hi = 0, len(keys_sorted) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if keys_sorted[mid] < freq:
            lo = mid + 1
        else:
            hi = mid
    return bucket[keys_sorted[lo]]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="rewrite english_merged.json")
    parser.add_argument("--out", help="write to this file instead of --write target (for preview)")
    args = parser.parse_args()

    with open(WORDS_PATH, encoding="utf-8") as fh:
        words = json.load(fh)

    pct_table = precompute_pct_table(words)
    counts: dict[str, int] = defaultdict(int)
    unknown = 0

    for w in words:
        cefr = w.get("cefr_level")
        freq = w.get("word_frequency")
        pct = pct_for(freq, pct_table.get(cefr))
        cse = cse_for(cefr, pct)
        counts[cse] += 1
        w["cse_level"] = cse
        if cse == "?":
            unknown += 1

    print("CSE distribution:")
    for k in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "?"]:
        if counts[k]:
            bar = "█" * (counts[k] // 50)
            print(f"  CSE {k:>2}: {counts[k]:>5}  {bar}")
    print(f"  total: {sum(counts.values())}  unknown: {unknown}")

    # Sample sanity look
    print("\nSpot-check:")
    for sample in [
        "a", "the", "be", "have", "do", "yes", "no",
        "happy", "study", "travel",
        "achieve", "consider", "responsibility",
        "consequence", "substantial",
        "deliberate", "notwithstanding",
        "antediluvian", "pulchritudinous",
    ]:
        hits = [w for w in words if w["word"].lower() == sample]
        if hits:
            w = hits[0]
            print(f"  {sample:22} CEFR {w['cefr_level']:>3}  rank {w.get('word_frequency'):>6}  CSE {w['cse_level']}")

    target = args.out or WORDS_PATH
    if args.write or args.out:
        with open(target, "w", encoding="utf-8") as fh:
            json.dump(words, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"\nwrote {target}")
    else:
        print("\n(dry run — pass --write or --out FILE to apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
