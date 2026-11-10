#!/usr/bin/env python3
"""Generate CEFR A2-C2 Fill in the Blank courses mirroring a1-fill-in-the-blank-*.

Structure (identical to the expanded A1 course):
  - <level>-fill-in-the-blank-course.md       (1 per level)
  - <level>-fill-in-the-blank-unit-1..5.md    (5 per level)
  - 20 lessons per unit, 5 [fill-in-the-blank] questions per lesson
  - 5 x 20 x 5 = 500 questions / 500 distinct target words per level

Level-specific exercise design, following the course owner's instruction:

  A2   Every lesson starts with one [matching-pairs] block whose 5 pairs are
       exactly the 5 words used in that lesson's blanks. Like A1, the pairs
       act as a hint and constrain which words may be used in the sentences.
  B1+  No matching pairs. The Chinese hint (carried in `translation`, shown
       in the hint box above the sentence) is the only constraint. Because a
       Chinese gloss can legitimately map to more than one English word, these
       levels also emit `acceptAlso` alternatives.

Every sentence is a real example from words/english_merged.json with the
target word (or one of its inflections) replaced by `___`; the answer is the
surface form that actually fits the sentence, while `srsWords` is always the
dictionary lemma. The Chinese hints are derived from the dictionary's own
`definition_zh`, so no machine-translated full sentences are invented. Words
with several part-of-speech sense groups, and lemmas that are really just
inflections/comparatives, are excluded so a Chinese hint never describes the
wrong sense of the word in the sentence.

acceptAlso scenarios covered:
  1. When the sentence uses an inflected form (e.g. "excited", "statistics"),
     the dictionary lemma is also accepted ("excite", "statistic").
  2. On B1-C2 only, up to two same-level, same-POS words sharing the exact
     same first-sense Chinese gloss are accepted (Chinese-hint ambiguity).
  3. The parser itself adds its built-in commonSynonyms for everyday verbs.

Deterministic (fixed seed) and idempotent: a level whose course file already
exists is skipped entirely; a failed level leaves no partial files behind.
"""

import json
import random
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_PATH = ROOT / "words" / "english_merged.json"
CONTENT_DIR = ROOT / "content"
SEED = 20261110

LEVELS = ["A2", "B1", "B2", "C1", "C2"]
MATCHING_PAIRS_LEVELS = {"A2"}  # B1+ rely on the Chinese hint alone

UNITS = 5
LESSONS_PER_UNIT = 20
WORDS_PER_LESSON = 5
LESSONS_PER_LEVEL = UNITS * LESSONS_PER_UNIT          # 100
TARGET_WORDS = LESSONS_PER_LEVEL * WORDS_PER_LESSON   # 500

UNIT_ICONS = ["🔤", "📚", "🌍", "💬", "🧠"]
UNIT_COLORS = ["#FF6B6B", "#54A0FF", "#1DD1A1", "#F7B731", "#5F27CD"]
LESSON_ICONS = ["👋", "🔢", "🎨", "🐾", "🍎", "🧍", "📅", "🏃", "👕", "⛅"]
LESSON_COLORS = [
    "#FF6B6B", "#FF8C42", "#F7B731", "#5F27CD", "#54A0FF",
    "#00D2D3", "#1DD1A1", "#EE5A6F", "#786FA6", "#FECA57",
]

# Unit titles and the first 10 lesson topics mirror the A2-C2 Multiple Choice
# courses so the whole CEFR set reads consistently. Lessons 11-20 extend each
# unit with a second, context-oriented pass over the same ten topics.
THEMES = {
    "A2": [
        ("Everyday Life & Routines", ["Morning Routines", "At Home", "Meals & Cooking", "Shopping for Food", "Clothes & Weather", "Household Tasks", "Daily Travel", "Appointments", "Free Time", "Evening Routines"]),
        ("People & Relationships", ["Family & Friends", "Describing People", "Personality", "Feelings", "Greetings & Introductions", "Invitations", "Giving Thanks", "Apologies", "Helping Others", "Celebrations"]),
        ("Places & Travel", ["In Town", "Directions", "Public Transport", "At the Station", "At the Hotel", "Sightseeing", "At the Beach", "In the Countryside", "Maps & Signs", "Travel Plans"]),
        ("Work, Study & Services", ["At School", "In the Classroom", "Homework & Exams", "Office Work", "Jobs & Occupations", "At the Bank", "At the Post Office", "At the Doctor", "Using the Phone", "Simple Forms"]),
        ("Leisure, Health & Nature", ["Sports & Games", "Music & Films", "Hobbies", "Food & Drink", "Health & Illness", "The Body", "Animals & Pets", "Plants & Gardens", "Seasons & Weather", "Weekend Plans"]),
    ],
    "B1": [
        ("Work & Career", ["Applying for Jobs", "Job Interviews", "Office Routine", "Business Emails", "Team Meetings", "Project Management", "Customer Service", "Salary & Promotion", "Remote Work", "Career Development"]),
        ("Travel & Transportation", ["Booking Flights", "At the Airport", "Public Transport", "Renting a Car", "Hotel Check-in", "Sightseeing & Tours", "Asking for Directions", "Travel Emergencies", "Dining Abroad", "Cultural Experience"]),
        ("Health & Fitness", ["Visiting the Doctor", "Describing Symptoms", "At the Pharmacy", "Healthy Diet", "Gym & Exercise", "Mental Relaxation", "Medical Insurance", "First Aid", "Sleeping Habits", "Wellness Routines"]),
        ("Education & Learning", ["University Life", "Choosing a Major", "Exams & Study", "Online Learning", "Language Acquisition", "Group Projects", "Studying Abroad", "Library Research", "Vocational Training", "Lifelong Learning"]),
        ("Housing & Living", ["Renting an Apartment", "House Hunting", "Furniture & Decor", "Home Repairs", "Neighborhood Life", "Roommates & Neighbors", "Utilities & Bills", "Moving House", "Gardening & Household", "Safety at Home"]),
    ],
    "B2": [
        ("Workplace Challenges & Management", ["Handling Tight Deadlines", "Conflict Resolution", "Performance Reviews", "Delegating Tasks", "Leadership Dynamics", "Corporate Restructuring", "Negotiating Contracts", "Cross-departmental Cooperation", "Workplace Stress", "Innovation Strategy"]),
        ("Cultural Differences & Exchange", ["Cross-cultural Communication", "Global Business Protocol", "Traditions & Modernity", "Expat Adaptability", "Language Idioms & Nuance", "Cultural Stereotypes", "Festival Heritage", "Global Cuisine Trends", "Intercultural Marriage", "Subcultures & Youth"]),
        ("Debates & Expressing Opinions", ["Articulating Arguments", "Polite Disagreement", "Evaluating Evidence", "Counterarguments", "Public Speaking", "Persuasive Pitching", "Moderating Discussions", "Logical Fallacies", "Consensus Building", "Defending Positions"]),
        ("Science & Modern Technology", ["Artificial Intelligence Impact", "Data Privacy & Security", "Medical Breakthroughs", "Space Exploration", "Automation in Industry", "Smartphone Addiction", "Biotechnology Progress", "Cybersecurity Risks", "Future of Transportation", "Renewable Energy Tech"]),
        ("Current Events & News Media", ["Journalistic Ethics", "Fake News & Fact Checking", "Investigative Reporting", "Social Media Movements", "Global Trade News", "Crisis Management Coverage", "Public Health Policy", "Opinion Editorials", "Infographics & Data Journalism", "Media Censorship Debates"]),
    ],
    "C1": [
        ("Politics & Governance", ["Constitutional Law Principles", "Electoral Reform Debates", "Geopolitical Alliances", "Public Policy Formulations", "Diplomatic Protocol", "Legislative Procedures", "Civic Engagement & Advocacy", "Governmental Transparency", "Bureaucratic Efficiency", "Fiscal Policy Strategy"]),
        ("Academic Discourse & Research", ["Peer Review Standards", "Qualitative Research Methodology", "Interdisciplinary Synthesis", "Quantitative Data Interpretation", "Academic Thesis Defenses", "Scholarly Publication", "Citation & Plagiarism Ethics", "Grant Proposal Writing", "Hypothesis Formulation", "Paradigm Shifts in Science"]),
        ("Global Financial Systems", ["Central Bank Monetary Policy", "Macroeconomic Forecasting", "Sovereign Debt Crises", "Venture Capital Dynamics", "Financial Derivatives Risk", "Global Trade Deficits", "Regulatory Compliance", "Asset Allocation Strategies", "Capital Market Volatility", "Fintech Disruption"]),
        ("Ethics, AI & Technology", ["Algorithmic Bias Mitigation", "Autonomous Weapons Ethics", "Data Sovereignty Laws", "Transhumanism Philosophy", "AI Governance Frameworks", "Surveillance Capitalism", "Genetic Modification Debates", "Quantum Computing Implications", "Tech Monopoly Regulation", "Digital Identity Rights"]),
        ("Rhetoric & Persuasive Writing", ["Oratorical Devices & Cadence", "Aristotelian Appeals", "Subtle Innuendo & Nuance", "Polemical Arguments", "Crisis Speechwriting", "Editorial Persuasion", "Keynote Address Crafting", "Diplomatic Equivocation", "Rhetorical Question Impact", "Evocative Metaphor Construction"]),
    ],
    "C2": [
        ("Nuanced Argumentation & Debate", ["Socratic Irony in Discourse", "Subtle Refutation Techniques", "Dialectical Synthesis", "Deconstructing Fallacious Logic", "Incisive Counter-arguments", "Precision in Conceptual Distinction", "Elusive Premise Examination", "Handling Hostile Cross-examination", "Sophisticated Persuasion", "Pithy Aphorisms in Debate"]),
        ("Irony, Subtlety & Wit", ["Mastering Dry Humor & Understatement", "Satirical Commentary", "Double Entendres & Puns", "Subtle Sarcasm & Innuendo", "Playful Literary Allusions", "Witty Retorts & Badinage", "Sardonically Expressing Doubt", "Nuanced Irony in Essayistry", "Implicit Subtext Construction", "Humorous Hyperbole"]),
        ("Complex Idioms & Expressions", ["Obscure Literary Idioms", "Archaic Yet Vibrant Phrasing", "Nuanced Colloquialisms", "Etymological Precision", "Idiomatic Subversion", "Metaphorical Eloquence", "Sophisticated Proverbial Phrases", "Register-shifting Idioms", "High-register Conversational Flair", "Rare Expressive Formulations"]),
        ("Literary Prose & Stylistic Register", ["Evocative Descriptive Cadence", "Intricate Narrative Structure", "Stream-of-Consciousness Elegance", "Poetic Diction in Prose", "Stylistic Pacing & Tension", "Ornate Historical Register", "Minimalist Poignant Prose", "Rich Allegorical Writing", "Sensory Imagery Synthesis", "Literary Pastiche & Parody"]),
        ("Legal Precision & Jurisprudence", ["Statutory Construction Nuance", "Contractual Ambiguity Resolution", "Constitutional Originalism Debate", "Treaty Language Hermeneutics", "Evidentiary Rule Nuances", "Tort Liability Determinants", "Appellate Brief Eloquence", "Jurisdictional Conflict Analysis", "Legal Fiction Concepts", "Strict Constructionism Critique"]),
    ],
}

SECOND_PASS = [
    "in Context", "Word Family", "Everyday Use", "Common Collocations",
    "Review", "Practice", "Synonyms & Nuance", "Reading Practice",
    "Sentence Building", "Mixed Practice",
]

POS_ALIASES = {
    "n": "noun", "noun": "noun", "proper noun": "noun",
    "v": "verb", "verb": "verb", "vt": "verb", "vi": "verb", "v1": "verb",
    "adj": "adjective", "a": "adjective", "adjective": "adjective",
    "adv": "adverb", "adverb": "adverb",
    "num": "number", "numeral": "number", "number": "number",
    "prep": "preposition", "pron": "pronoun", "int": "interjection",
}
CONTENT_POS = {"noun", "verb", "adjective", "adverb"}
HAS_ZH = re.compile(r"[\u4e00-\u9fa5]")


def norm_pos(value):
    p = (value or "other").strip().lower()
    return POS_ALIASES.get(p, p)


def valid_word(word):
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z'\-]{2,29}", word))


def clean_text(value, limit):
    if not value:
        return None
    s = str(value).replace("\\", "").replace('"', "'")
    s = s.replace("{", "(").replace("}", ")")
    s = re.sub(r"\s+", " ", s).strip()
    if not s or len(s) > limit:
        return None
    return s


def variants(word):
    """Surface forms of a lemma that may appear inside its example sentence."""
    w = word.lower()
    forms = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "'s"}
    if w.endswith("e"):
        forms.update({w[:-1] + "ing", w[:-1] + "ed"})
    if w.endswith("y"):
        forms.update({w[:-1] + "ies", w[:-1] + "ied"})
    forms.discard(w)
    # Exact lemma first, then longer inflections (so "statistics" beats "statistic").
    return [w] + sorted(forms, key=len, reverse=True)


def blankify(word, sentence):
    """Replace the first occurrence of a lemma/variant with ___.

    Returns (sentence_with_blank, surface_form_found) or (None, None).
    Rejects sentences where the word still appears after blanking (that would
    give the answer away) and sentences longer than 170 characters.
    """
    for form in variants(word):
        m = re.search(r"\b" + re.escape(form) + r"\b", sentence, re.I)
        if not m:
            continue
        surface = sentence[m.start():m.end()]
        out = sentence[:m.start()] + "___" + sentence[m.end():]
        for other in variants(word):
            if re.search(r"\b" + re.escape(other) + r"\b", out, re.I):
                return None, None
        return out, surface
    return None, None


def first_sense_group(raw):
    """First part-of-speech sense group, e.g. 'n. 服务, 贡献, 雇佣'."""
    return str(raw or "").split("；")[0].split(";")[0].strip()


def short_gloss(raw):
    """One short Chinese gloss for a matching-pair label."""
    s = first_sense_group(raw)
    s = re.sub(r"^[a-zA-Z]+\.\s*", "", s)
    s = re.split(r"[,，]", s)[0].strip()
    s = re.sub(r"\(.*?\)", "", s).strip()
    # Some dictionary records repeat the gloss ("死亡 死亡", "服务 业务").
    # Keep the first token so the pair label stays short and unambiguous.
    s = re.split(r"\s+", s)[0].strip()
    s = clean_text(s, 14)
    if not s or not HAS_ZH.search(s) or len(s) < 2:
        return None
    return s


def chinese_hint(raw, short):
    """Word-level Chinese hint shown in the blue box above the sentence.

    The dictionary has no full-sentence Chinese translations for these words,
    so the hint is the (up to) first three distinct senses of the Chinese
    gloss. Parentheticals, appended duplicate glosses ("服务 业务") and
    stray Latin text are removed. This is accurate, unlike a templated
    full-sentence translation.
    """
    group = first_sense_group(raw)
    prefix_match = re.match(r"^([a-zA-Z]+\.\s*)", group)
    prefix = prefix_match.group(1) if prefix_match else ""
    rest = group[len(prefix):]
    rest = re.sub(r"[\(（][^)）]*[\)）]", "", rest)
    tokens = []
    for token in re.split(r"[,，\s]+", rest):
        token = token.strip()
        if not token or not HAS_ZH.search(token):
            continue
        if re.search(r"[A-Za-z]{3,}", token):
            continue
        if token not in tokens:
            tokens.append(token)
        if len(tokens) == 3:
            break
    gloss = prefix + ", ".join(tokens)
    gloss = clean_text(gloss, 60)
    if not gloss or not HAS_ZH.search(gloss):
        gloss = short or "见上方中文提示"
    # parser.ts strips "(提示:...)" only; using a full-width colon keeps the hint intact.
    return "空格处意为：" + gloss


def single_sense_group(raw):
    """Keep words whose Chinese gloss covers one part of speech only.

    Polysemous entries (e.g. "a. 平坦的；adv. 甚至") make both the Chinese
    hint and the matching-pair label ambiguous, because the example sentence
    may use a different sense than the first one listed.
    """
    groups = [g.strip() for g in re.split(r"[；;]", str(raw or "")) if g.strip()]
    return len(groups) == 1


# Dictionary lemmas that are really just inflections of another word make poor
# vocabulary targets ("cacti" = 仙人掌(复数), "happier" = 更快乐的).
JUNK_GLOSS = re.compile(r"复数|过去式|过去分词|比较级|最高级|第三人称")


def clean_lemma(word, raw):
    if "-" in word or "'" in word:
        return False
    gloss = str(raw or "")
    if JUNK_GLOSS.search(gloss) or re.search(re.escape(word), gloss, re.I):
        return False
    # Records with stray Latin text ("DOS内部命令...", "（earn的现在分词）",
    # "Google 公司设计的...") produce misleading hints.
    core = re.sub(r"^[a-zA-Z]+\.\s*", "", first_sense_group(gloss))
    if re.search(r"[A-Za-z]{3,}", core):
        return False
    # Comparatives/superlatives ("更快乐的", "最快乐的") are inflected lemmas.
    first = core.strip()
    if re.match(r"^[更最].+的$", first):
        return False
    return True


def build_pool(data, level):
    pool = []
    for e in data:
        if e.get("cefr_level") != level or not e.get("useful_for_flashcard"):
            continue
        word = str(e.get("word") or "").strip()
        if not valid_word(word) or not clean_lemma(word, e.get("definition_zh")):
            continue
        pos = norm_pos(e.get("pos"))
        if pos not in CONTENT_POS:
            continue
        if not single_sense_group(e.get("definition_zh")):
            continue
        short = short_gloss(e.get("definition_zh"))
        if not short:
            continue
        example = clean_text(e.get("example_sentence_english"), 170)
        if not example or len(example) < 15 or "___" in example:
            continue
        sentence, surface = blankify(word, example)
        if not sentence:
            continue
        try:
            freq = int(e.get("word_frequency") or 10 ** 9)
        except (TypeError, ValueError):
            freq = 10 ** 9
        pool.append({
            "word": word,
            "surface": surface,
            "sentence": sentence,
            "pos": pos,
            "short": short,
            "hint": chinese_hint(e.get("definition_zh"), short),
            "freq": freq,
        })
    return pool


def build_synonyms(pool):
    """Same-level, same-POS words sharing an identical first-sense Chinese gloss."""
    groups = defaultdict(list)
    for e in pool:
        if len(e["short"]) >= 2:
            groups[(e["pos"], e["short"])].append(e["word"])
    out = {}
    for e in pool:
        stem = e["word"].lower()[:5]
        candidates = [
            w for w in groups.get((e["pos"], e["short"]), [])
            if w != e["word"]
            and w.lower()[:5] != stem
            and w.lower() not in e["word"].lower()
            and e["word"].lower() not in w.lower()
        ]
        out[e["word"]] = candidates[:2]
    return out


def accepted_answers(entry, synonyms, allow_synonyms):
    acc = []
    if entry["surface"].lower() != entry["word"].lower():
        acc.append(entry["word"])  # accept the dictionary lemma for an inflected blank
    if allow_synonyms:
        acc.extend(synonyms.get(entry["word"], []))
    seen, out = set(), []
    for a in acc:
        if a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return out[:3]


def select_words(pool, rng):
    """500 distinct words, spread evenly across the level's frequency range."""
    arr = sorted(pool, key=lambda e: (e["freq"], e["word"]))
    segment = len(arr) // LESSONS_PER_LEVEL
    if segment < WORDS_PER_LESSON:
        raise RuntimeError(f"word pool too small for {TARGET_WORDS} questions: {len(arr)}")
    chosen = []
    for s in range(LESSONS_PER_LEVEL):
        lo = s * segment
        hi = (s + 1) * segment if s < LESSONS_PER_LEVEL - 1 else len(arr)
        chunk = arr[lo:hi]
        if len(chunk) < WORDS_PER_LESSON:
            raise RuntimeError(f"segment {s} has only {len(chunk)} usable words")
        chosen.extend(rng.sample(chunk, WORDS_PER_LESSON))
    return chosen


def render_course(level):
    lid = level.lower()
    return (
        "---\n"
        f'id: "{lid}-fill-in-the-blank-course"\n'
        f'courseTitle: "{level} Fill in the Blank"\n'
        f'description: "{level} Fill in the Blank Course by Alan P"\n'
        'sourceLanguage: "en"\n'
        'targetLanguage: "en"\n'
        f'level: "{level}"\n'
        'visibility: "public"\n'
        "---\n"
    )


def lesson_topics(level, unit_index):
    base = THEMES[level][unit_index][1]
    return base + [f"{t} — {SECOND_PASS[i]}" for i, t in enumerate(base)]


def render_unit(level, unit_index, topics, words, synonyms, allow_synonyms):
    lid = level.lower()
    unit_title = THEMES[level][unit_index][0]
    out = [
        "---",
        f'unitTitle: "{level} Fill in the Blank – Unit {unit_index + 1}: {unit_title}"',
        'description: "20 lessons x 5 fill-in-the-blank questions"',
        f'icon: "{UNIT_ICONS[unit_index]}"',
        f'color: "{UNIT_COLORS[unit_index]}"',
        'targetLanguage: "en"',
        'sourceLanguage: "zh"',
        f'level: "{level}"',
        f'courseId: "{lid}-fill-in-the-blank-course"',
        'questionType: "fill-in-the-blank"',
        "---",
        "",
    ]

    for lesson_index in range(LESSONS_PER_UNIT):
        offset = unit_index * LESSONS_PER_UNIT + lesson_index
        entries = words[offset * WORDS_PER_LESSON:(offset + 1) * WORDS_PER_LESSON]
        out += [
            "---",
            f'lessonTitle: "Lesson {lesson_index + 1}: {topics[lesson_index]}"',
            f'description: "{level} vocabulary in context: {topics[lesson_index]}"',
            f'icon: "{LESSON_ICONS[lesson_index % len(LESSON_ICONS)]}"',
            f'color: "{LESSON_COLORS[lesson_index % len(LESSON_COLORS)]}"',
            "---",
            "",
        ]

        if level in MATCHING_PAIRS_LEVELS:
            out.append("[matching-pairs]")
            out.append("pairs:")
            for e in entries:
                out.append(f'  - "{e["word"]}" = "{e["short"]}"')
            out.append("srsWords: " + " ".join(f'"{e["word"]}"' for e in entries))
            out.append("")

        for e in entries:
            out += [
                "[fill-in-the-blank]",
                f'sentence: "{e["sentence"]}"',
                f'blank: "{e["surface"]}"',
                f'translation: "{e["hint"]}"',
            ]
            acc = accepted_answers(e, synonyms, allow_synonyms)
            if acc:
                out.append("acceptAlso: " + " ".join(f'"{a}"' for a in acc))
            out.append(f'srsWords: "{e["word"]}"')
            out.append("")

    return "\n".join(out).rstrip() + "\n"


def main():
    data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    for level in LEVELS:
        lid = level.lower()
        course_path = CONTENT_DIR / f"{lid}-fill-in-the-blank-course.md"
        if course_path.exists():
            print(f"{level}: already exists, skipped")
            continue

        rng = random.Random(SEED + LEVELS.index(level) * 1000)
        pool = build_pool(data, level)
        synonyms = build_synonyms(pool)
        words = select_words(pool, rng)
        if len(words) != TARGET_WORDS or len({e["word"] for e in words}) != TARGET_WORDS:
            raise RuntimeError(f"{level}: expected {TARGET_WORDS} distinct target words")

        allow_synonyms = level not in MATCHING_PAIRS_LEVELS
        files = {course_path: render_course(level)}
        for unit_index in range(UNITS):
            unit_path = CONTENT_DIR / f"{lid}-fill-in-the-blank-unit-{unit_index + 1}.md"
            files[unit_path] = render_unit(
                level, unit_index, lesson_topics(level, unit_index),
                words, synonyms, allow_synonyms,
            )

        try:
            for path, text in files.items():
                path.write_text(text, encoding="utf-8")
        except Exception:
            for path in files:
                path.unlink(missing_ok=True)
            raise

        pairs = sum(t.count("[matching-pairs]") for p, t in files.items() if p != course_path)
        fib = sum(t.count("[fill-in-the-blank]") for p, t in files.items() if p != course_path)
        print(
            f"{level}: wrote 1 course + {UNITS} units, {fib} fill-in-the-blank questions, "
            f"{pairs} matching-pairs blocks (pool={len(pool)} words)"
        )


if __name__ == "__main__":
    main()
