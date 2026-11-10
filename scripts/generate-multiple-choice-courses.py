#!/usr/bin/env python3
"""Generate CEFR A2-C2 Multiple Choice courses mirroring a1-multiple-choice-*.

Structure (identical to the hand-written A1 course):
  - <level>-multiple-choice-course.md       (1 per level)
  - <level>-multiple-choice-unit-1..5.md    (5 per level)
  - 10 lessons per unit, 20 [multiple-choice] questions per lesson
  - 5 x 10 x 20 = 1000 questions per level, 5000 across all five levels

Questions are built from words/english_merged.json, so every srsWords value is
a real dictionary lemma tagged at the course's own CEFR level. Each level uses
1000 distinct target words sampled evenly across that level's frequency range:
Unit 1 draws the most frequent words, Unit 5 the rarest, so difficulty rises.

Two question styles, weighted towards context at higher levels:
  - definition: "Which word means '<english_translation>'?"
  - context:    "Choose the word that best completes the sentence: '<example with ___>'"

Distractors are same-level, same-part-of-speech words with a nearby frequency
rank; words sharing a stem with the answer are excluded so there is exactly one
plausible correct choice. Deterministic (fixed seed) and idempotent: a level
whose course file already exists is skipped entirely.
"""

import json
import random
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_PATH = ROOT / "words" / "english_merged.json"
CONTENT_DIR = ROOT / "content"
SEED = 20261109

LEVELS = ["A2", "B1", "B2", "C1", "C2"]
CONTEXT_RATIO = {"A2": 0.30, "B1": 0.45, "B2": 0.60, "C1": 0.65, "C2": 0.70}

UNIT_ICONS = ["🎯", "📚", "🌍", "💬", "🧠"]
UNIT_COLORS = ["#4CAF50", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899"]
LESSON_ICONS = ["🔢", "🎨", "🐾", "🍎", "🧍", "📅", "👨‍👩‍👧‍👦", "🏃", "👕", "⛅"]
LESSON_COLORS = [
    "#1565C0", "#E53935", "#2E7D32", "#F57F17", "#6A1B9A",
    "#00695C", "#AD1457", "#4527A0", "#0277BD", "#00838F",
]

# 5 units x 10 lesson themes per level. The B1-C2 themes mirror the existing
# b1/b2/c1/c2 translation courses in this repository.
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

DEF_TEMPLATES = [
    "Which word means '{defn}'?",
    "Choose the word that means '{defn}'.",
    "Which word best matches this definition: '{defn}'?",
    "Select the word defined as '{defn}'.",
    "What word is defined as '{defn}'?",
]
CTX_TEMPLATES = [
    "Choose the word that best completes the sentence: '{sent}'",
    "Which word fits in the blank? '{sent}'",
    "Complete the sentence with the right word: '{sent}'",
]

POS_ALIASES = {
    "n": "noun", "v": "verb", "adj": "adjective", "adv": "adverb",
    "a": "adjective", "num": "number", "numeral": "number",
    "prep": "preposition", "pron": "pronoun", "int": "interjection",
}

# Only content words make good vocabulary questions. Function words and
# inflected "be"-forms (whose dictionary examples are often ungrammatical)
# are left out of the target pool.
CONTENT_POS = {"noun", "verb", "adjective", "adverb"}


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


def clean_definition(value):
    """Keep the first sense only: dictionary glosses are often semicolon lists.

    Also drops corrupted records such as "R not only so, but" (a stray single
    capital letter before a space) and glosses too short or too long to read.
    """
    s = clean_text(value, 260)
    if not s:
        return None
    s = s.split(";")[0].strip()
    if len(s) < 6 or len(s) > 150 or re.match(r"^[B-HJ-Zb-hj-z] ", s):
        return None
    # A gloss that is itself a single "-ly" adverb (e.g. "surprisingly" for
    # "even") makes an ambiguous question; use the example-sentence form instead.
    if re.fullmatch(r"[A-Za-z]+ly", s.rstrip("."), re.I):
        return None
    return s


def valid_word(word):
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z'\-]{2,29}", word))


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
    for form in variants(word):
        m = re.search(r"\b" + re.escape(form) + r"\b", sentence, re.I)
        if m:
            return sentence[:m.start()] + "___" + sentence[m.end():]
    return None


def build_pool(data, level):
    pool = []
    for e in data:
        if e.get("cefr_level") != level or not e.get("useful_for_flashcard"):
            continue
        word = str(e.get("word") or "").strip()
        if not valid_word(word):
            continue
        pos = norm_pos(e.get("pos"))
        if pos not in CONTENT_POS:
            continue
        definition = clean_definition(e.get("english_translation"))
        example = clean_text(e.get("example_sentence_english"), 170)
        # Grammar-only glosses ("past participle of ...") are not vocabulary.
        if definition and re.match(
            r"^(past participle|past tense|plural|present participle|"
            r"third person|comparative|superlative|form of|inflection)\b",
            definition, re.I,
        ):
            definition = None
        # A definition that literally contains the answer gives the game away.
        if definition and re.search(r"\b" + re.escape(word.lower()) + r"\b", definition, re.I):
            definition = None
        blank = blankify(word, example) if example else None
        if not definition and not blank:
            continue
        try:
            freq = int(e.get("word_frequency") or 10 ** 9)
        except (TypeError, ValueError):
            freq = 10 ** 9
        pool.append({
            "word": word,
            "def": definition,
            "blank": blank,
            "pos": norm_pos(e.get("pos")),
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
    # Fallback pool: every word in the level. Some part-of-speech groups (e.g.
    # "be-verb") are too small to supply three plausible distractors.
    all_arr = sorted(pool, key=lambda e: (e["freq"], e["word"]))
    for i, entry in enumerate(all_arr):
        entry["all_idx"] = i
    groups["_all"] = all_arr
    return groups


def pick_distractors(entry, groups, rng, count=3):
    word = entry["word"].lower()
    stem = word[:5]
    # Same-part-of-speech neighbours first; fall back to the whole level pool
    # for tiny POS groups (e.g. "be-verb") that cannot supply three options.
    pools = [
        (groups.get(entry["pos"], []), entry["pos_idx"]),
        (groups.get("_all", []), entry.get("all_idx", 0)),
    ]
    for arr, index in pools:
        if len(arr) < count + 1:
            continue
        for radius in (400, 1500, max(len(arr), 1)):
            lo, hi = max(0, index - radius), min(len(arr), index + radius + 1)
            candidates = [
                e for e in arr[lo:hi]
                if e["word"].lower() != word
                and e["word"].lower()[:5] != stem
                and e["word"].lower() not in word
                and word not in e["word"].lower()
                and (not entry["def"] or e["def"] != entry["def"])
            ]
            if len(candidates) >= count:
                return [e["word"] for e in rng.sample(candidates, count)]
    return []


def make_question(entry, want_context, groups, rng):
    word = entry["word"]
    if want_context and entry["blank"]:
        text = rng.choice(CTX_TEMPLATES).format(sent=entry["blank"])
    elif entry["def"]:
        text = rng.choice(DEF_TEMPLATES).format(defn=entry["def"])
    elif entry["blank"]:
        text = rng.choice(CTX_TEMPLATES).format(sent=entry["blank"])
    else:
        return None

    distractors = pick_distractors(entry, groups, rng)
    if len(distractors) < 3:
        return None

    options = distractors + [word]
    rng.shuffle(options)
    lines = ["[multiple-choice]", f'text: "{text}"', "choices:"]
    for option in options:
        marker = " (correct)" if option == word else ""
        lines.append(f'  - "{option}"{marker}')
    lines.append(f'srsWords: "{word}"')
    return "\n".join(lines)


def select_words(pool, rng):
    """1000 distinct words, spread evenly across the level's frequency range."""
    arr = sorted(pool, key=lambda e: (e["freq"], e["word"]))
    segment = len(arr) // 50
    if segment < 20:
        raise RuntimeError(f"word pool too small for 50x20 questions: {len(arr)}")
    chosen = []
    for s in range(50):
        lo = s * segment
        hi = (s + 1) * segment if s < 49 else len(arr)
        chunk = arr[lo:hi]
        if len(chunk) < 20:
            raise RuntimeError(f"segment {s} has only {len(chunk)} usable words")
        chosen.extend(rng.sample(chunk, 20))
    return chosen


def render_course(level):
    lid = level.lower()
    return (
        "---\n"
        f'id: "{lid}-multiple-choice-course"\n'
        f'courseTitle: "{level} Multiple Choice"\n'
        f'description: "{level} Multiple Choice Course by Alan P"\n'
        'sourceLanguage: "en"\n'
        'targetLanguage: "en"\n'
        f'level: "{level}"\n'
        'visibility: "public"\n'
        "---\n"
    )


def render_unit(level, unit_no, unit_title, topics, lessons):
    lid = level.lower()
    out = [
        "---\n"
        f'unitTitle: "Unit {unit_no}: {unit_title}"\n'
        'description: "10 lessons x 20 questions"\n'
        f'icon: "{UNIT_ICONS[unit_no - 1]}"\n'
        f'color: "{UNIT_COLORS[unit_no - 1]}"\n'
        'targetLanguage: "en"\n'
        'sourceLanguage: "en"\n'
        f'level: "{level}"\n'
        f'courseId: "{lid}-multiple-choice-course"\n'
        'questionType: "multiple-choice"\n'
        "---\n"
    ]
    for i, topic in enumerate(topics):
        out.append(
            "---\n"
            f'lessonTitle: "Lesson {i + 1}: {topic}"\n'
            f'description: "{level} vocabulary practice: {topic}"\n'
            f'icon: "{LESSON_ICONS[i]}"\n'
            f'color: "{LESSON_COLORS[i]}"\n'
            "---\n"
        )
        out.append("\n\n".join(lessons[i]))
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def main():
    data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    for level in LEVELS:
        lid = level.lower()
        course_path = CONTENT_DIR / f"{lid}-multiple-choice-course.md"
        if course_path.exists():
            print(f"{level}: already exists, skipped")
            continue

        rng = random.Random(SEED + LEVELS.index(level) * 1000)
        pool = build_pool(data, level)
        groups = index_by_pos(pool)
        words = select_words(pool, rng)
        if len(words) != 1000 or len({e["word"] for e in words}) != 1000:
            raise RuntimeError(f"{level}: expected 1000 distinct target words")

        themes = THEMES[level]
        course_path.write_text(render_course(level), encoding="utf-8")

        for unit_index in range(5):
            unit_title, topics = themes[unit_index]
            lessons = []
            for lesson_index in range(10):
                offset = (unit_index * 10 + lesson_index) * 20
                questions = []
                for entry in words[offset:offset + 20]:
                    want_context = rng.random() < CONTEXT_RATIO[level]
                    question = make_question(entry, want_context, groups, rng)
                    if question is None:
                        question = make_question(entry, False, groups, rng)
                    if question is None:
                        raise RuntimeError(
                            f"{level}: could not build a question for '{entry['word']}'"
                        )
                    questions.append(question)
                lessons.append(questions)

            unit_path = CONTENT_DIR / f"{lid}-multiple-choice-unit-{unit_index + 1}.md"
            unit_path.write_text(
                render_unit(level, unit_index + 1, unit_title, topics, lessons),
                encoding="utf-8",
            )

        print(f"{level}: wrote 1 course + 5 units, 1000 questions (pool={len(pool)} words)")


if __name__ == "__main__":
    main()
