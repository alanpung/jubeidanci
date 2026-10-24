#!/usr/bin/env python3
"""Apply simplified learner glosses to words/english_merged.json.

Expects scripts/a12_gloss_map.json (A1/A2 word -> {english_translation, definition_zh}).
For B1+ entries, lightly cleans WordNet-style english_translation (max 2 senses)
and strips [计]/[医] tags from definition_zh.

Usage (from repo root):
  python3 scripts/simplify-english-dictionary.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORDS = ROOT / "words" / "english_merged.json"
MAP = Path(__file__).resolve().parent / "a12_gloss_map.json"

POS_PREFIX = re.compile(
    r"^(?:[vnarsp]\.|vt\.|vi\.|aux\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|num\.|interj\.)\s*",
    re.I,
)
QUOTE_JUNK = re.compile(r'"[^"]{8,}"')
ZH_TAG = re.compile(r"；?\s*\[(?:计|医|化|法|经|机|网络)[^\]]*\]")
SKIP_RE = re.compile(
    r"^(?:of or relating to|used (?:especially |relatively |interrogatively |elliptically )|"
    r"the syllable naming|in the historical present|primarily (?:temporal|spatial) sense)",
    re.I,
)


def simplify_wordnet(text: str, pos: str, max_senses: int = 2) -> str:
    if not text:
        return ""
    t = QUOTE_JUNK.sub("", text.strip())
    parts = [p.strip() for p in re.split(r"\s*;\s*", t) if p.strip()]
    pos_l = (pos or "").lower()
    prefer_verb = any(x in pos_l for x in ["verb", "be-verb", "have-verb", "do-verb", "modal"])
    prefer_noun = pos_l in ("noun", "n")
    prefer_adj = "adj" in pos_l or pos_l == "adjective"
    prefer_adv = "adv" in pos_l or pos_l == "adverb"
    scored = []
    for p in parts:
        raw = p
        p = POS_PREFIX.sub("", p).strip()
        p = POS_PREFIX.sub("", p).strip()
        if len(p) < 3:
            continue
        if SKIP_RE.match(p) and len(parts) > 1:
            continue
        score = 0
        rl = raw.lower()
        if rl.startswith(("v.", "vt.", "vi.")):
            score += 3 if prefer_verb else -1
        elif rl.startswith("n."):
            score += 3 if prefer_noun else (-1 if prefer_verb else 0)
        elif rl.startswith(("a.", "s.")):
            score += 3 if prefer_adj else 0
        elif rl.startswith("r."):
            score += 3 if prefer_adv else 0
        if len(p) > 120:
            score -= 1
        scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    cleaned = []
    for _, p in scored:
        if len(p) > 90:
            p = p[:87].rsplit(" ", 1)[0].rstrip(".",";") + "…"
        if p and p[0].islower():
            p = p[0].upper() + p[1:]
        cleaned.append(p)
        if len(cleaned) >= max_senses:
            break
    if not cleaned:
        p = POS_PREFIX.sub("", QUOTE_JUNK.sub("", text.strip()))
        if len(p) > 100:
            p = p[:97].rsplit(" ", 1)[0] + "…"
        if p and p[0].islower():
            p = p[0].upper() + p[1:]
        cleaned = [p]
    return "; ".join(cleaned)


def clean_zh(text: str) -> str:
    if not text:
        return ""
    t = ZH_TAG.sub("", text)
    t = re.sub(r"[；;]\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"；?\s*后端.*$", "", t)
    t = re.sub(r"；?\s*作废字符.*$", "", t)
    return t.strip(" ；;")


def main() -> int:
    if not WORDS.exists():
        print(f"Missing {WORDS}", file=sys.stderr)
        return 1
    if not MAP.exists():
        print(f"Missing {MAP}", file=sys.stderr)
        return 1
    data = json.loads(WORDS.read_text(encoding="utf-8"))
    a12 = json.loads(MAP.read_text(encoding="utf-8"))
    n_a12 = n_other = 0
    for e in data:
        w = e.get("word") or ""
        level = e.get("cefr_level")
        if level in ("A1", "A2") and w in a12:
            e["english_translation"] = a12[w]["english_translation"]
            e["definition_zh"] = a12[w]["definition_zh"]
            n_a12 += 1
        else:
            e["english_translation"] = simplify_wordnet(
                e.get("english_translation") or "", e.get("pos") or "", 2
            )
            e["definition_zh"] = clean_zh(e.get("definition_zh") or "")
            n_other += 1
    WORDS.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Updated {WORDS}")
    print(f"  A1/A2 from map: {n_a12}")
    print(f"  Other cleaned:  {n_other}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
