"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Volume2,
  Search,
  Check,
  RotateCcw,
} from "lucide-react";
import { setWordStatus } from "@/lib/actions/srs";
import { CSE_BUCKET_LABELS, cefrToCse } from "@/lib/cse";

interface Word {
  word: string;
  cefr_level: string;
  cse_level?: string;
  english_translation: string;
  definition_zh?: string;
  pos: string;
  example_sentence_native: string;
  example_sentence_english: string;
  example_zh?: string;
  ipa?: string;
  domain_tags?: string;
  gender?: string;
  word_frequency?: number;
  _card?: SrsCard;
}

interface SrsCard {
  word: string;
  language: string;
  translation: string;
  cefrLevel?: string | null;
  cseLevel?: string | null;
  pos?: string | null;
  status: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  lastRating?: string | null;
  createdAt: Date;
}

interface SrsStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  review: number;
  learned: number;
  hard: number;
  ok: number;
  easy: number;
}

type SrsFilter = "all" | "learned" | "learning" | "new";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

// China Standards of English (CSE) scale 2–9 (小学 → 雅思8). CSE 1 is folded
// into CSE 2 and never shown.
const CSE_LEVELS = ["2", "3", "4", "5", "6", "7", "8", "9"] as const;

const CSE_BADGES: Record<string, string> = {
  "2": "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300 dark:border-orange-800",
  "3": "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  "4": "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300 border-lime-300 dark:border-lime-800",
  "5": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  "6": "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800",
  "7": "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800",
  "8": "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  "9": "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border-fuchsia-300 dark:border-fuchsia-800",
};

// 2 rows for A-Z alphabet navigation (14 items each)
const ALPHABET_ROWS = [
  ["ALL", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"],
  ["N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#"],
] as const;

// POS filter using symbols
const POS_OPTIONS = [
  { key: "all", label: "All", fullName: "All Parts of Speech" },
  { key: "noun", label: "N", fullName: "Noun (名词)" },
  { key: "verb", label: "V", fullName: "Verb (动词)" },
  { key: "adjective", label: "Adj", fullName: "Adjective (形容词)" },
  { key: "adverb", label: "Adv", fullName: "Adverb (副词)" },
  { key: "preposition", label: "PP", fullName: "Preposition (介词)" },
  { key: "conjunction", label: "CJ", fullName: "Conjunction (连词)" },
  { key: "pronoun", label: "PN", fullName: "Pronoun (代词)" },
  { key: "determiner", label: "Det", fullName: "Determiner (限定词/冠词)" },
] as const;

const POS_ALIASES: Record<string, string[]> = {
  noun: ["noun", "n"],
  verb: ["verb", "v", "be-verb", "modal", "auxiliary"],
  adjective: ["adjective", "adj", "a"],
  adverb: ["adverb", "adv"],
  preposition: ["preposition", "prep"],
  conjunction: ["conjunction", "conj"],
  pronoun: ["pronoun", "pron"],
  determiner: ["determiner", "det", "article", "art"],
  numeral: ["numeral", "num", "number"],
  interjection: ["interjection", "intj", "int"],
};

const LEVEL_COLORS: Record<string, string> = {
  A1: "bg-emerald-500 text-white",
  A2: "bg-teal-600 text-white",
  B1: "bg-blue-500 text-white",
  B2: "bg-indigo-600 text-white",
  C1: "bg-purple-600 text-white",
  C2: "bg-rose-600 text-white",
};

const LEVEL_BADGES: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  A2: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-800",
  B1: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800",
  B2: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  C1: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  C2: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
};

const POS_LABELS: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adj: "Adj",
  adjective: "Adj",
  adv: "Adv",
  adverb: "Adv",
  pronoun: "Pron",
  conjunction: "Conj",
  prep: "Prep",
  preposition: "Prep",
  determiner: "Det",
  interjection: "Intj",
  num: "Num",
  number: "Num",
  numeral: "Num",
  "be-verb": "Verb",
  "have-verb": "Verb",
  "do-verb": "Verb",
  modal: "Modal",
  auxiliary: "Aux",
};

const POS_TOKEN_MAP: Record<string, string> = {
  n: "Noun",
  noun: "Noun",
  v: "Verb",
  vt: "Verb",
  vi: "Verb",
  verb: "Verb",
  "be-verb": "Verb",
  "have-verb": "Verb",
  "do-verb": "Verb",
  aux: "Aux",
  modal: "Modal",
  a: "Adj",
  adj: "Adj",
  adjective: "Adj",
  s: "Adj",
  r: "Adv",
  adv: "Adv",
  adverb: "Adv",
  prep: "Prep",
  preposition: "Prep",
  conj: "Conj",
  conjunction: "Conj",
  pron: "Pron",
  pronoun: "Pron",
  det: "Det",
  determiner: "Det",
  art: "Art",
  article: "Art",
  num: "Num",
  number: "Num",
  numeral: "Num",
  intj: "Intj",
  interj: "Intj",
  interjection: "Intj",
};

function getAllPosLabels(w: Word): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addPos = (raw: string) => {
    const clean = raw.toLowerCase().replace(/\.$/, "").trim();
    const label = POS_TOKEN_MAP[clean] || POS_LABELS[clean];
    if (label && !seen.has(label)) {
      seen.add(label);
      result.push(label);
    }
  };

  if (w.pos) {
    w.pos.split(/[,/;\s]+/).forEach((part) => {
      if (part) addPos(part);
    });
  }

  // Extract POS prefixes from Chinese & English definitions (e.g. "n. ...", "vt. ...", "a. ...", "adv. ...")
  const combined = `${w.definition_zh || ""} ； ${w.english_translation || ""}`;
  const regex = /(?:^|[；;]\s*|\s+)([a-z]+)\./gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(combined)) !== null) {
    addPos(match[1]);
  }

  if (result.length === 0 && w.pos) {
    result.push(POS_LABELS[w.pos.toLowerCase()] || w.pos);
  }

  return result;
}

let currentAudioInstance: HTMLAudioElement | null = null;

function playAudio(text: string, lang: string = "en", accent: "us" | "uk" = "us") {
  if (typeof window === "undefined") return;

  if (currentAudioInstance) {
    try {
      currentAudioInstance.pause();
      currentAudioInstance.currentTime = 0;
    } catch {}
    currentAudioInstance = null;
  }

  let clean = text.trim().toLowerCase();
  if (clean.includes("/")) {
    clean = clean.split("/")[0].trim();
  }
  clean = clean.replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "").trim();
  const isEnglish = !lang || lang === "en" || lang === "english";

  // For single words or hyphenated words, use the high-quality human MP3 audio from ismartcoding/endict
  if (isEnglish && /^[a-z]+(?:-[a-z]+)*$/i.test(clean)) {
    const audioUrl = `https://raw.githubusercontent.com/ismartcoding/endict/main/audio/${accent}/${encodeURIComponent(clean)}.mp3`;
    const audio = new Audio(audioUrl);
    currentAudioInstance = audio;

    audio.play().catch(() => {
      fallbackSpeechSynthesis(text, lang);
    });
    return;
  }

  fallbackSpeechSynthesis(text, lang);
}

function fallbackSpeechSynthesis(text: string, lang: string = "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "en" || lang === "english" ? "en-US" : lang;
  window.speechSynthesis.speak(utterance);
}

export function WordExplorer({
  srsCards = [],
  libraryWords = [],
  language = "en",
  cseLevelCounts,
}: {
  isAdmin?: boolean;
  words?: Word[];
  srsCards?: SrsCard[];
  srsStats?: SrsStats;
  libraryWords?: string[];
  language?: string;
  levelDictionaryCounts?: Record<string, number>;
  cseLevelCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCseLevel, setSelectedCseLevel] = useState<string>("");
  const [cards, setCards] = useState<SrsCard[]>(srsCards);

  // Sync state when props change
  useEffect(() => {
    setCards(srsCards || []);
  }, [srsCards]);

  const libraryWordSet = useMemo(() => {
    return new Set((libraryWords || []).map((w) => w.toLowerCase().trim()));
  }, [libraryWords]);

  // Map user cards by normalized word
  const srsMap = useMemo(() => {
    const map = new Map<string, SrsCard>();
    cards.forEach((c) => {
      map.set(c.word.toLowerCase().trim(), c);
    });
    return map;
  }, [cards]);

  const handleClearCseLevel = () => {
    setSelectedLevel("");
    setSelectedCseLevel("");
  };

  const handleCardStatusChange = useCallback(
    (
      targetWord: string,
      newStatus: "new" | "learning" | "learned" | "remove",
      meta?: { cefrLevel?: string; translation?: string; pos?: string }
    ) => {
      const norm = targetWord.toLowerCase().trim();
      setCards((prev) => {
        if (newStatus === "remove") {
          return prev.filter((c) => c.word.toLowerCase().trim() !== norm);
        }
        const idx = prev.findIndex((c) => c.word.toLowerCase().trim() === norm);
        const reps = newStatus === "learned" ? 10 : newStatus === "learning" ? 1 : 0;
        const interval = newStatus === "learned" ? 36500 : newStatus === "learning" ? 1 : 0;
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            status: newStatus,
            repetitions: reps,
            interval,
            lastReviewedAt: newStatus === "learned" ? new Date() : updated[idx].lastReviewedAt,
            nextReviewAt: newStatus === "learning" ? new Date() : null,
          };
          return updated;
        } else {
          const newCard: SrsCard = {
            word: norm,
            language,
            translation: meta?.translation || targetWord,
            cefrLevel: meta?.cefrLevel || "A1",
            pos: meta?.pos || "noun",
            status: newStatus,
            easeFactor: 2.5,
            interval,
            repetitions: reps,
            nextReviewAt: newStatus === "learning" ? new Date() : null,
            lastReviewedAt: newStatus === "learned" ? new Date() : null,
            createdAt: new Date(),
          };
          return [...prev, newCard];
        }
      });
      // Refresh Next.js Server Components (TopBar layout stats)
      router.refresh();
    },
    [language, router]
  );

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-lingo-text tracking-tight flex items-center gap-1.5">
          <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-lingo-blue" />
          Words
        </h1>
        <p className="text-[11px] sm:text-xs text-lingo-text-light mt-0.5">
          CEFR A1–C2 Curriculum & SRS Mastery
        </p>
      </div>

      {/* ── WORD LOOKUP SECTION ── */}
      <WordLookupSection
        selectedLevel={selectedLevel}
        onSelectLevel={setSelectedLevel}
        selectedCseLevel={selectedCseLevel}
        onSelectCseLevel={setSelectedCseLevel}
        onClearLevels={handleClearCseLevel}
        cseLevelCounts={cseLevelCounts}
        language={language}
        srsMap={srsMap}
        srsCards={cards}
        libraryWordSet={libraryWordSet}
        onCardStatusChange={handleCardStatusChange}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   WORD LOOKUP SECTION WITH 2-ROW A-Z & RESPONSIVE FILTER BARS
   ───────────────────────────────────────────────────────────── */

function WordLookupSection({
  selectedLevel,
  onSelectLevel,
  selectedCseLevel,
  onSelectCseLevel,
  onClearLevels,
  cseLevelCounts,
  language,
  srsMap,
  srsCards,
  libraryWordSet,
  onCardStatusChange,
}: {
  selectedLevel: string;
  onSelectLevel: (lvl: string) => void;
  selectedCseLevel: string;
  onSelectCseLevel: (lvl: string) => void;
  onClearLevels: () => void;
  cseLevelCounts?: Record<string, number>;
  language: string;
  srsMap: Map<string, SrsCard>;
  srsCards: SrsCard[];
  libraryWordSet?: Set<string>;
  onCardStatusChange?: (
    word: string,
    status: "new" | "learning" | "learned" | "remove",
    meta?: { cefrLevel?: string; translation?: string; pos?: string }
  ) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<SrsFilter>("all");
  const [selectedLetter, setSelectedLetter] = useState<string>("ALL");
  const [selectedPos, setSelectedPos] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [words, setWords] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  const isSrsSpecificFilter =
    statusFilter === "learning" || statusFilter === "learned" || statusFilter === "new";

  const liveLearnedCount = useMemo(() => {
    return srsCards.filter(
      (c) =>
        c.status === "learned" ||
        c.status === "review" ||
        (c.repetitions && c.repetitions >= 3)
    ).length;
  }, [srsCards]);

  const liveLearningCount = useMemo(() => {
    return srsCards.filter(
      (c) => c.status === "learning" && (!c.repetitions || c.repetitions < 3)
    ).length;
  }, [srsCards]);

  const liveNewCount = useMemo(() => {
    return srsCards.filter(
      (c) => c.status === "new" && (!c.repetitions || c.repetitions < 3)
    ).length;
  }, [srsCards]);

  useEffect(() => {
    let cancelled = false;

    if (isSrsSpecificFilter) {
      setLoading(true);
      let cards = srsCards;

      if (selectedLevel) {
        cards = cards.filter(
          (c) => (c.cefrLevel || "").toUpperCase().trim() === selectedLevel
        );
      }

      if (selectedCseLevel) {
        const targetCse = selectedCseLevel;
        cards = cards.filter((c) => {
          const cardCse = (c.cseLevel || cefrToCse(c.cefrLevel || "")).trim();
          return cardCse === targetCse;
        });
      }

      if (statusFilter === "learning") {
        cards = cards.filter(
          (c) => c.status === "learning" && (!c.repetitions || c.repetitions < 3)
        );
      } else if (statusFilter === "learned") {
        cards = cards.filter(
          (c) =>
            c.status === "learned" ||
            c.status === "review" ||
            (c.repetitions && c.repetitions >= 3)
        );
      } else if (statusFilter === "new") {
        cards = cards.filter(
          (c) => c.status === "new" && (!c.repetitions || c.repetitions < 3)
        );
      }

      // Letter filter
      if (selectedLetter && selectedLetter !== "ALL") {
        if (selectedLetter === "#") {
          cards = cards.filter((c) => !/[a-zA-Z]/.test(c.word.trim().charAt(0)));
        } else {
          cards = cards.filter((c) =>
            c.word.trim().replace(/^['"-]/, "").toUpperCase().startsWith(selectedLetter)
          );
        }
      }

      // POS filter
      if (selectedPos && selectedPos !== "all") {
        const validAliases = POS_ALIASES[selectedPos] || [selectedPos];
        cards = cards.filter((c) => {
          const itemPos = (c.pos || "").toLowerCase().trim();
          if (validAliases.some((alias) => itemPos.includes(alias))) return true;
          const trans = (c.translation || "").toLowerCase();
          return validAliases.some((alias) => {
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`(?:^|[；;\\s])${escaped}\\.`, "i").test(trans);
          });
        });
      }

      // Search query
      const q = debouncedSearch.toLowerCase().trim();
      if (q) {
        cards = cards.filter(
          (c) =>
            c.word.toLowerCase().includes(q) ||
            c.translation.toLowerCase().includes(q)
        );
      }

      const totalCount = cards.length;
      const slicedCards = cards.slice(0, page * 50);

      async function enrichAndSetCards() {
        const dictMap = new Map<string, Word>();
        if (slicedCards.length > 0) {
          try {
            const wordListParam = slicedCards.map((c) => c.word.toLowerCase().trim()).join(",");
            const res = await fetch(
              `/api/words?lang=${encodeURIComponent(language)}&words=${encodeURIComponent(wordListParam)}&limit=100`
            );
            if (res.ok) {
              const data = await res.json();
              (data.words || []).forEach((dw: Word) => {
                dictMap.set(dw.word.toLowerCase().trim(), dw);
              });
            }
          } catch {}
        }

        if (cancelled) return;

        const mappedWords: Word[] = slicedCards.map((c) => {
          const dictEntry = dictMap.get(c.word.toLowerCase().trim());
          return {
            word: c.word,
            cefr_level: dictEntry?.cefr_level || c.cefrLevel || "A1",
            cse_level: dictEntry?.cse_level || c.cseLevel || undefined,
            english_translation: dictEntry?.english_translation || c.translation,
            definition_zh: dictEntry?.definition_zh || c.translation,
            pos: dictEntry?.pos || c.pos || "noun",
            example_sentence_native: dictEntry?.example_sentence_native || "",
            example_sentence_english: dictEntry?.example_sentence_english || "",
            example_zh: dictEntry?.example_zh,
            ipa: dictEntry?.ipa,
            domain_tags: dictEntry?.domain_tags,
            _card: c,
          };
        });

        setTotal(totalCount);
        setWords(mappedWords);
        setHasMore(page * 50 < totalCount);
        setLoading(false);
      }

      enrichAndSetCards();
      return () => {
        cancelled = true;
      };
    }

    // When status is "all" or "new", fetch from the full dictionary API
    async function fetchFromApi() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("lang", language);
        if (selectedLevel) params.set("level", selectedLevel);
        if (selectedCseLevel) params.set("cseLevel", selectedCseLevel);
        if (selectedLetter && selectedLetter !== "ALL") params.set("letter", selectedLetter);
        if (selectedPos && selectedPos !== "all") params.set("pos", selectedPos);
        if (debouncedSearch) params.set("q", debouncedSearch);
        params.set("page", String(page));
        params.set("limit", "50");

        const res = await fetch(`/api/words?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const fetchedWords: Word[] = data.words || [];

            if (page === 1) {
              setWords(fetchedWords);
            } else {
              setWords((prev) => [...prev, ...fetchedWords]);
            }
            setTotal(data.total || 0);
            setHasMore(!!data.hasMore);
          }
        }
      } catch (err) {
        console.error("Failed to load words:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFromApi();
    return () => {
      cancelled = true;
    };
  }, [
    language,
    selectedLevel,
    selectedCseLevel,
    selectedLetter,
    selectedPos,
    statusFilter,
    debouncedSearch,
    page,
    srsCards,
    srsMap,
    isSrsSpecificFilter,
  ]);

  function handleLevelChange(lvl: string) {
    const next = selectedLevel === lvl ? "" : lvl;
    onSelectLevel(next);
    // CEFR and CSE are mutually exclusive level filters — picking one clears the other.
    onSelectCseLevel("");
    setPage(1);
  }

  function handleCseLevelChange(lvl: string) {
    const next = selectedCseLevel === lvl ? "" : lvl;
    onSelectCseLevel(next);
    onSelectLevel("");
    setPage(1);
  }

  function handleLetterChange(lettr: string) {
    setSelectedLetter(lettr);
    setPage(1);
  }

  function handlePosChange(posKey: string) {
    setSelectedPos(posKey);
    setPage(1);
  }

  function handleStatusChange(status: SrsFilter) {
    setStatusFilter(status);
    setPage(1);
  }

  const hasActiveFilters =
    selectedLevel !== "" ||
    selectedCseLevel !== "" ||
    selectedLetter !== "ALL" ||
    selectedPos !== "all" ||
    statusFilter !== "all" ||
    search !== "";

  function clearAllFilters() {
    onClearLevels();
    setSelectedLetter("ALL");
    setSelectedPos("all");
    setStatusFilter("all");
    setSearch("");
    setPage(1);
  }

  return (
    <div className="w-full space-y-3 pt-1">
      {/* Title & Level Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-base sm:text-lg font-black text-lingo-text flex items-center gap-1.5">
          <Search className="w-4 h-4 text-lingo-blue" />
          Word Lookup
        </h3>

        {/* Level Filter Pills */}
        <div className="flex items-center gap-1 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={() => handleLevelChange("")}
            className={`flex-1 sm:flex-initial rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-black transition-all ${
              selectedLevel === ""
                ? "bg-lingo-blue text-white shadow-xs"
                : "bg-lingo-card border border-lingo-border text-lingo-text-light hover:text-lingo-text"
            }`}
          >
            All
          </button>
          {CEFR_LEVELS.map((lvl) => {
            const active = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => handleLevelChange(lvl)}
                className={`flex-1 sm:flex-initial rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-black transition-all border ${
                  active
                    ? `${LEVEL_COLORS[lvl]} border-transparent shadow-xs`
                    : `${LEVEL_BADGES[lvl]} opacity-70 hover:opacity-100`
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* CSE Level Filter Pills (中国英语能力等级量表 2–9) */}
      <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card p-1.5 sm:p-2 shadow-xs space-y-1.5">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-[10px] sm:text-[11px] font-black text-lingo-text-light tracking-wide">
            CSE 能力等级 (小学 → 雅思8)
          </span>
          <button
            onClick={() => handleCseLevelChange("")}
            className={`rounded-lg px-2 py-0.5 text-[10px] sm:text-[11px] font-black transition-all ${
              selectedCseLevel === ""
                ? "bg-lingo-blue text-white shadow-xs"
                : "bg-lingo-card border border-lingo-border text-lingo-text-light hover:text-lingo-text"
            }`}
          >
            All CSE
          </button>
        </div>
        <div className="flex items-center gap-1 w-full justify-start overflow-x-auto">
          {CSE_LEVELS.map((lvl) => {
            const active = selectedCseLevel === lvl;
            const count = cseLevelCounts?.[lvl] ?? 0;
            return (
              <button
                key={lvl}
                onClick={() => handleCseLevelChange(lvl)}
                title={`CSE ${lvl} · ${CSE_BUCKET_LABELS[lvl] || ""}`}
                className={`shrink-0 rounded-lg px-1.5 py-1 text-[10px] sm:text-xs font-black transition-all border whitespace-nowrap flex items-center gap-1 ${
                  active
                    ? "bg-lingo-blue text-white border-transparent shadow-xs"
                    : `${CSE_BADGES[lvl]} opacity-70 hover:opacity-100`
                }`}
              >
                <span>{lvl}</span>
                <span className={active ? "text-white/80" : "text-lingo-text-light/70"}>
                  {CSE_BUCKET_LABELS[lvl] || ""}
                </span>
                {count > 0 && (
                  <span className={`text-[9px] font-bold ${active ? "text-white/80" : "text-lingo-text-light/70"}`}>
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2-Row A–Z Alphabet Grid (Spans full width) ── */}
      <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card p-1 sm:p-1.5 shadow-xs space-y-1">
        {ALPHABET_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center justify-between gap-0.5 sm:gap-1 w-full">
            {row.map((lettr) => {
              const active = selectedLetter === lettr;
              return (
                <button
                  key={lettr}
                  onClick={() => handleLetterChange(lettr)}
                  className={`flex-1 h-6 sm:h-7 rounded text-[10px] sm:text-xs font-black transition-all flex items-center justify-center p-0 min-w-0 ${
                    active
                      ? "bg-lingo-blue text-white shadow-xs font-black scale-105"
                      : "text-lingo-text-light hover:text-lingo-text hover:bg-lingo-gray/30"
                  }`}
                >
                  {lettr}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── POS & Status Filters (Span full width) ── */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* POS Symbols Filter */}
        <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card p-1 sm:p-1.5 shadow-xs">
          <div className="flex items-center justify-between gap-0.5 sm:gap-1 w-full">
            {POS_OPTIONS.map((pos) => {
              const active = selectedPos === pos.key;
              return (
                <button
                  key={pos.key}
                  onClick={() => handlePosChange(pos.key)}
                  title={pos.fullName}
                  className={`flex-1 h-6 sm:h-7 rounded text-[10px] sm:text-xs font-bold transition-all text-center flex items-center justify-center px-0.5 min-w-0 ${
                    active
                      ? "bg-lingo-blue text-white shadow-xs font-black"
                      : "text-lingo-text-light hover:text-lingo-text hover:bg-lingo-gray/30"
                  }`}
                >
                  {pos.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Filter (All, Mastered, Learning, New) */}
        <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card p-1 sm:p-1.5 shadow-xs">
          <div className="flex items-center justify-between gap-1 w-full">
            {(
              [
                { key: "all", label: "All", count: null, short: "" },
                { key: "learned", label: "Mastered", count: liveLearnedCount, short: "M" },
                { key: "learning", label: "Learning", count: liveLearningCount, short: "L" },
                { key: "new", label: "New", count: liveNewCount, short: "N" },
              ] as const
            ).map((f) => {
              const active = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => handleStatusChange(f.key)}
                  className={`flex-1 h-7 sm:h-8 rounded text-[10px] sm:text-xs font-bold transition-all text-center flex items-center justify-center gap-1 min-w-0 px-1 ${
                    active
                      ? "bg-lingo-blue text-white shadow-xs font-black"
                      : "text-lingo-text-light hover:text-lingo-text hover:bg-lingo-gray/30"
                  }`}
                >
                  <span className="truncate">{f.label}</span>
                  {f.count !== null && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black shrink-0 ${
                        active
                          ? "bg-white/25 text-white"
                          : f.short === "M"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                          : f.short === "L"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
                      }`}
                    >
                      {f.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Search Input (Spans full width) ── */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-lingo-text-light" />
        <input
          type="text"
          placeholder="Search words, English translations, or definitions..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-xl border-2 border-lingo-border bg-lingo-card pl-9 pr-3 py-2 text-xs sm:text-sm font-bold text-lingo-text placeholder:text-lingo-text-light/60 focus:border-lingo-blue focus:outline-none shadow-xs"
        />
      </div>

      {/* Active Filter Summary */}
      <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-lingo-text-light px-0.5">
        <p className="truncate mr-2">
          {words.length.toLocaleString()} of {total.toLocaleString()} words
          {selectedLevel && ` • ${selectedLevel}`}
          {selectedCseLevel && ` • CSE ${selectedCseLevel} ${CSE_BUCKET_LABELS[selectedCseLevel] || ""}`}
          {selectedLetter !== "ALL" && ` • "${selectedLetter}"`}
          {selectedPos !== "all" && ` • ${selectedPos.toUpperCase()}`}
          {statusFilter !== "all" && ` • ${statusFilter}`}
          {search && ` • "${search}"`}
        </p>

        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-[10px] sm:text-[11px] font-black text-lingo-blue hover:underline cursor-pointer shrink-0"
          >
            Reset
          </button>
        )}
      </div>

      {/* Word Cards List (Spans full width) ── */}
      {loading && words.length === 0 ? (
        <div className="py-8 text-center text-lingo-text-light font-bold text-xs">
          Searching dictionary...
        </div>
      ) : words.length === 0 ? (
        <div className="w-full rounded-2xl border-2 border-dashed border-lingo-border p-6 text-center">
          <p className="text-xs sm:text-sm font-bold text-lingo-text-light">
            No words found matching your filters.
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-2.5 inline-flex items-center gap-1 rounded-xl bg-lingo-blue px-3 py-1 text-xs font-black text-white hover:bg-lingo-blue-dark transition-all"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
          <div className="w-full space-y-2">
            {words.map((w, i) => {
              const card = w._card || srsMap.get(w.word.toLowerCase().trim());
              return (
                <WordLookupCard
                  key={`${w.word}-${i}`}
                  word={w}
                  card={card}
                  language={language}
                  libraryWordSet={libraryWordSet}
                  onStatusChange={onCardStatusChange}
                />
              );
            })}
          </div>
      )}

      {/* Load More */}
      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={loading}
          className="mt-2.5 w-full rounded-xl border-2 border-lingo-border bg-lingo-card py-2 text-xs sm:text-sm font-bold text-lingo-text-light hover:border-lingo-gray-dark hover:text-lingo-text transition-colors disabled:opacity-50 shadow-xs"
        >
          {loading ? "Loading..." : "Show more words"}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   WORD LOOKUP CARD (ROUND LOGOS N-BLUE, L-YELLOW, M-GREEN & INLINE CHINESE TRANSLATION)
   ───────────────────────────────────────────────────────────── */

function cleanZhSummary(raw?: string | null): string {
  if (!raw) return "";
  let clean = raw.trim();
  clean = clean.replace(/;?\s*(?:时态|比较级|名\s*词|形容词|副\s*词|abbr\.|CLASSabbr)[\s\S]*/i, "");
  clean = clean.replace(/[A-Z]{2,}abbr\.[\s\S]*/, "");
  clean = clean.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean || raw;
}

function WordLookupCard({
  word: w,
  card,
  language,
  libraryWordSet,
  onStatusChange,
}: {
  word: Word;
  card?: SrsCard;
  language: string;
  libraryWordSet?: Set<string>;
  onStatusChange?: (
    word: string,
    status: "new" | "learning" | "learned" | "remove",
    meta?: { cefrLevel?: string; translation?: string; pos?: string }
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const resolvedStatus =
    card?.status === "learned" || card?.status === "review" || (card?.repetitions && card?.repetitions >= 3)
      ? "learned"
      : card?.status === "learning"
      ? "learning"
      : card?.status === "new"
      ? "new"
      : "";
  const [currentStatus, setCurrentStatus] = useState<string>(resolvedStatus);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setCurrentStatus(
      card?.status === "learned" || card?.status === "review" || (card?.repetitions && card?.repetitions >= 3)
        ? "learned"
        : card?.status === "learning"
        ? "learning"
        : card?.status === "new"
        ? "new"
        : ""
    );
  }, [card?.status, card?.repetitions]);

  // Helper to distinguish English and Chinese definitions
  const isChineseStr = (text?: string | null) => {
    if (!text) return false;
    return /[\u4e00-\u9fa5]/.test(text);
  };

  let engDef = "";
  let zhDef = "";
  const definitionZh = w.definition_zh || card?.translation || "";
  const englishTranslation = w.english_translation || "";

  if (isChineseStr(definitionZh) && !isChineseStr(englishTranslation)) {
    engDef = englishTranslation;
    zhDef = definitionZh;
  } else if (!isChineseStr(definitionZh) && isChineseStr(englishTranslation)) {
    engDef = definitionZh;
    zhDef = englishTranslation;
  } else if (isChineseStr(definitionZh)) {
    zhDef = definitionZh;
    engDef = !isChineseStr(englishTranslation) ? englishTranslation : "";
  } else {
    engDef = definitionZh || englishTranslation;
    zhDef = "";
  }

  const level = (w.cefr_level || card?.cefrLevel || "A1").toUpperCase();
  const cseRaw = (w.cse_level || card?.cseLevel || cefrToCse(w.cefr_level || card?.cefrLevel || "")).trim();
  const cse = /^[2-9]$/.test(cseRaw) ? cseRaw : "";
  const cseLabel = cse ? CSE_BUCKET_LABELS[cse] || `CSE ${cse}` : "";
  const levelBadge = LEVEL_BADGES[level] || LEVEL_BADGES["A1"];
  const posList = getAllPosLabels(w);

  const isMastered = currentStatus === "learned" || currentStatus === "review";
  const isInLibrary = Boolean(libraryWordSet && libraryWordSet.has(w.word.toLowerCase().trim()));
  const hasStatus = isMastered || currentStatus === "learning" || currentStatus === "new";

  async function handleClearStatus() {
    if (!hasStatus) return;
    // If word is in user's active library course/unit and currently learning/mastered, reset to "new"; otherwise remove to none
    const nextAction = isInLibrary && currentStatus !== "new" ? "new" : "remove";
    setCurrentStatus(nextAction === "remove" ? "" : nextAction);
    onStatusChange?.(w.word, nextAction, {
      cefrLevel: w.cefr_level,
      translation: w.definition_zh || w.english_translation,
      pos: w.pos,
    });

    setIsUpdating(true);
    try {
      await setWordStatus(w.word, language, nextAction, {
        cefrLevel: w.cefr_level,
        translation: w.definition_zh || w.english_translation,
        pos: w.pos,
      });
    } catch (err) {
      console.error("Failed to reset word status:", err);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleSetMastered() {
    if (isMastered) return;
    const nextAction = "learned";
    setCurrentStatus(nextAction);
    onStatusChange?.(w.word, nextAction, {
      cefrLevel: w.cefr_level,
      translation: w.definition_zh || w.english_translation,
      pos: w.pos,
    });

    setIsUpdating(true);
    try {
      await setWordStatus(w.word, language, nextAction, {
        cefrLevel: w.cefr_level,
        translation: w.definition_zh || w.english_translation,
        pos: w.pos,
      });
    } catch (err) {
      console.error("Failed to set mastered status:", err);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="w-full rounded-xl border-2 border-lingo-border bg-lingo-card hover:border-lingo-gray-dark transition-all overflow-hidden shadow-xs cursor-pointer"
    >
      {/* ── TOP BAR (Word, Multi-POS, English Meaning Preview, 3 Right Icons: Status, Reset, Mastered) ── */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 gap-2">
        {/* Left: Pronounce, Level Badge, Word, IPA, Multi-POS */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0 max-w-[52%] sm:max-w-[44%]">
          {/* Audio Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playAudio(w.word, language);
            }}
            className="shrink-0 p-1.5 rounded-lg text-lingo-text-light hover:text-lingo-blue hover:bg-lingo-blue/10 transition-colors cursor-pointer"
            title="Pronounce"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>

          {/* Level Badge (CEFR) + CSE badge */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black border ${levelBadge}`}
          >
            {level}
          </span>
          {cse && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black border ${CSE_BADGES[cse]}`}
              title={`CSE ${cse} · ${cseLabel}`}
            >
              CSE {cse}
            </span>
          )}

          {/* Word Name, IPA & Multiple POS */}
          <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap min-w-0">
            <span className="text-xs sm:text-sm font-black text-lingo-text shrink-0">
              {w.word}
            </span>
            {w.ipa && (
              <span className="text-[10px] sm:text-[11px] font-mono text-lingo-text-light/80 shrink-0">
                /{w.ipa}/
              </span>
            )}
            {posList.length > 0 && (
              <span className="text-[10px] font-semibold text-lingo-text-light/70 italic truncate">
                {posList.join(" · ")}
              </span>
            )}
          </div>
        </div>

        {/* ── Middle: Simplest Chinese Translation Preview at Top Line ── */}
        <div className="flex-1 min-w-0 px-1.5 sm:px-3 text-left">
          <p
            className="text-xs sm:text-sm font-semibold text-lingo-text/85 dark:text-lingo-text/80 truncate"
            title={zhDef || engDef || "Click to expand details"}
          >
            {cleanZhSummary(zhDef || engDef) || (
              <span className="text-lingo-text-light/40 italic text-[10px] sm:text-[11px]">
                Click for details
              </span>
            )}
          </p>
        </div>

        {/* Right: 3 Icons — 1. Current Status Badge (display only), 2. Reset Button, 3. Mastered Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1st Icon: Current Status Indicator (display only, does not trigger actions) */}
          <span
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black shadow-xs shrink-0 select-none cursor-default ${
              isMastered
                ? "bg-emerald-500 text-white"
                : currentStatus === "learning"
                ? "bg-amber-400 text-amber-950"
                : currentStatus === "new"
                ? "bg-blue-500 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-lingo-border"
            }`}
            title={`Current Status: ${
              isMastered
                ? "Mastered (M)"
                : currentStatus === "learning"
                ? "Learning (L)"
                : currentStatus === "new"
                ? "New (N)"
                : "Not in SRS (-)"
            }`}
          >
            {isMastered ? "M" : currentStatus === "learning" ? "L" : currentStatus === "new" ? "N" : "–"}
          </span>

          {/* 2nd Icon: Reset Word Status Button */}
          <button
            type="button"
            disabled={isUpdating || !hasStatus}
            onClick={(e) => {
              e.stopPropagation();
              handleClearStatus();
            }}
            className={`w-7 h-7 rounded-full transition-all flex items-center justify-center shadow-xs shrink-0 ${
              hasStatus
                ? "bg-white text-lingo-text-light border-2 border-lingo-border hover:border-rose-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                : "bg-slate-50 text-slate-300 border-2 border-slate-200 cursor-not-allowed opacity-60"
            }`}
            title={hasStatus ? "Reset word status" : "No status to reset"}
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          {/* 3rd Icon: Set as Mastered Button */}
          <button
            type="button"
            disabled={isUpdating || isMastered}
            onClick={(e) => {
              e.stopPropagation();
              handleSetMastered();
            }}
            className={`w-7 h-7 rounded-full transition-all flex items-center justify-center shadow-xs shrink-0 ${
              isMastered
                ? "bg-emerald-500 text-white ring-2 ring-emerald-300 cursor-default"
                : "bg-white text-lingo-text-light border-2 border-lingo-border hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"
            }`}
            title={isMastered ? "Already Mastered" : "Set as Mastered"}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </button>
        </div>
      </div>

      {/* ── EXPANDED DROPDOWN (Row 1: English Meaning, Row 2: Chinese Meaning, Row 3: Example Sentence) ── */}
      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mx-2.5 sm:mx-3 mb-2.5 sm:mb-3 border-t border-lingo-border pt-2.5 space-y-2 text-xs cursor-default"
        >
          {/* Row 1: Full English Meaning + All POS Badges */}
          <div className="rounded-xl bg-lingo-blue/5 dark:bg-lingo-blue/10 border border-lingo-blue/20 p-3 space-y-1.5">
            {posList.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {posList.map((posLabel) => (
                  <span
                    key={posLabel}
                    className="rounded-md bg-lingo-blue/15 text-lingo-blue px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
                  >
                    {posLabel}
                  </span>
                ))}
              </div>
            )}
            <p className="font-bold text-lingo-text text-xs sm:text-sm leading-relaxed">
              <span className="font-black text-lingo-blue">EN:</span>{" "}
              {engDef || cleanZhSummary(zhDef) || "No English definition available"}
            </p>
          </div>

          {/* Row 2: Chinese Meaning Box */}
          <div className="rounded-xl bg-lingo-blue/5 dark:bg-lingo-blue/10 border border-lingo-blue/20 p-3">
            <p className="font-bold text-lingo-text text-xs sm:text-sm leading-relaxed">
              <span className="font-black text-lingo-blue">中文:</span>{" "}
              {cleanZhSummary(zhDef) || "暂无中文释义"}
            </p>
          </div>

          {/* Row 3: Example Sentence Box */}
          <div className="rounded-xl bg-lingo-blue/5 dark:bg-lingo-blue/10 border border-lingo-blue/20 p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <p className="font-bold text-lingo-text text-xs sm:text-sm leading-relaxed">
                  <span className="font-black text-lingo-blue">Example:</span>{" "}
                  {w.example_sentence_native || `This is an example using the word "${w.word}".`}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  playAudio(
                    w.example_sentence_native || `This is an example using the word ${w.word}`,
                    language
                  )
                }
                className="p-1.5 rounded-lg text-lingo-blue hover:bg-lingo-blue/10 shrink-0 transition-colors cursor-pointer"
                title="Listen to example sentence"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {(w.example_zh || w.example_sentence_english) && (
              <p className="text-lingo-text-light/80 text-[11px] sm:text-xs pt-1 border-t border-lingo-blue/10">
                {w.example_zh || w.example_sentence_english}
              </p>
            )}
          </div>

          {/* Domain Tags */}
          {w.domain_tags && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {w.domain_tags.split(",").map((tag) => (
                <span
                  key={tag.trim()}
                  className="rounded bg-lingo-blue/10 px-1.5 py-0.5 text-[9px] font-bold text-lingo-blue"
                >
                  #{tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
