#!/usr/bin/env python3
"""Generate CEFR A2-C2 Listening courses mirroring a1-listening-*.

Structure (mirrors the hand-written A1 listening course):
  - <level>-listening-course.md          (1 per level)
  - <level>-listening-unit-1..5.md       (5 per level)
  - 20 lessons per unit, 10 [listening] questions per lesson
  - 5 x 20 x 10 = 1000 questions / 1000 distinct target words per level

Every question is a listening-discrimination item, exactly like A1: the
learner hears `text` and picks the matching sentence out of three near-identical
choices. The correct choice is a real example sentence from
words/english_merged.json; the two distractors are the *same* sentence with the
target word swapped for a different same-level, same-part-of-speech word of
nearby frequency. All three choices differ in exactly one word, so the task
genuinely tests careful listening rather than reading.

Quality rules learned from the dictionary data:
  - Only nouns / verbs / adjectives are targets (adverbs and function words
    produce broken sentences when swapped, e.g. "performed however").
  - Lemmas that are really inflections/comparatives ("happier", "cacti"), or
    whose Chinese gloss contains stray Latin text, are excluded.
  - A small stoplist drops function words ("ever", "even", "yeah").
  - The target must appear exactly once, in its exact base form, so swapping
    lemma -> lemma keeps tense, number and agreement intact.
  - An "a"/"an" directly before the target is re-computed for the replacement
    so article agreement never breaks.
  - Sentences are restricted to ASCII printable text for clean TTS.

`srsWords` is the single dictionary lemma, consistent with the A2-C2 Multiple
Choice / Fill in the Blank courses generated in the same session. Courses are
marked `visibility: "private"` so they are VIP in the deployed database.

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
SEED = 20261111

LEVELS = ["A2", "B1", "B2", "C1", "C2"]

UNITS = 5
LESSONS_PER_UNIT = 20
QUESTIONS_PER_LESSON = 10
LESSONS_PER_LEVEL = UNITS * LESSONS_PER_UNIT            # 100
TARGET_WORDS = LESSONS_PER_LEVEL * QUESTIONS_PER_LESSON  # 1000

UNIT_ICONS = ["🔢", "👥", "🧭", "💼", "🌿"]
UNIT_COLORS = ["#3498DB", "#E67E22", "#16A085", "#8E44AD", "#27AE60"]
LESSON_ICONS = ["1️⃣", "🎨", "🐾", "🍎", "🧍", "📅", "🏃", "👕", "⛅", "🎵"]
LESSON_COLORS = [
    "#3498DB", "#E67E22", "#16A085", "#8E44AD", "#27AE60",
    "#F39C12", "#2980B9", "#C0392B", "#7F8C8D", "#D35400",
]

# 5 units x 10 lesson themes per level, identical to the A2-C2 Multiple Choice
# and Fill in the Blank courses so the whole CEFR set reads consistently.
# Lessons 11-20 are a second, context-oriented pass over the same ten topics.
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
    "Review", "Practice", "Synonyms & Nuance", "Listening Practice",
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
# Adverbs are intentionally excluded: substituting an adverb in a real
# sentence frequently breaks it ("performed however", "didn't underwater say").
TARGET_POS = {"noun", "verb", "adjective"}
ASCII_PRINTABLE = re.compile(r"^[\x20-\x7e]+$")

# Function words / light verbs make poor listening targets and produce broken
# distractors. The dictionary's own example for "yeah", for instance, is
# "The team performed yeah in the final." — unusable either way.
STOP_WORDS = set(
    "ever even yeah yep yes no not very just still also really quite rather almost "
    "always never often sometimes already yet too so such only much more most less "
    "least here there now then again once perhaps maybe probably indeed however "
    "actually simply nearly hardly fairly pretty well back get got make made take "
    "took give gave go went come came say said see saw know knew think thought want "
    "wanted need used using become became seem seemed let put set keep kept"
    .split()
)

JUNK_GLOSS = re.compile(r"复数|过去式|过去分词|比较级|最高级|第三人称")
VOWEL_START = re.compile(r"^[AEIOUaeiou]")


def norm_pos(value):
    p = (value or "other").strip().lower()
    return POS_ALIASES.get(p, p)


def clean_text(value, limit):
    if not value:
        return None
    s = str(value).replace("\\", "").replace('"', "'")
    s = s.replace("{", "(").replace("}", ")")
    s = re.sub(r"\s+", " ", s).strip()
    if not s or len(s) > limit:
        return None
    return s


def first_sense_group(raw):
    return str(raw or "").split("；")[0].split(";")[0].strip()


def valid_word(word):
    # Single plain lowercase lemma: no hyphens, apostrophes, acronyms or spaces.
    return bool(re.fullmatch(r"[a-z]{3,29}", word))


def clean_lemma(word, raw):
    """Reject lemmas that are inflections or have dirty/foreign-language glosses."""
    gloss = str(raw or "")
    if JUNK_GLOSS.search(gloss) or re.search(re.escape(word), gloss, re.I):
        return False
    core = re.sub(r"^[a-zA-Z]+\.\s*", "", first_sense_group(gloss))
    # Records with stray Latin text ("DOS内部命令", "（earn的现在分词）") are dirty.
    if re.search(r"[A-Za-z]{3,}", core):
        return False
    # Comparatives/superlatives stored as lemmas ("更快乐的", "最快乐的").
    if re.match(r"^[更最].+的", core.strip()):
        return False
    return True


def exact_match_positions(sentence, word):
    """Positions where the sentence contains the lemma in its EXACT base form.

    Inflected surfaces ("dogs" for "dog") are ignored: swapping a plural for a
    bare singular lemma would produce an ungrammatical choice.
    """
    return [
        m for m in re.finditer(r"\b" + re.escape(word) + r"\b", sentence, re.I)
        if m.group(0).lower() == word.lower()
    ]


def build_pool(data, level):
    pool = []
    for e in data:
        if e.get("cefr_level") != level or not e.get("useful_for_flashcard"):
            continue
        word = str(e.get("word") or "").strip()
        if not valid_word(word) or word in STOP_WORDS:
            continue
        pos = norm_pos(e.get("pos"))
        if pos not in TARGET_POS:
            continue
        if not clean_lemma(word, e.get("definition_zh")):
            continue
        example = clean_text(e.get("example_sentence_english"), 150)
        if not example or len(example) < 15 or "___" in example:
            continue
        if not ASCII_PRINTABLE.match(example):
            continue
        if "(correct)" in example.lower() or "[listening]" in example.lower():
            continue
        # Exactly one exact-form occurrence keeps every choice differing in
        # precisely one word.
        if len(exact_match_positions(example, word)) != 1:
            continue
        try:
            freq = int(e.get("word_frequency") or 10 ** 9)
        except (TypeError, ValueError):
            freq = 10 ** 9
        pool.append({
            "word": word,
            "sentence": example,
            "pos": pos,
            "freq": freq,
            "pos_idx": 0,
        })
    return pool


def index_by_pos(pool):
    groups = defaultdict(list)
    for entry in pool:
        groups[entry["pos"]].append(entry)
    for arr in groups.values():
        arr.sort(key=lambda e: (e["freq"], e["word"]))
        for i, entry in enumerate(arr):
            entry["pos_idx"] = i
    return groups


def pick_distractors(entry, groups, rng, count=2):
    """Same-level, same-POS words with a nearby frequency rank."""
    word = entry["word"].lower()
    stem = word[:5]
    sentence_words = {
        w.lower() for w in re.findall(r"[A-Za-z]+", entry["sentence"])
    }
    arr = groups.get(entry["pos"], [])
    if len(arr) < count + 1:
        return []
    index = entry["pos_idx"]
    for radius in (300, 1200, max(len(arr), 1)):
        lo, hi = max(0, index - radius), min(len(arr), index + radius + 1)
        candidates = [
            e for e in arr[lo:hi]
            if e["word"].lower() != word
            and e["word"].lower()[:5] != stem
            and e["word"].lower() not in word
            and word not in e["word"].lower()
            # Never inject a word already present in the sentence, or the
            # "one word differs" property is lost.
            and e["word"].lower() not in sentence_words
        ]
        if len(candidates) >= count:
            return [e["word"] for e in rng.sample(candidates, count)]
    return []


def swap_word(sentence, word, replacement):
    """Replace the single exact-form occurrence, preserving capitalisation and
    re-computing a preceding a/an so article agreement stays correct."""
    positions = exact_match_positions(sentence, word)
    if len(positions) != 1:
        return None
    m = positions[0]
    surface = m.group(0)
    repl = replacement
    if surface[:1].isupper():
        repl = replacement[:1].upper() + replacement[1:]

    before = sentence[:m.start()]
    after = sentence[m.end():]

    # "a"/"an" immediately before the target must agree with the replacement.
    art = re.search(r"\b([Aa])(n?)\s+$", before)
    if art:
        article = "an" if VOWEL_START.match(repl) else "a"
        if art.group(1).isupper():
            article = article.capitalize()
        before = before[:art.start()] + article + " "

    return before + repl + after


def make_question(entry, groups, rng):
    distractors = pick_distractors(entry, groups, rng)
    if len(distractors) < 2:
        return None

    correct = entry["sentence"]
    variants = []
    for d in distractors:
        variant = swap_word(correct, entry["word"], d)
        if not variant or variant == correct:
            return None
        variants.append(variant)
    if variants[0] == variants[1]:
        return None

    options = [(correct, True), (variants[0], False), (variants[1], False)]
    rng.shuffle(options)

    lines = [
        "[listening]",
        f'text: "{correct}"',
        "ttsLang: en-US",
        "mode: choices",
        "choices:",
    ]
    for text, is_correct in options:
        marker = " (correct)" if is_correct else ""
        lines.append(f'  - "{text}"{marker}')
    lines.append(f'srsWords: "{entry["word"]}"')
    return "\n".join(lines)


def select_words(pool, rng):
    """1000 distinct words, spread evenly across the level's frequency range."""
    arr = sorted(pool, key=lambda e: (e["freq"], e["word"]))
    segment = len(arr) // LESSONS_PER_LEVEL
    if segment < QUESTIONS_PER_LESSON:
        raise RuntimeError(
            f"word pool too small for {TARGET_WORDS} questions: {len(arr)}"
        )
    chosen = []
    for s in range(LESSONS_PER_LEVEL):
        lo = s * segment
        hi = (s + 1) * segment if s < LESSONS_PER_LEVEL - 1 else len(arr)
        chunk = arr[lo:hi]
        if len(chunk) < QUESTIONS_PER_LESSON:
            raise RuntimeError(f"segment {s} has only {len(chunk)} usable words")
        chosen.extend(rng.sample(chunk, QUESTIONS_PER_LESSON))
    return chosen


def render_course(level):
    lid = level.lower()
    return (
        "---\n"
        f'id: "{lid}-listening-course"\n'
        f'courseTitle: "{level} Listening"\n'
        f'description: "{level} Listening Course (5 Units x 20 Lessons x 10 Questions) by Alan P"\n'
        'sourceLanguage: "en"\n'
        'targetLanguage: "en"\n'
        f'level: "{level}"\n'
        # Courses created in this session are VIP (non-public). Parsed by
        # parseCourseMarkdown() and honoured by seed-content.ts.
        'visibility: "private"\n'
        "---\n"
    )


def lesson_topics(level, unit_index):
    base = THEMES[level][unit_index][1]
    return base + [f"{t} — {SECOND_PASS[i]}" for i, t in enumerate(base)]


def render_unit(level, unit_index, topics, words, groups, rng):
    lid = level.lower()
    unit_title = THEMES[level][unit_index][0]
    out = [
        "---",
        f'unitTitle: "Unit {unit_index + 1}: {unit_title}"',
        'description: "Listen and choose the sentence you hear (20 lessons x 10 questions)"',
        f'icon: "{UNIT_ICONS[unit_index]}"',
        f'color: "{UNIT_COLORS[unit_index]}"',
        'targetLanguage: "en"',
        'sourceLanguage: "zh"',
        f'level: "{level}"',
        f'courseId: "{lid}-listening-course"',
        'questionType: "listening"',
        "---",
        "",
    ]

    for lesson_index in range(LESSONS_PER_UNIT):
        offset = (unit_index * LESSONS_PER_UNIT + lesson_index) * QUESTIONS_PER_LESSON
        entries = words[offset:offset + QUESTIONS_PER_LESSON]
        out += [
            "---",
            f'lessonTitle: "Lesson {lesson_index + 1}: {topics[lesson_index]}"',
            f'description: "{level} listening practice: {topics[lesson_index]}"',
            f'icon: "{LESSON_ICONS[lesson_index % len(LESSON_ICONS)]}"',
            f'color: "{LESSON_COLORS[lesson_index % len(LESSON_COLORS)]}"',
            "---",
            "",
        ]
        for e in entries:
            question = make_question(e, groups, rng)
            if question is None:
                raise RuntimeError(
                    f"{level}: could not build a listening question for '{e['word']}'"
                )
            out.append(question)
            out.append("")

    return "\n".join(out).rstrip() + "\n"


def main():
    data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    for level in LEVELS:
        lid = level.lower()
        course_path = CONTENT_DIR / f"{lid}-listening-course.md"
        if course_path.exists():
            print(f"{level}: already exists, skipped")
            continue

        rng = random.Random(SEED + LEVELS.index(level) * 1000)
        pool = build_pool(data, level)
        groups = index_by_pos(pool)
        words = select_words(pool, rng)
        if len(words) != TARGET_WORDS or len({e["word"] for e in words}) != TARGET_WORDS:
            raise RuntimeError(f"{level}: expected {TARGET_WORDS} distinct target words")

        files = {course_path: render_course(level)}
        for unit_index in range(UNITS):
            unit_path = CONTENT_DIR / f"{lid}-listening-unit-{unit_index + 1}.md"
            files[unit_path] = render_unit(
                level, unit_index, lesson_topics(level, unit_index),
                words, groups, rng,
            )

        try:
            for path, text in files.items():
                path.write_text(text, encoding="utf-8")
        except Exception:
            for path in files:
                path.unlink(missing_ok=True)
            raise

        listening = sum(
            t.count("[listening]") for p, t in files.items() if p != course_path
        )
        print(
            f"{level}: wrote 1 course + {UNITS} units, {listening} listening questions "
            f"(pool={len(pool)} words)"
        )


if __name__ == "__main__":
    main()
