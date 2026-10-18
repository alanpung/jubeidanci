#!/usr/bin/env python3
"""Re-seat every flashcard into the CEFR level the dictionary now says it is.

The 6,000 flashcards were generated from the dictionary's *old* cefr_level
values, so after scripts/rebuild-cefr-levels.py corrected those levels the
decks no longer match their label: C1 contained `house`/`class` (A1) and A1
contained `congratulation`/`eraser` (C1).

This script reads all 60 unit files, asks the rebuilt dictionary what level
each card's word really is, and re-seats the cards:

  * a card whose word belongs to another level is released into that level's
    pool and the slot is refilled from the pool (so the total stays 6,000
    and no card is lost),
  * refill prefers cards released *into* this level (real movement), then
    falls back to unused dictionary words of that level,
  * candidates are ranked by how well they fit the unit's theme, then by
    frequency, so a unit about Food gets food words rather than a random
    slice of the alphabet,
  * a blocklist drops vocabulary that should not be taught in a language app
    (prostitute, heroin, ...) and replaces it the same way.

Run with --write to rewrite content/*-flashcard-unit-*.md.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_PATH = os.path.join(ROOT, "words", "english_merged.json")
CONTENT_DIR = os.path.join(ROOT, "content")

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
LEVEL_INDEX = {l: i for i, l in enumerate(LEVELS)}

# Words that must not be taught, whatever their level. They reached the C1
# deck by alphabetical slicing of the dictionary's C1 band.
BLOCKLIST = {
    # sexually explicit / degrading
    "prostitute", "whore", "slut", "pimp", "penis", "vagina", "sperm",
    "erotica", "porn", "pornography", "orgasm", "pervert", "scum",
    "brothel", "junkie", "condom", "nipple", "orgy", "molest", "rape",
    "incest", "fetish",
    # drugs / crime — legal or clinical in a dictionary, still wrong to drill
    "heroin", "cocaine", "psycho", "inmate", "overdose",
    # misspellings and non-words that used to sit in the dictionary; the
    # dictionary rebuild dropped or fixed them but the decks kept them
    "werent", "realy", "lyin", "tshirt", "everytime", "merci",
}

# ---------------------------------------------------------------------------
# Theme routing — a unit's title picks a theme, and refill candidates are
# ranked by how much of that theme's vocabulary shows up in their definition.
# ---------------------------------------------------------------------------

THEME_KEYWORDS: dict[str, list[str]] = {
    "daily": ["everyday", "daily", "routine", "home", "house", "household",
              " domestic", "生活", "日常", "家"],
    "family": ["family", "relative", "parent", "child", "marriage", "marry",
               "relationship", "friend", "家庭", "亲", "婚姻", "朋友"],
    "food": ["food", " eat", "meal", "cook", "kitchen", "restaurant", "dish",
             "drink", "taste", "食物", "吃", "餐", "烹饪", "厨房", "餐厅", "饮"],
    "school": ["school", "student", "teach", "learn", "study", "education",
               "class", "course", "学校", "学生", "教育", "学习", "课", "教师"],
    "work": ["work", "job", "career", "business", "office", "employ",
             "profession", "company", "manage", "工作", "职业", "公司", "商业",
             "职场", "管理"],
    "travel": ["travel", "trip", "journey", "transport", "tourist", "hotel",
               "city", "place", "vehicle", "旅行", "旅游", "交通", "车", "城",
               "地点", "旅"],
    "time": ["time", "season", "weather", "month", "day", "hour", "date",
             "clock", "时间", "季节", "天气", "月", "日", "年", "钟"],
    "shop": ["shop", " buy", "price", "money", "clothes", "fashion", "market",
             "store", "cost", "pay", "购物", "买", "钱", "衣服", "商店", "价格",
             "支付"],
    "health": ["health", "medical", "doctor", "ill", "disease", "body",
               "fitness", "medicine", "hospital", "pain", "健康", "医", "病",
               "身体", "药", "痛"],
    "nature": ["environment", "nature", "climate", "animal", "plant", "earth",
               "energy", "pollution", "weather", "环境", "自然", "气候", "动物",
               "植物", "污染", "能源"],
    "society": ["society", " law", "crime", "justice", "politic", "govern",
                "community", "social", "public", "社会", "法律", "罪", "正义",
                "政治", "政府", "社区", "公共"],
    "science": ["science", "research", "technolog", "discover", "experiment",
                "physical", "chemical", "科学", "研究", "技术", "发现", "实验",
                "物理", "化学"],
    "media": ["media", "news", "journal", "communicat", "broadcast", "report",
              "publish", "媒体", "新闻", "传播", "报道", "出版", "通信"],
    "culture": ["culture", " art", "music", "literature", "entertain",
                "heritage", "performance", "novel", "poem", "文化", "艺术",
                "音乐", "文学", "娱乐", "遗产", "小说", "诗"],
    "mind": ["psycholog", "emotion", "behavior", "mind", "feel", "cognit",
             "mental", "心理", "情绪", "行为", "思维", "情感", "认知", "精神"],
    "econ": ["econom", "finance", "trade", "market", "bank", "invest",
             "currency", "经济", "金融", "贸易", "市场", "银行", "投资", "货币"],
    "academic": ["academic", "analysis", "rhetoric", "argument", "debate",
                 "theory", "philosoph", "abstract", "学术", "分析", "修辞",
                 "论证", "辩论", "理论", "哲学", "抽象"],
}

# Title keyword -> theme. A unit that matches nothing gets no theme filter.
TITLE_THEME_HINTS: list[tuple[str, str]] = [
    ("everyday", "daily"), ("daily life", "daily"), ("home", "daily"),
    ("neighborhood", "daily"), ("household", "daily"),
    ("family", "family"), ("relationship", "family"),
    ("food", "food"), ("dining", "food"), ("cooking", "food"),
    ("restaurant", "food"), ("cuisine", "food"),
    ("school", "school"), ("education", "school"), ("learning", "school"),
    ("academic", "academic"), ("research", "academic"),
    ("rhetoric", "academic"), ("debate", "academic"),
    ("philosoph", "academic"), ("epistemology", "academic"),
    ("abstract", "academic"), ("literary", "culture"),
    ("work", "work"), ("career", "work"), ("business", "work"),
    ("profession", "work"), ("management", "work"), ("workplace", "work"),
    ("travel", "travel"), ("tourism", "travel"), ("transport", "travel"),
    ("holiday", "travel"), ("exploration", "travel"), ("places", "travel"),
    ("time", "time"), ("season", "time"), ("weather", "time"),
    ("climate", "time"),
    ("shopping", "shop"), ("clothes", "shop"), ("fashion", "shop"),
    ("money", "shop"), ("finance", "econ"), ("economy", "econ"),
    ("trade", "econ"), ("market", "econ"), ("macroeconomics", "econ"),
    ("health", "health"), ("fitness", "health"), ("medical", "health"),
    ("well-being", "health"), ("lifestyle", "health"),
    ("environment", "nature"), ("nature", "nature"), ("climate", "nature"),
    ("sustainability", "nature"), ("energy", "nature"),
    ("society", "society"), ("law", "society"), ("crime", "society"),
    ("justice", "society"), ("politic", "society"), ("governance", "society"),
    ("diplomacy", "society"), ("policy", "society"), ("global issues", "society"),
    ("sociology", "society"), ("jurisprudence", "society"),
    ("geopolitics", "society"), ("demographics", "society"),
    ("science", "science"), ("technology", "science"), ("innovation", "science"),
    ("discovery", "science"), ("paradigms", "science"),
    ("media", "media"), ("news", "media"), ("journalism", "media"),
    ("communication", "media"),
    ("culture", "culture"), ("arts", "culture"), ("artistry", "culture"),
    ("entertainment", "culture"), ("heritage", "culture"),
    ("aesthetics", "culture"),
    ("psycholog", "mind"), ("emotion", "mind"), ("behavior", "mind"),
    ("cognition", "mind"), ("temperament", "mind"), ("mind", "mind"),
]

# Themes that are deliberately broad / register-based have no keyword filter.
NO_THEME_TITLES = ("idiom", "erudite", "register", "apex lexical", "nuanced")


def theme_for_title(title: str) -> str | None:
    low = title.lower()
    if any(t in low for t in NO_THEME_TITLES):
        return None
    for hint, theme in TITLE_THEME_HINTS:
        if hint in low:
            return theme
    return None


def theme_score(card: dict, theme: str | None) -> int:
    if not theme:
        return 0
    haystack = (
        f"{card.get('word', '')} {card.get('meaning', '')} "
        f"{card.get('translation', '')}"
    ).lower()
    return sum(1 for kw in THEME_KEYWORDS[theme] if kw in haystack)


# ---------------------------------------------------------------------------
# Parsing / serialising
# ---------------------------------------------------------------------------

CARD_RE = re.compile(
    r"\[flashcard-review\]\n"
    r"front: \"(?P<front>.*)\"\n"
    r"meaning: \"(?P<meaning>.*)\"\n"
    r"translation: \"(?P<translation>.*)\"\n"
    r"srsWords: \"(?P<srsWords>.*)\"\n",
    re.M,
)


def parse_unit(path: str) -> tuple[str, list[list[dict]]]:
    """Return (file text with cards stripped, lessons as lists of cards)."""
    text = open(path, encoding="utf-8").read()
    # Split on lesson frontmatter blocks.
    parts = re.split(r"(?m)^(?=---\nlessonTitle:)", text)
    header = parts[0]
    lessons: list[list[dict]] = []
    for part in parts[1:]:
        cards = [
            {
                "front": m.group("front"),
                "meaning": m.group("meaning"),
                "translation": m.group("translation"),
                "srsWords": m.group("srsWords"),
            }
            for m in CARD_RE.finditer(part)
        ]
        lessons.append((part, cards))
    return header, lessons


def render_unit(header: str, lessons: list[tuple[str, list[dict]]]) -> str:
    out = [header]
    for part, cards in lessons:
        # keep the lesson's own frontmatter, drop its old cards
        body = CARD_RE.sub("", part).rstrip() + "\n"
        out.append(body)
        for c in cards:
            out.append(
                "[flashcard-review]\n"
                f"front: \"{c['front']}\"\n"
                f"meaning: \"{c['meaning']}\"\n"
                f"translation: \"{c['translation']}\"\n"
                f"srsWords: \"{c['srsWords']}\"\n\n"
            )
    text = "".join(out)
    # collapse the blank line storm left by removing cards
    return re.sub(r"\n{3,}", "\n\n", text).rstrip() + "\n"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--strictness", type=int, default=1,
                        help="re-seat cards this many levels off (default 1)")
    args = parser.parse_args()

    words = json.load(open(WORDS_PATH, encoding="utf-8"))
    level_of: dict[str, str] = {}
    for w in words:
        level_of.setdefault(w["word"].strip().lower(), w["cefr_level"])

    by_word = {w["word"].strip().lower(): w for w in words}

    files = sorted(glob.glob(os.path.join(CONTENT_DIR, "*-flashcard-unit-*.md")))
    units: list[dict] = []
    for path in files:
        label = os.path.basename(path).split("-")[0].upper()
        header, lessons = parse_unit(path)
        title_m = re.search(r"(?m)^unitTitle: \"(.*)\"", header)
        title = title_m.group(1) if title_m else ""
        units.append({
            "path": path, "label": label, "header": header,
            "lessons": lessons, "title": title,
            "theme": theme_for_title(title),
        })

    total_cards = sum(1 for u in units for _, cards in u["lessons"] for c in cards)
    print(f"parsed {len(units)} unit files, {total_cards} cards")

    # 1. classify every card. `_why` is None for a card that stays; otherwise
    #    it records why the slot has to be refilled.
    seated: list[dict] = []      # cards already in the right level
    released: dict[str, list[dict]] = defaultdict(list)
    why = Counter()
    for u in units:
        for _, cards in u["lessons"]:
            for card in cards:
                key = card["front"].strip().lower()
                real = level_of.get(key)
                if key in BLOCKLIST:
                    card["_why"] = "blocked"
                elif real is None:
                    # Not in the dictionary at all — an unverifiable level, so
                    # it cannot be trusted to sit in any course.
                    card["_why"] = "orphan"
                elif abs(LEVEL_INDEX[real] - LEVEL_INDEX[u["label"]]) >= args.strictness:
                    card["_why"] = f"{real}->{u['label']}"
                    card["_real"] = real
                    released[real].append(card)
                else:
                    card["_why"] = None
                    seated.append(card)
                if card["_why"]:
                    why[card["_why"]] += 1

    print(f"  already correct : {len(seated)}")
    print(f"  to re-seat      : {sum(len(v) for v in released.values())}")
    print(f"  blocklisted     : {why['blocked']}")
    print(f"  not in dict     : {why['orphan']}")

    # How many slots each level must fill.
    need = Counter()
    for u in units:
        for _, cards in u["lessons"]:
            for card in cards:
                if card["_why"]:
                    need[u["label"]] += 1
    print("  slots to fill   :", dict(need))

    # 2. per-level refill pool = released cards + unused dictionary words
    used = {c["front"].strip().lower() for u in units for _, cards in u["lessons"] for c in cards}
    pools: dict[str, list[dict]] = {}
    for lvl in LEVELS:
        pool = list(released.get(lvl, []))
        have = len(pool)
        if have < need[lvl]:
            extra = [
                {
                    "front": w["word"],
                    "meaning": w.get("english_translation") or "",
                    "translation": w.get("definition_zh") or "",
                    "srsWords": w["word"],
                    "_rank": w.get("word_frequency") or 10**9,
                    "_real": lvl,
                }
                for w in words
                if w["cefr_level"] == lvl
                and w["word"].strip().lower() not in used
                and w["word"].strip().lower() not in BLOCKLIST
                and w.get("useful_for_flashcard", True)
                and w.get("definition_zh")
            ]
            extra.sort(key=lambda c: c["_rank"])
            pool += extra[: need[lvl] - have]
        # a released card has no _rank; give it one from the dictionary
        for c in pool:
            if "_rank" not in c:
                c["_rank"] = by_word.get(c["front"].strip().lower(), {}).get(
                    "word_frequency") or 10**9
        pools[lvl] = pool
    print("  pool sizes      :", {k: len(v) for k, v in pools.items()})

    # 3. refill
    stats = Counter()
    for u in units:
        lvl = u["label"]
        theme = u["theme"]
        for _, cards in u["lessons"]:
            for i, card in enumerate(cards):
                if not card.get("_why"):
                    continue
                stats[f"{lvl} filled"] += 1
                pool = pools[lvl]
                if not pool:
                    stats[f"{lvl} UNFILLED"] += 1
                    continue
                pool.sort(key=lambda c: (-theme_score(c, theme), c["_rank"]))
                cards[i] = pool.pop(0)
                stats[f"{lvl} filled"] += 1
    print("  unfilled slots  :", sum(v for k, v in stats.items() if k.endswith("UNFILLED")))

    # 4. write
    if args.write:
        for u in units:
            open(u["path"], "w", encoding="utf-8").write(
                render_unit(u["header"], u["lessons"]))
        print(f"\nwrote {len(units)} unit files")
    else:
        print("\n(dry run — pass --write to apply)")

    # 5. report
    print("\n=== after ===")
    hit = Counter(); tot = Counter()
    for u in units:
        for _, cards in u["lessons"]:
            for c in cards:
                tot[u["label"]] += 1
                if level_of.get(c["front"].strip().lower()) == u["label"]:
                    hit[u["label"]] += 1
    for lvl in LEVELS:
        print(f"  {lvl}: {hit[lvl]}/{tot[lvl]} = {hit[lvl]/tot[lvl]*100:.0f}%")
    print(f"  total cards: {sum(tot.values())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
