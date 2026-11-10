#!/usr/bin/env python3
"""Generate full-sentence Chinese hints for the A2-C2 word-order courses.

Source sentences are the `answer:` lines of
`content/{a2,b1,b2,c1,c2}-word-order-unit-*.md` (one real dictionary example
sentence per exercise). Translations are cached in
`words/sentence_translations_zh.json` so regeneration is deterministic and
offline-capable once the cache is built.

Translation channels (both free, no API key):
  1. Google `dict-chrome-ex` endpoint (primary, better quality)
  2. MyMemory (fallback)

Usage:
  python3 scripts/translate-sentences.py --limit 40   # small trial run
  python3 scripts/translate-sentences.py              # full run (resumable)
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content"
CACHE_PATH = ROOT / "words" / "sentence_translations_zh.json"
LEVELS = ["a2", "b1", "b2", "c1", "c2"]

GOOGLE_URL = (
    "https://clients5.google.com/translate_a/t"
    "?client=dict-chrome-ex&sl=en&tl=zh-CN&q={q}"
)
MYMEMORY_URL = (
    "https://api.mymemory.translated.net/get?q={q}&langpair=en%7Czh-CN"
)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

CJK = re.compile(r"[\u4e00-\u9fff]")
LATIN = re.compile(r"[A-Za-z]{3,}")
BAD_MARKUP = re.compile(r"<[a-z/]|Sorry|Error|quota|MYMEMORY", re.I)


def collect_sentences() -> list[str]:
    """Return unique English sentences in stable order."""
    seen: set[str] = set()
    out: list[str] = []
    for level in LEVELS:
        for path in sorted(CONTENT_DIR.glob(f"{level}-word-order-unit-*.md")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.startswith("answer:"):
                    continue
                tokens = re.findall(r'"([^"]+)"', line)
                sentence = " ".join(tokens)
                if sentence and sentence not in seen:
                    seen.add(sentence)
                    out.append(sentence)
    return out


def http_get(url: str, timeout: float = 12.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def first_string(node) -> str | None:
    """Google returns either ["译文"] or nested arrays."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        for item in node:
            found = first_string(item)
            if found:
                return found
    return None


def translate_google(sentence: str) -> str | None:
    raw = http_get(GOOGLE_URL.format(q=urllib.parse.quote(sentence)))
    return first_string(json.loads(raw))


def translate_mymemory(sentence: str) -> str | None:
    raw = http_get(MYMEMORY_URL.format(q=urllib.parse.quote(sentence)))
    data = json.loads(raw)
    if str(data.get("responseStatus")) != "200":
        return None
    return data.get("responseData", {}).get("translatedText")


def clean_translation(text: str | None) -> str | None:
    """Reject untranslated / garbage responses; normalise punctuation."""
    if not text:
        return None
    text = text.strip().strip('"').strip()
    # A stray quote would break the Markdown `text: "..."` field.
    text = text.replace('"', "").replace("\\", "")
    if not text or not CJK.search(text):
        return None
    # Proper nouns (e.g. "Matengu先生") may keep up to two Latin words;
    # reject responses that are mostly untranslated English instead.
    if len(CJK.findall(text)) < 3:
        return None
    if len(LATIN.findall(text)) > 2:
        return None
    if BAD_MARKUP.search(text):
        return None
    if len(text) > 120:
        return None
    text = re.sub(r"[.。!！?？,，;；:：\s]+$", "", text)
    text = text.replace("\n", "").strip()
    if not text:
        return None
    return text + "。"


def translate_one(sentence: str) -> tuple[str, str | None, str]:
    last_error = ""
    for attempt in range(3):
        for fn in (translate_google, translate_mymemory):
            try:
                result = clean_translation(fn(sentence))
                if result:
                    return sentence, result, ""
            except Exception as exc:  # noqa: BLE001 - network errors are expected
                last_error = f"{type(exc).__name__}: {exc}"[:120]
        time.sleep(0.4 * (attempt + 1))
    return sentence, None, last_error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="translate at most N sentences")
    parser.add_argument("--workers", type=int, default=8, help="concurrent requests")
    args = parser.parse_args()

    cache: dict[str, str] = {}
    if CACHE_PATH.exists():
        cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))

    sentences = collect_sentences()
    todo = [s for s in sentences if s not in cache]
    if args.limit:
        todo = todo[: args.limit]

    already = sum(1 for s in sentences if s in cache)
    print(f"total={len(sentences)} cached={already} todo={len(todo)}", flush=True)
    if not todo:
        print("nothing to do", flush=True)
        return 0

    lock = threading.Lock()
    failed: list[tuple[str, str]] = []
    done = 0

    def save() -> None:
        CACHE_PATH.write_text(
            json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(translate_one, s): s for s in todo}
        for future in concurrent.futures.as_completed(futures):
            sentence, result, error = future.result()
            with lock:
                done += 1
                if result:
                    cache[sentence] = result
                else:
                    failed.append((sentence, error))
                if done % 100 == 0:
                    save()
                    print(f"progress={done}/{len(todo)} cached={len(cache)} failed={len(failed)}", flush=True)
    save()

    print(f"DONE translated={done - len(failed)} failed={len(failed)} cache_size={len(cache)}", flush=True)
    if failed:
        print("--- failures (first 10) ---", flush=True)
        for sentence, error in failed[:10]:
            print(f"  {sentence!r} :: {error}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
