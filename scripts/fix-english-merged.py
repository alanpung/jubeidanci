#!/usr/bin/env python3
"""
Fill the gaps in words/english_merged.json.

Three kinds of gap are closed here:

  1. ipa                       — 685 entries have no phonetic transcription.
                                  Recovered from the CMU Pronouncing Dictionary
                                  (ARPABET) and rewritten in the British RP
                                  style the file already uses (ː ə ʌ ɒ …).

  2. example_sentence_english  — 1238 entries have no example sentence.
                                  Built from the entry's own part of speech and
                                  definition so the sentence reads like a real
                                  one instead of "This is an example using the
                                  word X.".

  3. inflected forms            — course vocabulary legitimately contains
                                  inflected forms ("brushes", "travels") that
                                  the base-form dictionary never had, so the
                                  Words page rendered them with an empty
                                  definition. Every word the course catalog
                                  actually uses is now present, with the
                                  base form's meaning and a matching example.

The script is idempotent: re-running it on an already-repaired file changes
nothing.
"""

import json
import re
import os
import sys
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DICT_PATH = os.path.join(ROOT, "words", "english_merged.json")
CONTENT_DIR = os.path.join(ROOT, "content")

# ---------------------------------------------------------------------------
# 1. ARPABET -> British RP IPA
# ---------------------------------------------------------------------------
#
# The file's own IPA style is British RP:
#   r (not ɹ)   ɑː   ɒ   ʌ   ə/ә   ɜː   ɪ   ʊ   eɪ   aɪ   əʊ   ɔɪ
# Stress is written with the apostrophe-style mark ' before the syllable
# (the dominant convention in this file) and with ˌ for secondary stress.

_CMU_CONSONANTS = {
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "DX": "ð", "F": "f",
    "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k", "L": "l", "M": "m",
    "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ",
    "T": "t", "TH": "θ", "V": "v", "W": "w", "WH": "w", "Y": "j",
    "Z": "z", "ZH": "ʒ",
}

# ARPABET vowels are American; RP differs in the places that matter for a
# learner dictionary:
#   AH0/AA0 -> ə   (schwa, not ɑ)
#   AA1     -> ɑː  (the "father" vowel is long in RP)
#   ER0     -> ə   (unstressed r-coloured vowel)
#   ER1     -> ɜː  (as in "her")
#   OW      -> əʊ  (RP "goat")
#   AO      -> ɔː  (RP "thought")
_CMU_VOWELS = {
    "AA": "ɑː", "AE": "æ", "AH": "ʌ", "AO": "ɔː", "AW": "aʊ",
    "AX": "ə", "AY": "aɪ", "EH": "e", "ER": "ə", "EY": "eɪ",
    "IH": "ɪ", "IY": "iː", "OW": "əʊ", "OY": "ɔɪ", "UH": "ʊ",
    "UW": "uː",
}

# Vowels that carry a primary stress mark.
_PRIMARY = {"AA", "AE", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY",
            "OW", "OY", "UH", "UW"}

# ARPABET "AH0" (schwa) is written "ə" in the file; "AH0" after a fricative
# is written "ә" by the same source the file was built from. We use the
# plain "ə" everywhere — it is the more standard transcription.
_SCHWA = "ə"


def _strip_stress(phone):
    """ARPABET phone without its stress digit."""
    return phone.rstrip("0123456789")


def _arpabet_to_ipa(phones, stress_mark="'"):
    """Convert one CMU pronunciation (list of ARPABET phones) to RP IPA."""
    out = []
    for i, raw in enumerate(phones):
        # ARPABET vowels carry a stress digit: AA1 (primary), AA0 (unstressed).
        ph = _strip_stress(raw)
        stress = raw[len(ph):]
        if ph in _CMU_CONSONANTS:
            out.append(_CMU_CONSONANTS[ph])
        elif ph in _CMU_VOWELS:
            v = _CMU_VOWELS[ph]
            if ph == "AH" and stress == "0":
                v = _SCHWA
            if ph == "ER":
                # Accented "er" -> ɜː (as in "her"), unstressed -> ə
                v = "ɜː" if stress == "1" else _SCHWA
            if stress == "1" and v != _SCHWA:
                out.append(stress_mark + v)
            else:
                out.append(v)
        else:
            return None
    return "".join(out)


def load_cmu():
    """Load the CMU pronouncing dictionary, if the package is installed."""
    try:
        import cmudict
    except ImportError:
        return {}
    out = {}
    for word, prons in cmudict.dict().items():
        # cmudict maps a word to a LIST of pronunciations, each one a list of
        # ARPABET phones. Take the first (primary) pronunciation.
        if prons and prons[0]:
            out[word.lower()] = list(prons[0])
    return out


# ---------------------------------------------------------------------------
# 2. Example sentence generation
# ---------------------------------------------------------------------------

# Definite / indefinite articles for the subject slot.
_A = {"a", "an", "the"}

# Sentence frames keyed by the POS tag the dictionary uses.
#
# Each frame is a complete, grammatical English sentence with the target
# word plugged into the right slot:
#   {s}  the subject      ("The {s} ...")
#   {v}  the verb         ("They decided to {v} ...")
#   {a}  "a" / "an"
#
# The frames are written so they stay grammatical whatever noun, verb,
# adjective or adverb is substituted in — an adverb must modify a verb, an
# adjective must modify a noun, and so on.
_FRAMES = {
    "noun": [
        "The {s} is important in this context.",
        "We talked about the {s} in class.",
        "This {s} comes up often in everyday English.",
        "I wrote the {s} down to remember it.",
        "She explained the {s} to me clearly.",
    ],
    "verb": [
        "They want to {v} before the weekend.",
        "We should {v} the plan carefully.",
        "He will {v} again tomorrow.",
        "Please {v} as soon as you can.",
        "They decided to {v} together.",
    ],
    "adjective": [
        "The result was {w} and everyone was pleased.",
        "The instructions were {w} and easy to follow.",
        "It was {w} experience for everyone.",
        "The room looked {w} after the cleanup.",
        "We had {w} weather this week.",
    ],
    "adverb": [
        "She completed the task {w}.",
        "He answered the question {w}.",
        "They worked {w} on the project.",
        "The team performed {w} in the final.",
        "She spoke {w} during the meeting.",
    ],
    "pronoun": [
        "We used {s} in the sentence above.",
        "{s} refers to the person we mentioned earlier.",
        "It is important to understand how {s} works here.",
        "Do you know what {s} means in this context?",
    ],
    "preposition": [
        "We arrived {w} the scheduled time for the meeting.",
        "She sat down {w} the window.",
        "The cat was sleeping {w} the sofa.",
        "He walked {w} the river with his dog.",
        "They talked {w} the plan for an hour.",
    ],
    "conjunction": [
        "We wanted to go, {w} it was raining heavily.",
        "She studied hard, {w} she passed the exam.",
        "He was tired, {w} he kept working.",
        "I called you, {w} you were not at home.",
    ],
    "determiner": [
        "We need {s} before we can start.",
        "Give me {art} moment to think.",
        "There is {art} difference between the two.",
        "She only spoke {art} few words.",
    ],
    "article": [
        "Give me {art} minute, please.",
        "{art} useful example appeared in the text.",
        "It takes {art} hour to finish the work.",
    ],
    "auxiliary": [
        "They {s} ready before we arrived.",
        "We {s} told about the change.",
        "She {s} already finished the report.",
    ],
    "modal": [
        "You {s} be right about that.",
        "They {s} arrive on time.",
        "We {s} have to leave now.",
    ],
    "numeral": [
        "{s} people joined the meeting.",
        "There were {s} tickets left.",
        "The journey took {s} hours.",
    ],
    "interjection": [
        "Everyone shouted {s} when they saw the result.",
        "He said {s} and walked away.",
        "She looked up and said {s} in surprise.",
    ],
    "phrase": [
        "We learned the expression {s} in this lesson.",
        "The phrase {s} appears in many texts.",
        "He used the phrase {s} to explain his idea.",
    ],
    "idiom": [
        "They used the idiom {s} in conversation.",
        "I find the idiom {s} very useful.",
        "The teacher explained the idiom {s} to us.",
    ],
    "abbreviation": [
        "The abbreviation {s} is common in this field.",
        "We write {s} to save time.",
        "Do you know what {s} stands for?",
    ],
    "adjectival": [
        "The {s} part of the sentence is clear.",
        "That is a {s} use of the word.",
    ],
    "adverbial": [
        "The {s} clause comes at the end.",
        "It is an {s} phrase in this sentence.",
    ],
}

_DEFAULT_FRAMES = [
    "The word {s} came up in today's lesson.",
    "We learned about {s} in class.",
    "This is a useful example of {s}.",
    "She explained the meaning of {s} to me.",
]


def _pos_key(pos):
    """Map the dictionary's free-text POS tag onto a frame set."""
    p = (pos or "").lower().strip()
    if not p:
        return None
    # The dictionary uses compound tags like "be-verb", "have-verb".
    # Order matters: "adverb" and "adjective" both contain "verb", and
    # "preposition" contains "position", so the longer tags must be tested
    # first or an adverb would be framed as a verb.
    if "adverb" in p:
        return "adverb"
    if "adjective" in p:
        return "adjective"
    if "pronoun" in p:
        return "pronoun"
    if "preposition" in p:
        return "preposition"
    if "conjunction" in p:
        return "conjunction"
    if "determiner" in p or "article" in p:
        return "determiner"
    if "modal" in p:
        return "modal"
    if "aux" in p:
        return "auxiliary"
    if "numeral" in p or "number" in p:
        return "numeral"
    if "interjection" in p:
        return "interjection"
    if "abbreviation" in p or "abbr" in p:
        return "abbreviation"
    if "idiom" in p:
        return "idiom"
    if "phrase" in p:
        return "phrase"
    if "verb" in p:
        return "verb"
    if "noun" in p:
        return "noun"
    return None


def _article(word):
    """Pick "a" or "an" for the given word."""
    w = word.lstrip("'").lower()
    if not w:
        return "a"
    if re.match(r"^[aeiou]", w):
        # "hour", "university" — silent h starts a consonant sound.
        if re.match(r"^(hour|honest|honour|heir)", w):
            return "an"
        return "an"
    return "a"


def _surface(word):
    """The word as it should appear inside a sentence."""
    w = word.strip()
    # Slash alternatives ("airplane/aeroplane") read badly in a sentence;
    # use the first alternative.
    if "/" in w:
        w = w.split("/")[0]
    w = w.strip()
    # Keep multi-word entries and hyphenated entries as they are.
    return w


def _slot_values(frame, word, surface):
    """Fill the template slots of a frame.

    {w}   the target word itself
    {s}   the target word as a subject ("The {s} is ...")
    {v}   the target word as a verb ("they decided to {v} ...")
    {art} the indefinite article "a" / "an"
    """
    art = _article(surface.split()[0] if surface else word)
    out = frame
    out = out.replace("{art}", art)
    out = out.replace("{w}", surface)
    out = out.replace("{s}", surface)
    out = out.replace("{v}", surface)
    return out


def build_example(entry, index=0):
    """Compose an example sentence for an entry that has none."""
    word = entry.get("word", "")
    surface = _surface(word)
    if not surface:
        return ""
    key = _pos_key(entry.get("pos"))
    frames = _FRAMES.get(key) if key else None
    if not frames:
        frames = _DEFAULT_FRAMES
    # A participle used as an adjective ("annoyed", "abandoned") reads badly
    # in the plain adjective frames — "The result was annoyed" is wrong. Give
    # it a passive frame instead.
    if key == "adjective" and _looks_like_participle(surface):
        frames = _PARTICIPLE_FRAMES
    frame = frames[index % len(frames)]
    return _slot_values(frame, word, surface)


# Frames for participles that are used adjectivally.
_PARTICIPLE_FRAMES = [
    "Everyone was {w} by the news.",
    "The report was {w} by the manager.",
    "She felt {w} after the meeting.",
    "The room was left {w} and cold.",
    "He was {w} when he heard the news.",
]


def _looks_like_participle(word):
    """True for "-ed" participles and "-ing" forms used as adjectives.

    "-ing" is ambiguous: "confusing" is an adjective, "build" is not, and
    "centralizing" is a verb. Only the "-ed" form reliably signals a
    participle, so that is what we key on.
    """
    w = word.lower()
    if w.endswith("ing"):
        return False
    if w.endswith("ed") and len(w) > 4:
        # "aged", "red", "bed" are ordinary adjectives, not participles.
        return w not in ("aged", "red", "bed", "wed", "shed", "sled",
                         "sacred", "naked", "wicked", "learned", "aged")
    return False


def _inflected_example(base, word):
    """Adapt the base form's example sentence to the inflected form.

    The base sentence is already grammatical ("I need a new brush for my
    hair."), so the inflected form is produced by substituting the word and
    agreeing the subject with it. A plural noun takes a plural subject and
    the third-person verb form ("brush" -> "brushes": "She needs a new
    brush for her hair."); a past-tense verb only changes the verb.
    """
    base_word = (base.get("word") or "").strip()
    base_ex = (base.get("example_sentence_english") or "").strip()
    if not base_word or not base_ex:
        return ""
    if base_ex.startswith("This is an example using the word"):
        return ""

    surface = _surface(word)
    base_surface = _surface(base_word)
    if not surface or surface.lower() == base_surface.lower():
        return ""

    # Only substitute when the base word actually appears in the sentence.
    pattern = re.compile(r"\b" + re.escape(base_surface) + r"\b", re.IGNORECASE)
    if not pattern.search(base_ex):
        return ""

    plural = _is_plural(surface)
    irregular_plural = surface.lower() in _IRREGULAR_PLURALS

    # Replace the whole noun phrase — determiner, adjectives and noun — so
    # "a new brush" becomes "some new brushes" rather than "a new brushes".
    if plural:
        phrase = re.compile(
            r"\b(?:an?|one|the|this|that|these|those|some|many|several)\s+"
            r"((?:\w+\s+){0,2})" + re.escape(base_surface) + r"\b",
            re.IGNORECASE)
        m = phrase.search(base_ex)
        if m:
            det = m.group(0).split()[0].lower()
            adjs = m.group(1)
            # "a" / "one" / "this" / "that" cannot govern a plural noun.
            if det in ("a", "an", "one", "this", "that"):
                det = "some"
            elif det in ("these", "those"):
                det = "those"
            # "a lot of studies" must not become "some lot of studies".
            if adjs.strip().lower().startswith("lot of"):
                det = "a"
            out = base_ex[: m.start()] + f"{det} {adjs}{surface}" + base_ex[m.end():]
            return _finish_example(out, plural, irregular_plural)
    else:
        # A singular form replacing a plural needs a determiner.
        phrase = re.compile(
            r"\b(?:these|those|some|many|several)\s+"
            r"((?:\w+\s+){0,2})" + re.escape(base_surface) + r"\b",
            re.IGNORECASE)
        m = phrase.search(base_ex)
        if m:
            adjs = m.group(1)
            out = base_ex[: m.start()] + f"the {adjs}{surface}" + base_ex[m.end():]
            return _finish_example(out, plural, irregular_plural)

    out = pattern.sub(surface, base_ex)

    # A plural noun does not take "a" / "an"; fix a leftover article.
    if plural:
        out = re.sub(r"\b(an?)\s+(" + re.escape(surface) + r")\b",
                     r"\2", out, flags=re.IGNORECASE)
        out = re.sub(r"\b(one)\s+(" + re.escape(surface) + r")\b",
                     r"some \2", out, flags=re.IGNORECASE)
        out = re.sub(r"\blike\s+(an?)\s+(" + re.escape(surface) + r")\b",
                     r"like \2", out, flags=re.IGNORECASE)
    return _finish_example(out, plural, irregular_plural)


def _finish_example(sentence, plural, irregular_plural):
    """Tidy up an adapted sentence.

    A plural subject needs a plural verb ("She is a happy children" ->
    "The children were happy"), and a sentence never starts in lower case.
    """
    out = sentence.strip()
    if not out:
        return out
    if irregular_plural:
        # The base sentence used a singular pronoun subject ("She is a happy
        # child"). With a plural noun the subject has to become plural too.
        out = re.sub(r"\b(he|she|it)\s+(is|has|was)\b",
                     lambda m: m.group(1) + " " + {
                         "is": "are", "has": "have", "was": "were"
                     }[m.group(2).lower()], out, flags=re.IGNORECASE)
        out = re.sub(r"\b(He|She|It)\s+(Is|Has|Was)\b",
                     lambda m: m.group(1) + " " + {
                         "Is": "Are", "Has": "Have", "Was": "Were"
                     }[m.group(2)], out)
        # A singular pronoun subject becomes "They".
        out = re.sub(r"\b(he|she|it)\s+(are|have|were)\b", r"They \2", out,
                     flags=re.IGNORECASE)
        out = re.sub(r"\b(He|She|It)\s+(Are|Have|Were)\b", r"They \2", out)
        # A singular article in front of the plural noun goes away.
        out = re.sub(r"\ban?\s+(\w+\s+)*(" + r"[a-z]+" + r")\b",
                     lambda m: (m.group(1) or "") + m.group(2), out,
                     count=1, flags=re.IGNORECASE)
    # Capitalise the first letter of the sentence.
    if out and out[0].islower():
        out = out[0].upper() + out[1:]
    return out


def _is_plural(word):
    """True when the surface form is a plural noun."""
    w = word.lower()
    if not w.endswith("s"):
        return False
    if w.endswith(("ss", "us", "is", "os")):
        return False
    return True


# Irregular plurals whose determiner needs "some"/"the", not "a".
_IRREGULAR_PLURALS = {
    "children", "men", "women", "people", "feet", "teeth", "geese", "mice",
    "lice", "oxen", "dice", "pence", "knives", "wives", "lives", "leaves",
    "halves", "wolves", "thieves", "loaves", "selves", "calves", "shelves",
    "sheaves", "elves", "scarves", "dwarves",
}


# ---------------------------------------------------------------------------
# 3. Inflected forms used by the course catalog
# ---------------------------------------------------------------------------

def collect_catalog_words():
    """Every word the course markdown files list as SRS vocabulary."""
    found = set()
    if not os.path.isdir(CONTENT_DIR):
        return found
    for fn in os.listdir(CONTENT_DIR):
        if not fn.endswith(".md"):
            continue
        path = os.path.join(CONTENT_DIR, fn)
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for m in re.finditer(r'^(?:srsWords|front|blank|word)\s*:\s*"([^"]+)"',
                             text, re.M):
            w = m.group(1).strip()
            if w:
                found.add(w)
    return found


# Irregular inflections: plural / past / participle -> base form.
_IRREGULAR = {
    "children": "child", "men": "man", "women": "woman", "people": "person",
    "feet": "foot", "teeth": "tooth", "geese": "goose", "mice": "mouse",
    "lice": "louse", "oxen": "ox", "dice": "die", "pence": "penny",
    "knives": "knife", "wives": "wife", "lives": "life", "leaves": "leaf",
    "halves": "half", "wolves": "wolf", "thieves": "thief", "loaves": "loaf",
    "selves": "self", "calves": "calf", "shelves": "shelf", "sheaves": "sheaf",
    "elves": "elf", "scarves": "scarf", "dwarves": "dwarf",
    "men": "man", "criterion": "criterion", "phenomena": "phenomenon",
    "criteria": "criterion", "data": "datum", "media": "medium",
    "analyses": "analysis", "crises": "crisis", "theses": "thesis",
    "diagnoses": "diagnosis", "parentheses": "parenthesis",
    "indices": "index", "matrices": "matrix", "vertices": "vertex",
    "appendices": "appendix", "formulae": "formula", "alumni": "alumnus",
    "fungi": "fungus", "nuclei": "nucleus", "radii": "radius",
    "stimuli": "stimulus", "syllabi": "syllabus", "alumni": "alumnus",
    "was": "be", "were": "be", "been": "be", "am": "be", "is": "be",
    "are": "be", "had": "have", "has": "have", "did": "do", "does": "do",
    "done": "do", "said": "say", "went": "go", "gone": "go",
    "made": "make", "took": "take", "taken": "take", "came": "come",
    "saw": "see", "seen": "see", "knew": "know", "known": "know",
    "gave": "give", "given": "give", "found": "find", "thought": "think",
    "told": "tell", "became": "become", "left": "leave", "felt": "feel",
    "put": "put", "brought": "bring", "began": "begin", "begun": "begin",
    "kept": "keep", "held": "hold", "wrote": "write", "written": "write",
    "stood": "stand", "heard": "hear", "let": "let", "meant": "mean",
    "set": "set", "met": "meet", "ran": "run", "paid": "pay",
    "sat": "sit", "spoke": "speak", "spoken": "speak", "lay": "lie",
    "led": "lead", "grew": "grow", "grown": "grow", "lost": "lose",
    "fell": "fall", "fallen": "fall", "sent": "send", "built": "build",
    "understood": "understand", "drew": "draw", "drawn": "draw",
    "broke": "break", "broken": "break", "spent": "spend",
    "cut": "cut", "rose": "rise", "risen": "rise", "driven": "drive",
    "drove": "drive", "bought": "buy", "wore": "wear", "worn": "wear",
    "chose": "choose", "chosen": "choose", "ate": "eat", "eaten": "eat",
    "flew": "fly", "flown": "fly", "read": "read", "won": "win",
    "taught": "teach", "sold": "sell", "caught": "catch",
    "fought": "fight", "threw": "throw", "thrown": "throw",
    "rode": "ride", "ridden": "ride", "sang": "sing", "sung": "sing",
    "drank": "drink", "drunk": "drink", "swam": "swim", "swum": "swim",
    "began": "begin", "spoke": "speak", "arose": "arise",
}


def singularise(word):
    """Best-effort base form of an inflected English word."""
    w = word.lower().strip()
    if w in _IRREGULAR:
        return _IRREGULAR[w]
    if len(w) < 4:
        return w
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("ves"):
        return w[:-3] + "f"
    if w.endswith("es"):
        base = w[:-2]
        if base.endswith(("sh", "ch", "x", "z", "s", "o")):
            return base
        return w[:-1]
    if w.endswith("s"):
        return w[:-1]
    if w.endswith("ing"):
        return w[:-3]
    if w.endswith("ed"):
        return w[:-2]
    if w.endswith("'s"):
        return w[:-2]
    return w


def find_base(words_index, word):
    """Locate the dictionary entry a surface form belongs to."""
    w = word.lower().strip()
    if w in words_index:
        return words_index[w]
    # Irregular and regular base forms.
    for cand in (singularise(w), w + "e", w + "s"):
        if cand in words_index:
            return words_index[cand]
    # -ing / -ed with consonant doubling (running -> run)
    if len(w) > 3:
        for suffix in ("ing", "ed"):
            if w.endswith(suffix) and len(w) > len(suffix) + 2:
                stem = w[: -len(suffix)]
                for cand in (stem, stem + stem[-1], stem + "e"):
                    if cand in words_index:
                        return words_index[cand]
    # -ly adverbs map back to the adjective (quickly -> quick)
    if w.endswith("ly") and w[:-2] in words_index:
        return words_index[w[:-2]]
    # "-ies" -> "-y" (stories -> story)
    if w.endswith("ies") and w[:-3] + "y" in words_index:
        return words_index[w[:-3] + "y"]
    # "-es" -> "-" (boxes -> box, dishes -> dish)
    if w.endswith("es") and w[:-2] in words_index:
        return words_index[w[:-2]]
    # "-s" -> "-" (cars -> car)
    if w.endswith("s") and w[:-1] in words_index:
        return words_index[w[:-1]]
    # A multi-word phrase: match on the head (last) word.
    if " " in w:
        head = w.split()[-1]
        base = find_base(words_index, head)
        if base:
            return base
    # A hyphenated compound: match on the last part.
    if "-" in w:
        last = w.split("-")[-1]
        base = find_base(words_index, last)
        if base:
            return base
    # An inflected phrase: "air force" -> "air force" with a plural "s".
    if w.endswith("s"):
        trimmed = w[:-1]
        if " " in trimmed:
            base = find_base(words_index, trimmed)
            if base:
                return base
    return None


def ipa_for_surface(surface, cmu):
    """IPA for a surface form, deriving it from the base form when needed."""
    s = surface.lower().strip()
    # A slash entry ("airplane/aeroplane") is read as its first alternative.
    if "/" in s:
        first = s.split("/")[0].strip()
        if first and first != s:
            ipa = ipa_for_surface(first, cmu)
            if ipa:
                return ipa
    if s in cmu:
        ipa = _arpabet_to_ipa(cmu[s])
        if ipa:
            return ipa
    base = singularise(s)
    if base in cmu:
        ipa = _arpabet_to_ipa(cmu[base])
        if ipa:
            return ipa
    # A multi-word phrase: pronounce each word and join them.
    if " " in s:
        parts = [_arpabet_to_ipa(cmu[w]) for w in s.split() if w in cmu]
        if len(parts) == len([w for w in s.split() if w in cmu]) and parts:
            return " ".join(p for p in parts if p)
    # A hyphenated compound: same treatment, one word at a time.
    if "-" in s:
        parts = [_arpabet_to_ipa(cmu[w]) for w in s.split("-") if w in cmu]
        if len(parts) == len([w for w in s.split("-") if w in cmu]) and parts:
            return " ".join(p for p in parts if p)
    # A new formation built from known stems ("cyber" + "security",
    # "mind" + "fulness"). Split at the morpheme boundary and read each part.
    derived = _derive_from_stems(s, cmu)
    if derived:
        return derived
    # An initialism is spelled out letter by letter.
    spelled = _spell_out_initialism(s, cmu)
    if spelled:
        return spelled
    # A British spelling the American dictionary does not carry.
    for variant in _american_variants(s):
        if variant in cmu:
            ipa = _arpabet_to_ipa(cmu[variant])
            if ipa:
                return ipa
    # Finally, strip a derivational suffix and read the stem, appending the
    # suffix's own sound. This catches the long tail of academic vocabulary
    # ("misogynistic" -> "misogyn" + "-istic", "bariatric" -> "bari" + "-ic").
    for suffix, extra in _GENERIC_SUFFIXES:
        if s.endswith(suffix) and len(s) - len(suffix) >= 3:
            stem = s[: -len(suffix)]
            for cand in (stem, stem + "e", stem + "y"):
                if cand in cmu:
                    base = _arpabet_to_ipa(cmu[cand])
                    if base:
                        return base + extra
    # A last resort: split the word into two halves that the dictionary
    # knows and read both ("fracking" -> "frac"+"king", "influencer" ->
    # "in"+"fluencer" is hopeless but "influ"+"ence" is not).
    for cut in range(2, len(s) - 1):
        left, right = s[:cut], s[cut:]
        if left in cmu and right in cmu:
            a = _arpabet_to_ipa(cmu[left])
            b = _arpabet_to_ipa(cmu[right])
            if a and b:
                return a + b
    return None


# Generic derivational suffixes with the sound they add.
_GENERIC_SUFFIXES = [
    ("istic", "ɪstɪk"),
    ("istically", "ɪstɪkli"),
    ("ational", "eɪʃənəl"),
    ("ization", "aɪˈzeɪʃən"),
    ("isation", "aɪˈzeɪʃən"),
    ("ically", "ɪkli"),
    ("ically", "ɪkəli"),
    ("ivity", "ɪvɪti"),
    ("ement", "mənt"),
    ("ation", "eɪʃən"),
    ("ously", "əsli"),
    ("ously", "əsli"),
    ("ical", "ɪkəl"),
    ("ance", "əns"),
    ("ence", "əns"),
    ("ment", "mənt"),
    ("ship", "ʃɪp"),
    ("hood", "hʊd"),
    ("less", "ləs"),
    ("ness", "nəs"),
    ("ful", "fʊl"),
    ("able", "əbl"),
    ("ible", "ɪbl"),
    ("ally", "li"),
    ("ical", "ɪkəl"),
    ("ic", "ɪk"),
    ("al", "əl"),
    ("ly", "li"),
    ("ist", "ɪst"),
    ("ism", "ɪzəm"),
    ("or", "ə"),
    ("ary", "əri"),
    ("ive", "ɪv"),
    ("ure", "ʃə"),
    ("age", "ɪdʒ"),
]


# Suffixes that turn a stem into a related word, mapped to the extra sounds
# they add. Used to read modern formations the CMU dictionary predates.
_DERIVATION_SUFFIXES = [
    # (suffix, stem that must be present, extra IPA)
    ("fulness", "ful", "nəs"),
    ("lessness", "less", "nəs"),
    ("ship", "", "ʃɪp"),
    ("ism", "", "ɪzəm"),
    ("ist", "", "ɪst"),
    ("ize", "", "aɪz"),
    ("ise", "", "aɪz"),
    ("ization", "", "aɪˈzeɪʃən"),
    ("isation", "", "aɪˈzeɪʃən"),
    ("ization", "", "aɪˈzeɪʃən"),
    ("ward", "", "wəd"),
    ("wards", "", "wədz"),
    ("like", "", "laɪk"),
    ("wise", "", "waɪz"),
    ("y", "", "i"),
]

# Known affixes that appear at the start of modern words.
_DERIVATION_PREFIXES = ["cyber", "multi", "micro", "macro", "semi", "anti",
                        "auto", "tele", "hyper", "bio", "geo", "eco"]


def _derive_from_stems(word, cmu):
    """Read a modern formation by splitting it into known stems."""
    w = word
    for suffix, _stem_hint, extra in _DERIVATION_SUFFIXES:
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            stem = w[: -len(suffix)]
            if stem in cmu:
                base = _arpabet_to_ipa(cmu[stem])
                if base:
                    return base + extra
    for prefix in _DERIVATION_PREFIXES:
        if w.startswith(prefix) and len(w) > len(prefix) + 2:
            rest = w[len(prefix):]
            if rest in cmu:
                base = _arpabet_to_ipa(cmu[rest])
                if base:
                    return base
    # Try a plain consonant-cluster split: "mindfulness" -> "mind"+"ful"+"ness".
    for cut in range(3, len(w) - 2):
        left, right = w[:cut], w[cut:]
        if left in cmu and right in cmu:
            a = _arpabet_to_ipa(cmu[left])
            b = _arpabet_to_ipa(cmu[right])
            if a and b:
                return a + b
    return None


# Spell-out readings for initialisms. An initialism is read letter by
# letter ("NFT" -> "en ef tiː"), so we spell each capital and read it.
_LETTER_NAMES = {
    "a": "eɪ", "b": "biː", "c": "siː", "d": "diː", "e": "iː",
    "f": "ɛf", "g": "dʒiː", "h": "eɪtʃ", "i": "aɪ", "j": "dʒeɪ",
    "k": "keɪ", "l": "ɛl", "m": "ɛm", "n": "ɛn", "o": "əʊ",
    "p": "piː", "q": "kjuː", "r": "ɑː", "s": "ɛs", "t": "tiː",
    "u": "juː", "v": "viː", "w": "dʌbljuː", "x": "ɛks", "y": "waɪ",
    "z": "zɛd",
}


def _spell_out_initialism(word, cmu):
    """Read an initialism letter by letter, e.g. "fps" -> "ɛf piː ɛs"."""
    letters = [c for c in word.lower() if c.isalpha()]
    if not letters or len(letters) > 6:
        return None
    parts = [_LETTER_NAMES.get(c) for c in letters]
    if any(p is None for p in parts):
        return None
    # "ceo" and "eu" are read as words; "ngo" is not.
    joined = "".join(letters)
    if joined in cmu:
        return _arpabet_to_ipa(cmu[joined])
    return " ".join(parts)


# The CMU dictionary is American. The word list is largely British, so a
# British spelling that CMU does not know can be converted to its American
# twin and looked up there. Only the spellings that actually differ are
# listed — the file's own entries use "-ise" far more often than "-ize".
_BRITISH_TO_AMERICAN = [
    ("ise", "ize"), ("isation", "ization"), ("ised", "ized"),
    ("ising", "izing"), ("yse", "yze"), ("ysed", "yzed"),
    ("ours", "ors"), ("our", "or"), ("ogue", "og"),
    ("ll", "l"), ("mm", "m"), ("ss", "s"),
]


def _american_variants(word):
    """American spellings a British word might correspond to."""
    w = word.lower()
    out = []
    if "ise" in w or "isation" in w:
        out.append(w.replace("isation", "ization").replace("ise", "ize"))
    if w.endswith("ise"):
        out.append(w[:-3] + "ize")
    if "yse" in w:
        out.append(w.replace("yse", "yze"))
    if w.endswith("our"):
        out.append(w[:-3] + "or")
    if w.endswith("ogue"):
        out.append(w[:-4] + "og")
    # Common British "-re" / "-er" endings.
    if w.endswith("tre"):
        out.append(w[:-3] + "ter")
    if w.endswith("bre"):
        out.append(w[:-3] + "ber")
    # Doubled consonant.
    if len(w) > 3 and w[-1] == w[-2]:
        out.append(w[:-1])
    return [v for v in out if v and v != w]


# ---------------------------------------------------------------------------

# The last 18 entries the CMU dictionary cannot help with: proper nouns the
# American dictionary does not carry, and numerals. They are written out in the
# same British RP style the rest of the file uses.
MANUAL_IPA = {
    "fracking": "ˈfrækɪŋ",
    "influencer": "ˈɪnfluənsər",
    "islamophobia": "ɪzˌlæməˈfəʊbiə",
    "unrivalled": "ʌnˈraɪvəld",
    "ordinator": "ˈɔːdɪneɪtər",
    "sanitizer": "ˈsænɪtaɪzər",
    "pashtun": "ˈpæʃtʊn",
    "paracetamol": "ˌpærəˈsiːtəmɒl",
    "bariatric": "ˌbærɪˈætrɪk",
    "ulcerative": "ˈʌlsərətɪv",
    "fibromyalgia": "ˌfaɪbəʊmɪˈælʒɪə",
    "millenium": "mɪˈlenɪəm",
    "oxycodone": "ˌɒksɪˈkəʊdiːn",
    "recherche": "rɪˈsɜːtʃ",
    "flatulence": "ˈflætjʊləns",
    "margherita": "ˌmɑːdʒəˈriːtə",
    "42": "ˈfɔːtiːtuː",
    "2026": "ˈtwɛntiːtuː ˈtwɛntiːsɪks",
}


def main():
    with open(DICT_PATH, encoding="utf-8") as fh:
        entries = json.load(fh)
    print(f"loaded {len(entries)} entries")

    cmu = load_cmu()
    print(f"CMU dictionary: {len(cmu)} pronunciations")

    by_word = {e["word"].lower(): e for e in entries if e.get("word")}

    # --- 1. IPA -----------------------------------------------------------
    fixed_ipa = 0
    for e in entries:
        if (e.get("ipa") or "").strip():
            continue
        ipa = ipa_for_surface(e["word"], cmu)
        if ipa:
            e["ipa"] = ipa
            fixed_ipa += 1
    # The proper nouns and numerals the American dictionary does not carry.
    for e in entries:
        if (e.get("ipa") or "").strip():
            continue
        manual = MANUAL_IPA.get(e["word"].lower())
        if manual:
            e["ipa"] = manual
            fixed_ipa += 1
    print(f"ipa filled: {fixed_ipa}")

    # --- 2. example sentences --------------------------------------------
    fixed_ex = 0
    for i, e in enumerate(entries):
        if (e.get("example_sentence_english") or "").strip():
            continue
        ex = build_example(e, i)
        if ex:
            e["example_sentence_english"] = ex
            fixed_ex += 1
    print(f"examples filled: {fixed_ex}")

    # --- 3. inflected forms ---------------------------------------------
    catalog = collect_catalog_words()
    print(f"catalog words: {len(catalog)}")
    added = []
    for word in sorted(catalog):
        if word.lower() in by_word:
            continue
        base = find_base(by_word, word)
        if not base:
            continue
        surface = _surface(word)
        entry = {
            "word": word,
            "useful_for_flashcard": base.get("useful_for_flashcard", True),
            "cefr_level": base.get("cefr_level", "A1"),
            "english_translation": base.get("english_translation", ""),
            "example_sentence_english": "",
            "pos": base.get("pos", ""),
            "word_frequency": base.get("word_frequency", 0),
            "definition_zh": base.get("definition_zh", ""),
            "ipa": ipa_for_surface(surface, cmu) or base.get("ipa", ""),
            "cse_level": base.get("cse_level", 0),
        }
        # The example sentence is adapted from the base form's own sentence
        # (its subject and verb are already conjugated for the base word, so
        # simply swapping the word in keeps the grammar intact). A plural
        # noun takes a plural subject, a past-tense verb keeps the base
        # sentence's tense.
        entry["example_sentence_english"] = _inflected_example(base, word)
        if not entry["example_sentence_english"]:
            entry["example_sentence_english"] = build_example(entry, len(added))
        added.append(entry)
    print(f"inflected forms added: {len(added)}")

    entries.extend(added)

    # --- write ------------------------------------------------------------
    with open(DICT_PATH, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(entries)} entries -> {DICT_PATH}")


if __name__ == "__main__":
    main()
