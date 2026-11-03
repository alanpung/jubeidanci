#!/usr/bin/env python3
"""
Resolve inflected English words to their base (lemma) form.

Two jobs:

  1. content/*.md  — every `srsWords:` value must name the base form, so a
     course's SRS deck holds "brush", not "brushes".

  2. words/english_merged.json — the dictionary only needs the base form. The
     inflected entries that were added purely to satisfy a course's srsWords
     are redundant once the course points at the base form, so they go.

How the base form is found
--------------------------
lemminflect carries a full English inflection table, so it knows that
"brushes" is the plural of "brush", "children" the plural of "child" and
"coding" the gerund of "code" (never of "cod", which is a fish). The lemma it
proposes is accepted only when it is a real headword of the dictionary, and
the surface form itself is left alone when it is already a headword — "left",
"found" and "thought" have their own dictionary entries and their own meanings.

Why two passes
--------------
The dictionary repair script added course vocabulary to english_merged.json,
including inflected forms ("brushes"). Those additions must be classified
BEFORE the content files are rewritten, because a course's srsWords are
rewritten against the final dictionary — otherwise "brushes" would still look
like a headword and would never be rewritten.

  Pass 1  classify the added entries against the ORIGINAL dictionary:
          inflection (drop) or genuine vocabulary (keep).
  Pass 2  build the final headword set and the reverse inflection map.
  Pass 3  rewrite every `srsWords:` value in content/*.md.
  Pass 4  rewrite the local SRS card store.

Usage:
  python3 scripts/resolve-lemmas.py            # report only, nothing written
  python3 scripts/resolve-lemmas.py --apply    # write the changes
"""

import json
import os
import re
import sys

import lemminflect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DICT_PATH = os.path.join(ROOT, "words", "english_merged.json")
CONTENT_DIR = os.path.join(ROOT, "content")
CARDS_PATH = os.path.join(ROOT, "data", "srs-cards.json")

APPLY = "--apply" in sys.argv

_UPOS = ("NOUN", "VERB", "ADJ", "ADV")

# Words that end in "s" but are not plurals. Lemminflect already knows most of
# these, but the list keeps the resolver honest for the odd ones.
_NEVER_LEMMATISE = {
    "as", "was", "his", "has", "gas", "bus", "plus", "us", "less",
    "class", "glass", "grass", "press", "dress", "cross", "boss", "loss",
    "miss", "pass", "mass", "news", "series", "species", "always",
    "perhaps", "unless", "across", "bias", "atlas", "canvas", "chaos",
    "crisis", "axis", "basis", "thesis", "analysis", "this", "yes", "iris",
    "virus", "campus", "bonus", "focus", "status", "temper", "winter",
    "summer", "corner", "power", "number", "paper", "water", "matter",
    "order", "offer", "after", "over", "under", "ever", "never", "either",
    "neither", "ago", "echo", "hero", "piano", "photo", "radio", "zero",
    "silo", "solo", "halo", "memo", "logo", "demo", "auto", "info", "euro",
    "cello", "tempo", "todo", "saga", "visa", "cola", "area", "idea",
    "data", "beta", "eta", "iota", "omega", "alfa", "dice", "index",
    "matrix", "appendix", "hypothesis", "synthesis", "prognosis", "means",
    "physics", "politics", "ethics", "gymnastics", "linguistics",
    "economics", "mathematics", "statistics", "athletics", "measles",
    "mumps", "rabies", "herpes", "diabetes", "business", "address",
    "process", "access", "success", "progress", "express", "impress",
    "possess", "discuss", "witness", "its", "is", "does", "has", "was",
    "worse", "worst", "less", "much", "many", "such", "each", "both",
    "yes", "plus", "thus", "plus",
}


def lemma_candidates(word):
    """Every base form lemminflect proposes for `word`."""
    out = []
    for upos in _UPOS:
        try:
            found = lemminflect.getAllLemmas(word, upos=upos)
        except Exception:
            continue
        for values in found.values():
            for v in values:
                v = (v or "").lower().strip()
                if v and v not in out:
                    out.append(v)
    return out


def build_reverse_map(headwords):
    """
    surface form -> base form, for every headword that can inflect to it.

    Only a headword that actually produces the surface form may claim it, so
    "coding" can only be claimed by "code" and never by "cod".
    """
    reverse = {}
    for hw in sorted(headwords):
        if not re.fullmatch(r"[a-z][a-z'-]*", hw):
            continue
        for upos in _UPOS:
            try:
                table = lemminflect.getAllInflections(hw, upos=upos)
            except Exception:
                continue
            for forms in table.values():
                for form in forms:
                    f = form.lower().strip()
                    if not f or f == hw:
                        continue
                    reverse.setdefault(f, hw)
    return reverse


def resolve_lemma(word, headwords, reverse):
    """
    The base form of `word`, or None when it is already a base form.

    Multi-word phrases and hyphenated compounds are never inflections, and a
    word that is its own dictionary headword is left alone.
    """
    w = (word or "").lower().strip()
    if not w:
        return None
    if " " in w or "-" in w:
        return None
    if not re.fullmatch(r"[a-z][a-z']*", w):
        return None
    if w in _NEVER_LEMMATISE:
        return None
    if w in headwords:
        return None
    for cand in lemma_candidates(w):
        if cand != w and cand in headwords:
            return cand
    base = reverse.get(w)
    if base and base != w:
        return base
    return None


def main():
    with open(DICT_PATH, encoding="utf-8") as fh:
        entries = json.load(fh)

    # The dictionary as it shipped before the course-vocabulary repair, used
    # as the reference set of genuine headwords.
    original = json.load(open("/tmp/eng_orig.json", encoding="utf-8"))
    original_words = {str(e.get("word", "")).lower().strip() for e in original}
    original_words.discard("")

    current_words = {str(e.get("word", "")).lower().strip() for e in entries}
    current_words.discard("")

    added = [e for e in entries
             if str(e.get("word", "")).lower().strip() not in original_words]

    # --- Pass 1: classify the added entries --------------------------------
    original_reverse = build_reverse_map(original_words)

    drop = []          # inflected forms -> the base form that covers them
    keep = []          # genuine vocabulary the dictionary was missing
    for e in added:
        w = str(e.get("word", "")).lower().strip()
        base = resolve_lemma(w, original_words, original_reverse)
        if base:
            drop.append((str(e.get("word", "")), base))
        else:
            keep.append(e)

    print(f"dictionary entries: {len(entries)}")
    print(f"  added by the course-vocabulary repair: {len(added)}")
    print(f"    inflected forms (dropped):  {len(drop)}")
    print(f"    genuine vocabulary (kept):  {len(keep)}")

    # --- Pass 2: the final headword set ------------------------------------
    final_words = set(original_words)
    for e in keep:
        final_words.add(str(e.get("word", "")).lower().strip())
    final_reverse = build_reverse_map(final_words)

    # --- Pass 3: rewrite the course catalog --------------------------------
    def tokens_of(line):
        """Every srsWords token on a line, across all quoted segments.

        Content uses two quoting styles:
            srsWords: "wake"                 -> one segment, one token
            srsWords: "my" "name" "called"   -> three segments, three tokens
        Both must be handled; an earlier version only captured the first
        quoted segment, so every later token of a multi-quote line (e.g.
        "called", "years", "cats") was never lemmatised.
        """
        m = re.match(r'^srsWords\s*:\s*(.*)$', line)
        if not m:
            return []
        rest = m.group(1)
        segs = re.findall(r'"([^"]*)"', rest)
        if segs:
            toks = []
            for s in segs:
                toks.extend(s.split())
            return toks
        return rest.split()

    def rewrite_line(line, mapping):
        m = re.match(r'^(\s*srsWords\s*:\s*)(.*)$', line)
        prefix, rest = m.group(1), m.group(2)

        def _seg(segmatch):
            words = segmatch.group(1).split()
            out = [mapping.get(w.lower(), w) for w in words]
            return '"' + " ".join(out) + '"'

        if '"' in rest:
            new_rest = re.sub(r'"([^"]*)"', _seg, rest)
        else:
            words = rest.split()
            new_rest = " ".join(mapping.get(w.lower(), w) for w in words)
        return prefix + new_rest

    hits = []
    for fn in sorted(os.listdir(CONTENT_DIR)):
        if not fn.endswith(".md"):
            continue
        text = open(os.path.join(CONTENT_DIR, fn), encoding="utf-8").read()
        for line in text.splitlines():
            if not re.match(r'^srsWords\s*:', line):
                continue
            for w in tokens_of(line):
                base = resolve_lemma(w, final_words, final_reverse)
                if base:
                    hits.append({"file": fn, "word": w, "base": base})

    print(f"\nsrsWords values needing a rewrite: {len(hits)}")
    print(f"  distinct words: {len({h['word'] for h in hits})}")

    # Every rewritten word must resolve to a real dictionary headword, or the
    # SRS card would lose its definition.
    unresolved = [h for h in hits if h["base"] not in final_words]
    if unresolved:
        print(f"  !! {len(unresolved)} rewrites point at a missing headword")
        for h in unresolved[:10]:
            print(f"     {h['word']} -> {h['base']}")

    # --- Pass 4: the local SRS card store ----------------------------------
    card_changes = []
    if os.path.exists(CARDS_PATH):
        cards = json.load(open(CARDS_PATH, encoding="utf-8"))
        for c in cards:
            w = str(c.get("word", "")).lower().strip()
            base = resolve_lemma(w, final_words, final_reverse)
            if base:
                card_changes.append({"from": w, "to": base, "status": c.get("status")})
        print(f"\nlocal SRS cards needing a rewrite: {len(card_changes)}")

    if not APPLY:
        print("\n(dry run — pass --apply to write)")
        with open("/tmp/lemma-plan.json", "w", encoding="utf-8") as fh:
            json.dump({"drop": drop, "keep": [e["word"] for e in keep],
                       "srsWordHits": hits, "cardChanges": card_changes}, fh, indent=1)
        print("wrote /tmp/lemma-plan.json")
        return

    # --- write the dictionary ----------------------------------------------
    kept_words = {str(e.get("word", "")).lower().strip() for e in keep}
    new_entries = [e for e in entries
                    if str(e.get("word", "")).lower().strip() in original_words
                    or str(e.get("word", "")).lower().strip() in kept_words]
    with open(DICT_PATH, "w", encoding="utf-8") as fh:
        json.dump(new_entries, fh, ensure_ascii=False, indent=2)
    print(f"\nwrote {len(new_entries)} entries -> {DICT_PATH}")

    # --- write the course catalog ------------------------------------------
    by_file = {}
    for h in hits:
        by_file.setdefault(h["file"], {})[h["word"].lower()] = h["base"]

    rewritten_files = 0
    for fn, mapping in by_file.items():
        path = os.path.join(CONTENT_DIR, fn)
        lines = open(path, encoding="utf-8").read().splitlines()
        new_lines = []
        changed = False
        for line in lines:
            if re.match(r'^srsWords\s*:', line):
                nl = rewrite_line(line, mapping)
                if nl != line:
                    changed = True
                new_lines.append(nl)
            else:
                new_lines.append(line)
        if changed:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(new_lines) + "\n")
            rewritten_files += 1
    print(f"rewrote srsWords in {rewritten_files} content files")

    # --- write the local SRS card store -------------------------------------
    if card_changes and os.path.exists(CARDS_PATH):
        cards = json.load(open(CARDS_PATH, encoding="utf-8"))
        mapping = {c["from"]: c["to"] for c in card_changes}
        seen = set()
        merged = []
        for c in cards:
            w = str(c.get("word", "")).lower().strip()
            base = mapping.get(w, w)
            key = (base, c.get("language"), c.get("userId"))
            if key in seen:
                continue
            seen.add(key)
            c["word"] = base
            merged.append(c)
        with open(CARDS_PATH, "w", encoding="utf-8") as fh:
            json.dump(merged, fh, ensure_ascii=False, indent=2)
        print(f"rewrote {len(card_changes)} local SRS cards -> {len(merged)} after de-dup")


if __name__ == "__main__":
    main()
