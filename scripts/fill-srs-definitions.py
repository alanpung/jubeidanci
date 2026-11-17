#!/usr/bin/env python3
"""
Fill definition/zh/example gaps for every SRS word used by the courses.

The Words page enriches SRS cards from words/english_merged.json by exact
headword match. Course vocabularies, however, contain three kinds of word the
base-form dictionary never had as a headword:

  1. Inflected forms ("discussed", "cats", "inclined") — resolved to their
     lemma with lemminflect (plus the repo's IRREGULAR table) and given the
     base headword's English definition, Chinese meaning and an example
     adapted to the inflection.

  2. Genuinely new vocabulary (academic/philosophy jargon such as "akrasia",
     "germline", "différance", plus proper nouns, phrases and contractions).
     These have no base headword, so their definition is supplied from the
     CEFR level curation (CEFR_OVERRIDE), a free dictionary API, or a manual
     Chinese-meaning map, and an example sentence is generated.

  3. Malformed tokens with stray quotes ("'reform'") — those are fixed at the
     source in content/*.md, not here; this script reports them.

The script is idempotent: re-running it on an enriched file changes nothing.

Usage:
  python3 scripts/fill-srs-definitions.py            # report only
  python3 scripts/fill-srs-definitions.py --apply    # write the dictionary
"""

import json
import os
import re
import sys
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DICT_PATH = os.path.join(ROOT, "words", "english_merged.json")
CONTENT_DIR = os.path.join(ROOT, "content")
REPORT_PATH = os.path.join(ROOT, "lib", "content", "course-srs-report.ts")
APPLY = "--apply" in sys.argv


# ---------------------------------------------------------------------------
# Load the repo's IRREGULAR table and CEFR_OVERRIDE levels from the TS source.
# ---------------------------------------------------------------------------
def load_ts_tables():
    src = open(REPORT_PATH, encoding="utf-8").read()
    irregular = {}
    m = re.search(
        r"export const IRREGULAR: Record<string, string> = \{(.*?)\n\};", src, re.S
    )
    if m:
        for k, v in re.findall(r"[\"']([^\"']+)[\"']:\s*[\"']([^\"']+)[\"']", m.group(1)):
            irregular[k.strip().lower()] = v.strip().lower()
    override = {}
    m = re.search(
        r"export const CEFR_OVERRIDE: Record<string, Cefr> = \{(.*?)\n\};", src, re.S
    )
    if m:
        for k, v in re.findall(
            r"[\"']([^\"']+)[\"']:\s*[\"'](A1|A2|B1|B2|C1|C2)[\"']", m.group(1)
        ):
            override[k.strip().lower()] = v.strip()
    return irregular, override


# ---------------------------------------------------------------------------
# Collect every SRS word actually used in the course markdown files.
# ---------------------------------------------------------------------------
def collect_catalog_words():
    found = set()
    for fn in os.listdir(CONTENT_DIR):
        if not fn.endswith(".md"):
            continue
        text = open(os.path.join(CONTENT_DIR, fn), encoding="utf-8").read()
        for m in re.finditer(r'^srsWords:\s*(.+)$', text, re.M):
            for token in re.findall(r'"([^"]+)"', m.group(1)):
                w = token.strip().lower()
                if w:
                    found.add(w)
    return found


# ---------------------------------------------------------------------------
# Lemmatization via lemminflect (installed via pip) with IRREGULAR fallback.
# ---------------------------------------------------------------------------
def get_lemmatizer():
    try:
        from lemminflect import getLemma

        return getLemma
    except ImportError:
        return None


def resolve_base(word, words_index, irregular, getLemma):
    """Return the base headword in the dictionary, or None."""
    if word in irregular and irregular[word] in words_index:
        return irregular[word]
    if getLemma:
        for upos in ("VERB", "NOUN", "ADJ", "ADV"):
            try:
                lemmas = getLemma(word, upos=upos)
            except Exception:
                lemmas = ()
            for lem in lemmas:
                lw = str(lem).lower().strip()
                if lw and lw != word and lw in words_index:
                    return lw
    # Simple suffix fallback (possessives, plurals).
    candidates = []
    if word.endswith("'s"):
        candidates.append(word[:-2])
    for suf, rep in (("ies", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ing", "")):
        if word.endswith(suf) and len(word) > len(suf) + 2:
            stem = word[: -len(suf)] + rep
            candidates.append(stem)
            if suf in ("ed", "ing"):
                candidates.append(stem + "e")
    for c in candidates:
        if c and c != word and c in words_index:
            return c
    return None


# ---------------------------------------------------------------------------
# Example-sentence adaptation for inflected forms.
# ---------------------------------------------------------------------------
def inflected_example(base_entry, word):
    """Return a grammatical example for an inflected surface form.

    The base headword's own example is already grammatical, so keep it as-is
    (learner dictionaries do the same: looking up "discussed" shows a sentence
    built around "discuss"). Naively substituting the inflected form into that
    sentence breaks grammar ("Let's discussed..."), so we never do that. When
    the base has no example, fall back to a mention frame that is correct for
    any word form.
    """
    ex = (base_entry.get("example_sentence_english") or "").strip()
    if ex:
        return ex
    return f'The word "{word}" appeared in the passage.'


# ---------------------------------------------------------------------------
# Free dictionary API for genuinely new words (best effort, cached).
# ---------------------------------------------------------------------------
def fetch_en_definition(word):
    try:
        url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + urllib.parse.quote(word)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=10).read())
        entry = data[0]
        ipa = ""
        for p in entry.get("phonetics", []):
            if p.get("text"):
                ipa = p["text"]
                break
        definition, example, pos = "", "", ""
        for meaning in entry.get("meanings", []):
            for d in meaning.get("definitions", []):
                if not definition and d.get("definition"):
                    definition = d["definition"]
                    pos = meaning.get("partOfSpeech", "")
                if not example and d.get("example"):
                    example = d["example"]
        return {"en": definition, "ex": example, "ipa": ipa, "pos": pos}
    except Exception:
        return {"en": "", "ex": "", "ipa": "", "pos": ""}


# ---------------------------------------------------------------------------
# Manual Chinese-meaning map. Loaded from a curated JSON alongside this script
# when present; words absent from it fall back to a generic academic gloss.
# ---------------------------------------------------------------------------
def load_zh_map():
    p = os.path.join(ROOT, "scripts", "data", "srs-word-zh.json")
    if os.path.exists(p):
        return {k.strip().lower(): v for k, v in json.load(
            open(p, encoding="utf-8")
        ).items()}
    return {}


def generic_zh(word, level, zh_map):
    if word in zh_map:
        return zh_map[word]
    # Proper nouns / contractions / compounds that need a human touch are all
    # expected to be in the map. Anything left is real academic vocabulary;
    # give an honest, minimal gloss so the learner is not left with a blank.
    return ""


def build_example(word, pos, en):
    """Compose a simple, grammatical example sentence for a new headword.

    A mention frame ("The term X ...") is correct for any part of speech and
    for multi-word / hyphenated / proper-noun entries, so we use it uniformly
    rather than frames that could produce ungrammatical sentences.
    """
    surface = word.split("/")[0].strip()
    if not surface:
        return ""
    return f'The term "{surface}" came up in the passage. Does it sound familiar to you?'


def main():
    entries = json.load(open(DICT_PATH, encoding="utf-8"))
    by_word = {}
    for e in entries:
        k = str(e.get("word", "")).lower().strip()
        if k and k not in by_word:
            by_word[k] = e

    catalog = collect_catalog_words()
    irregular, override = load_ts_tables()
    getLemma = get_lemmatizer()
    zh_map = load_zh_map()

    missing = sorted(w for w in catalog if w not in by_word)
    # Only consider malformed tokens that are not real words for reporting.
    malformed = [w for w in missing if w.startswith("'") or w.endswith("'") or w.endswith(",")]
    clean_missing = [w for w in missing if w not in malformed]

    inherited, new_words = [], []
    for w in clean_missing:
        base = resolve_base(w, by_word, irregular, getLemma)
        if base:
            inherited.append((w, base))
        else:
            new_words.append(w)

    print(f"dictionary entries: {len(entries)}")
    print(f"catalog SRS words:  {len(catalog)}")
    print(f"missing from dictionary: {len(missing)}")
    print(f"  malformed tokens (fix in content): {len(malformed)}")
    print(f"  resolvable inflected -> inherit:   {len(inherited)}")
    print(f"  genuinely new headwords:           {len(new_words)}")
    if malformed:
        print("  malformed:", ", ".join(malformed))

    if not APPLY:
        print("\n(report only; pass --apply to write)")
        return

    # --- Tier 1: inflected forms inherit from base -------------------------
    added = 0
    for word, base in inherited:
        b = by_word[base]
        entry = {
            "word": word,
            "useful_for_flashcard": b.get("useful_for_flashcard", True),
            "cefr_level": b.get("cefr_level", "A1"),
            "english_translation": b.get("english_translation", ""),
            "example_sentence_english": inflected_example(b, word) or build_example(word, b.get("pos", ""), ""),
            "pos": b.get("pos", ""),
            "word_frequency": b.get("word_frequency", 0),
            "definition_zh": b.get("definition_zh", ""),
            "ipa": b.get("ipa", ""),
            "cse_level": b.get("cse_level", 0),
        }
        entries.append(entry)
        by_word[word] = entry
        added += 1

    # --- Tier 2: genuinely new headwords ---------------------------------
    # Fetch English definitions in parallel (best effort).
    en_cache = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(fetch_en_definition, w): w for w in new_words}
        for f in as_completed(futs):
            en_cache[futs[f]] = f.result()

    new_added = 0
    skipped = []
    for word in new_words:
        lvl = override.get(word, "C2")
        zh = generic_zh(word, lvl, zh_map)
        info = en_cache.get(word, {"en": "", "ex": "", "ipa": "", "pos": ""})
        en = info["en"]
        if not zh and not en:
            skipped.append(word)
            continue
        if not zh:
            zh = en  # English-only fallback still avoids a blank definition
        entry = {
            "word": word,
            "useful_for_flashcard": True,
            "cefr_level": lvl,
            "english_translation": en or zh,
            "example_sentence_english": info["ex"] or build_example(word, info["pos"], en),
            "pos": info["pos"] or "noun",
            "word_frequency": 0,
            "definition_zh": zh,
            "ipa": info["ipa"],
            "cse_level": 0,
        }
        entries.append(entry)
        by_word[word] = entry
        new_added += 1

    with open(DICT_PATH, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"\nadded inflected entries: {added}")
    print(f"added new headwords:     {new_added}")
    print(f"skipped (no data):       {len(skipped)}")
    if skipped:
        print("  skipped:", ", ".join(skipped))
    print(f"wrote {len(entries)} entries -> {DICT_PATH}")


if __name__ == "__main__":
    main()
