#!/usr/bin/env python3
"""Safely repair dictionary IPA values that exactly repeat the headword.

Uses the existing CMU-to-RP helper in fix-english-merged.py. Default mode is
report-only. --apply writes a timestamped backup before changing entries. This
is still an automatic pronunciation estimate: inspect the proposed changes,
especially names, abbreviations, and words with multiple pronunciations.

Usage:
  python3 scripts/repair-identical-ipa.py
  python3 scripts/repair-identical-ipa.py --apply
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DICT_PATH = ROOT / "words" / "english_merged.json"
HELPER_PATH = ROOT / "scripts" / "fix-english-merged.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("fix_english_merged", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load IPA helper: {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write repairs after creating a backup")
    args = parser.parse_args()

    if not DICT_PATH.exists():
        print(f"Dictionary not found: {DICT_PATH}", file=sys.stderr)
        return 1
    try:
        entries = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Cannot read dictionary JSON: {exc}", file=sys.stderr)
        return 1
    if not isinstance(entries, list):
        print("Expected dictionary JSON root to be an array.", file=sys.stderr)
        return 1

    helper = load_helper()
    cmu = helper.load_cmu()
    if not cmu:
        print("CMU pronunciation data unavailable. Install the project's cmudict Python package before retrying.", file=sys.stderr)
        return 1

    proposals = []
    for index, entry in enumerate(entries):
        word = str(entry.get("word") or "").strip()
        ipa = str(entry.get("ipa") or "").strip()
        if not word or not ipa or ipa.casefold() != word.casefold():
            continue
        proposed = helper.ipa_for_surface(word, cmu)
        if proposed and proposed.casefold() != ipa.casefold():
            proposals.append((index, word, ipa, proposed))

    print(f"Entries: {len(entries)}; identical-spelling IPA values: {sum(1 for e in entries if str(e.get('word') or '').strip() and str(e.get('ipa') or '').strip().casefold() == str(e.get('word') or '').strip().casefold())}")
    print(f"Pronunciation replacements found: {len(proposals)}")
    for index, word, old, new in proposals:
        print(f"row {index + 1}\t{word}\t{old} -> {new}")

    if not args.apply:
        print("Dry run only. Re-run with --apply to back up and write these IPA changes.")
        return 0
    if not proposals:
        print("No replacements to write.")
        return 0

    backup = DICT_PATH.with_name(
        f"{DICT_PATH.name}.bak-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )
    shutil.copy2(DICT_PATH, backup)
    for index, _word, _old, new in proposals:
        entries[index]["ipa"] = new
    DICT_PATH.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Applied {len(proposals)} IPA replacements. Original backed up to {backup.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
