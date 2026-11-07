"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Volume2,
  Search,
  Check,
  RotateCcw,
  ListChecks,
} from "lucide-react";
import { setWordStatusesBulk } from "@/lib/actions/srs";

interface Word {
  word: string;
  cefr_level: string;
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
  pos?: string | null;
  status: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  lastRating?: string | null;
  createdAt: Date;
  /** True for the synthetic card attached to a library word the learner has
   *  not started yet: its "new" status is DERIVED from the catalog, not
   *  stored in the SRS deck. Such a word has no deck row to reset. */
  derived?: boolean;
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

/** "all" and "remaining" read the master dictionary; the rest read only the
 *  learner's own SRS cards. "mine" is the union of the three tracked states —
 *  it is the student-facing default so a student never lands on the raw
 *  dictionary (and therefore never sees a word outside their library). */
type SrsFilter =
  | "all"
  | "mine"
  | "learned"
  | "learning"
  | "new"
  | "remaining";

/** Single source of truth for "which bucket does this card fall in". The
 *  Progress page uses the exact same rules, so the counts on /words and
 *  /progress can never disagree. */
function isMasteredCard(c: SrsCard): boolean {
  return (
    c.status === "learned" ||
    c.status === "review" ||
    (!!c.repetitions && c.repetitions >= 3)
  );
}

function isLearningCard(c: SrsCard): boolean {
  return c.status === "learning" && (!c.repetitions || c.repetitions < 3);
}

function isNewCard(c: SrsCard): boolean {
  return c.status === "new" && (!c.repetitions || c.repetitions < 3);
}

/** Any word the learner has actually started: learning or mastered.
 *  New is DERIVED from the library and never stored, so a stored "new" row is
 *  deliberately not part of the tracked set — "mine" and the "R" (remaining)
 *  filter must keep offering the learner every word they have not taken on. */
function hasTrackedStatus(c: SrsCard): boolean {
  return isMasteredCard(c) || isLearningCard(c);
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

// 2 rows for A-Z alphabet navigation (14 items each)
const ALPHABET_ROWS = [
  ["ALL", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"],
  ["N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#"],
] as const;

// POS filter using symbols. The labels are deliberately kept to 1-2 chars so
// the whole row fits on one row without the labels truncating ("Adj" → "AJ").
const POS_OPTIONS = [
  { key: "all", label: "All", fullName: "All Parts of Speech" },
  { key: "noun", label: "N", fullName: "Noun (名词)" },
  { key: "verb", label: "V", fullName: "Verb (动词)" },
  { key: "adjective", label: "AJ", fullName: "Adjective (形容词)" },
  { key: "adverb", label: "AV", fullName: "Adverb (副词)" },
  { key: "preposition", label: "PP", fullName: "Preposition (介词)" },
  { key: "conjunction", label: "CJ", fullName: "Conjunction (连词)" },
  { key: "pronoun", label: "PN", fullName: "Pronoun (代词)" },
  { key: "determiner", label: "DT", fullName: "Determiner (限定词/冠词)" },
] as const;

/** Short POS label for the active-filter summary line ("AJ" not "ADJECTIVE"). */
function posLabelFor(posKey: string): string {
  return POS_OPTIONS.find((p) => p.key === posKey)?.label || posKey.toUpperCase();
}

/** Full status name for the active-filter summary line. */
function statusLabelFor(filter: SrsFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "mine":
      return "All";
    case "learned":
      return "Mastered";
    case "learning":
      return "Learning";
    case "new":
      return "New";
    case "remaining":
      return "Remaining";
    default:
      return filter;
  }
}

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
  isAdmin = false,
  srsCards = [],
  libraryWords = [],
  language = "en",
  levelDictionaryCounts,
  remainingDictionaryCount,
}: {
  isAdmin?: boolean;
  words?: Word[];
  srsCards?: SrsCard[];
  srsStats?: SrsStats;
  libraryWords?: string[];
  language?: string;
  levelDictionaryCounts?: Record<string, number>;
  /** Exact size of the "Remaining" (R) filter's result set, computed on the
   *  server the same way the API filters it. */
  remainingDictionaryCount?: number;
}) {
  const router = useRouter();

  /** A bulk action touches dozens of words at once; collapsing the resulting
   *  router.refresh() calls into one keeps Next from refetching the server
   *  tree once per word. */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 250);
  }, [router]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  // Size of the master dictionary (A1–C2). Only the owner needs it: it is the
  // base for the "R" (remaining) count, i.e. dictionary words that are not new,
  // learning or mastered yet.
  const dictionaryTotal = useMemo(() => {
    if (!levelDictionaryCounts) return 0;
    return Object.values(levelDictionaryCounts).reduce((acc, n) => acc + (n || 0), 0);
  }, [levelDictionaryCounts]);
  const [selectedLevel, setSelectedLevel] = useState<string>("");
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

  const handleClearLevels = () => {
    setSelectedLevel("");
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
      scheduleRefresh();
    },
    [language, scheduleRefresh]
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
        onClearLevels={handleClearLevels}
        language={language}
        srsMap={srsMap}
        srsCards={cards}
        libraryWordSet={libraryWordSet}
        onCardStatusChange={handleCardStatusChange}
        isAdmin={isAdmin}
        dictionaryTotal={dictionaryTotal}
        remainingDictionaryCount={remainingDictionaryCount}
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
  onClearLevels,
  language,
  srsMap,
  srsCards,
  libraryWordSet,
  onCardStatusChange,
  isAdmin = false,
  dictionaryTotal = 0,
  remainingDictionaryCount,
}: {
  selectedLevel: string;
  onSelectLevel: (lvl: string) => void;
  onClearLevels: () => void;
  language: string;
  srsMap: Map<string, SrsCard>;
  srsCards: SrsCard[];
  libraryWordSet?: Set<string>;
  onCardStatusChange?: (
    word: string,
    status: "new" | "learning" | "learned" | "remove",
    meta?: { cefrLevel?: string; translation?: string; pos?: string }
  ) => void;
  isAdmin?: boolean;
  dictionaryTotal?: number;
  /** Exact size of the "Remaining" (R) filter's result set (server-computed). */
  remainingDictionaryCount?: number;
}) {
  // The owner browses the whole dictionary by default; a student starts on
  // "All" (= their own new + learning + mastered, labelled "All" in the UI)
  // and has no entry point into the un-owned part of the dictionary at all.
  const defaultFilter: SrsFilter = isAdmin ? "all" : "mine";
  const [statusFilter, setStatusFilter] = useState<SrsFilter>(defaultFilter);
  const [selectedLetter, setSelectedLetter] = useState<string>("ALL");
  const [selectedPos, setSelectedPos] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [words, setWords] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  /* ── Bulk selection ──────────────────────────────────────────────
     Keys are normalized words, so a word keeps its selection while the
     list re-renders. Selection is scoped to what is currently on screen:
     filtering / searching silently drops anything scrolled out of view. */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const onScreen = new Set(words.map((w) => w.word.toLowerCase().trim()));
      const next = new Set<string>();
      prev.forEach((k) => {
        if (onScreen.has(k)) next.add(k);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [words]);

  const selectedOnScreen = useMemo(
    () => words.filter((w) => selectedKeys.has(w.word.toLowerCase().trim())),
    [words, selectedKeys]
  );
  const allOnScreenSelected = words.length > 0 && selectedOnScreen.length === words.length;

  const toggleSelect = useCallback((key: string) => {
    setBulkError(null);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** 1st button = Reset (remove SRS status), 2nd = Master (mark learned).
      Both act on every selected word currently on screen.

      ONE server action handles the whole selection. Firing one request per
      word saturated the 5-connection Postgres pool on Vercel and the page
      hung on "Updating…" forever (postgres.js has no queue timeout, so the
      queued requests never came back). */
  const applyBulk = useCallback(
    async (action: "learned" | "remove") => {
      if (bulkBusy || selectedOnScreen.length === 0) return;
      setBulkBusy(true);
      setBulkError(null);
      const targets = selectedOnScreen.map((w) => ({
        word: w.word,
        cefrLevel: w.cefr_level,
        translation: w.definition_zh || w.english_translation,
        pos: w.pos,
      }));

      // Hard safety net: if the server never answers, release the UI instead
      // of leaving it stuck on "Updating…" forever.
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        setBulkError("Timed out — please try again.");
        setBulkBusy(false);
      }, 30000);

      try {
        const result = await setWordStatusesBulk(targets, language, action);
        if (timedOut) return;
        // Mirror the change into the local card list so the badges update
        // immediately, without waiting for the server round-trip.
        targets.forEach((t) =>
          onCardStatusChange?.(t.word, action === "remove" ? "remove" : "learned", {
            cefrLevel: t.cefrLevel,
            translation: t.translation,
            pos: t.pos,
          })
        );
        if (result?.failed > 0) {
          console.error(`Bulk "${action}": ${result.failed} word(s) failed`);
          setBulkError(`${result.failed} of ${targets.length} word(s) failed.`);
        }
        setSelectedKeys(new Set());
      } catch (err) {
        if (timedOut) return;
        console.error("Bulk status update failed:", err);
        setBulkError("Update failed — please try again.");
      } finally {
        clearTimeout(timer);
        if (!timedOut) setBulkBusy(false);
      }
    },
    [bulkBusy, selectedOnScreen, language, onCardStatusChange]
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  // "mine" reads the learner's own cards too, so a student never reaches the
  // dictionary fetch below. Only "all" and "remaining" read the dictionary.
  const isSrsSpecificFilter =
    statusFilter === "learning" ||
    statusFilter === "learned" ||
    statusFilter === "new" ||
    statusFilter === "mine";

  // Nobody holds traditional enrolments any more (the +/× library toggles were
  // removed), so everyone's M / L / N / My-Words sets are DERIVED from the full
  // course catalog rather than read off the bare SRS deck — the deck only
  // physically stores the words the learner has actually started (M/L).
  // Those tabs therefore read the dictionary scoped to the learner's library
  // ("libraryOnly"), which is exactly the set /progress reports as "All". The
  // owner now takes this path too: their deck used to be the source of truth,
  // but with "new" derived there is no longer an owner-only deck state to read.
  const useLibraryApi =
    statusFilter === "mine" ||
    statusFilter === "new" ||
    statusFilter === "learned" ||
    statusFilter === "learning";

  /** Words already in one of the three tracked states, keyed for O(1) lookup
   *  when the "R" (remaining) filter walks a page of dictionary words. */
  const trackedWordSet = useMemo(() => {
    const set = new Set<string>();
    srsCards.forEach((c) => {
      if (hasTrackedStatus(c)) set.add(c.word.toLowerCase().trim());
    });
    return set;
  }, [srsCards]);

  const liveLearnedCount = useMemo(() => srsCards.filter(isMasteredCard).length, [srsCards]);

  const liveLearningCount = useMemo(() => srsCards.filter(isLearningCard).length, [srsCards]);

  // New is DERIVED for everyone: every library word the learner has not yet
  // mastered or started learning. That is exactly the set /progress reports as
  // New, so the two pages can never disagree — and it no longer depends on
  // whether a stored "new" row happens to exist for the word.
  const liveNewCount = useMemo(() => {
    return Math.max(
      0,
      (libraryWordSet?.size || 0) - liveLearnedCount - liveLearningCount
    );
  }, [libraryWordSet, liveLearnedCount, liveLearningCount]);

  /** Owner-only: dictionary words that are not new, learning or mastered yet.
   *  The server computes the exact number (dictionary words minus the tracked
   *  SRS words) so the R badge always matches the list behind it; the
   *  dictionary-total estimate is only a fallback. */
  const liveRemainingCount = useMemo(() => {
    if (typeof remainingDictionaryCount === "number" && remainingDictionaryCount > 0) {
      return remainingDictionaryCount;
    }
    return Math.max(0, dictionaryTotal - trackedWordSet.size);
  }, [dictionaryTotal, trackedWordSet, remainingDictionaryCount]);

  useEffect(() => {
    let cancelled = false;

    if (isSrsSpecificFilter && !useLibraryApi) {
      setLoading(true);
      let cards = srsCards;

      if (selectedLevel) {
        cards = cards.filter(
          (c) => (c.cefrLevel || "").toUpperCase().trim() === selectedLevel
        );
      }

      if (statusFilter === "learning") {
        cards = cards.filter(isLearningCard);
      } else if (statusFilter === "learned") {
        cards = cards.filter(isMasteredCard);
      } else if (statusFilter === "new") {
        cards = cards.filter(isNewCard);
      } else if (statusFilter === "mine") {
        // Union of the three tracked states — the student's whole owned set.
        cards = cards.filter(hasTrackedStatus);
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

    // "all" and "remaining" both read the master dictionary. "remaining" then
    // drops every word the learner already has as new / learning / mastered.
    // A student's "My Words" / M / L / N also read the dictionary, but scoped
    // to their library (libraryOnly) so the list matches /progress exactly.
    async function fetchFromApi() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("lang", language);
        if (selectedLevel) params.set("level", selectedLevel);
        if (selectedLetter && selectedLetter !== "ALL") params.set("letter", selectedLetter);
        if (selectedPos && selectedPos !== "all") params.set("pos", selectedPos);
        if (debouncedSearch) params.set("q", debouncedSearch);
        params.set("page", String(page));
        params.set("limit", "50");

        // The "Remaining" (R) filter asks the server to drop every word the
        // learner already has in their SRS deck, so only un-studied words come
        // back. The server does the exclusion (exact + paginable); the client
        // double-checks below as a safety net.
        if (statusFilter === "remaining") params.set("excludeInSrs", "1");
        // Student library scope: the server builds the list from the learner's
        // library (the derived catalog union) and, for M / L / N, keeps only
        // the matching derived status. The server filters before pagination,
        // so the count and "show more" stay exact.
        if (useLibraryApi) {
          params.set("libraryOnly", "1");
          if (statusFilter !== "mine") params.set("srsStatus", statusFilter);
        }

        const res = await fetch(`/api/words?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const fetchedWords: Word[] = data.words || [];
            const isRemaining = statusFilter === "remaining";
            const shownWords = isRemaining
              ? fetchedWords.filter((w) => !trackedWordSet.has(w.word.toLowerCase().trim()))
              : fetchedWords;

            // A library word that is not in the learner's deck is a DERIVED
            // "new" word: it belongs to a course/unit they can see but have
            // not started yet. Give it a synthetic "new" card so the status
            // badge reads N (instead of "not in SRS"). The synthetic card is
            // flagged `derived`, so the reset button stays disabled — there
            // is no deck row to reset.
            const mappedWords = useLibraryApi
              ? shownWords.map((w) => ({
                  ...w,
                  _card:
                    srsMap.get(w.word.toLowerCase().trim()) ||
                    ({
                      word: w.word,
                      language,
                      translation: w.english_translation || "",
                      cefrLevel: w.cefr_level || "A1",
                      pos: w.pos || "noun",
                      status: "new",
                      easeFactor: 2.5,
                      interval: 0,
                      repetitions: 0,
                      nextReviewAt: null,
                      lastReviewedAt: null,
                      createdAt: new Date(),
                      derived: true,
                    } as SrsCard),
                }))
              : shownWords;

            if (page === 1) {
              setWords(mappedWords);
            } else {
              setWords((prev) => [...prev, ...mappedWords]);
            }
            // The server now returns the true count of words matching the
            // current view — including the R filter — so the denominator and
            // "show more" are correct for every status, not just the dictionary.
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
    selectedLetter,
    selectedPos,
    statusFilter,
    debouncedSearch,
    page,
    srsCards,
    srsMap,
    isSrsSpecificFilter,
    useLibraryApi,
    trackedWordSet,
  ]);

  function handleLevelChange(lvl: string) {
    const next = selectedLevel === lvl ? "" : lvl;
    onSelectLevel(next);
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
    selectedLetter !== "ALL" ||
    selectedPos !== "all" ||
    statusFilter !== defaultFilter ||
    search !== "";

  function clearAllFilters() {
    onClearLevels();
    setSelectedLetter("ALL");
    setSelectedPos("all");
    setStatusFilter(defaultFilter);
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

        {/* Status filters.
            Owner  : All / M / L / N / R   (each with a count badge)
            Student: All (= my own words: the three tracked states) / M / L / N
                     — "All" carries no count (it is the umbrella over M + L + N,
                     so a number there would just repeat the three next to it);
                     M / L / N each show their own count. The "All" here means
                     "all of MY words", so the part of the dictionary the student
                     does not own stays unreachable.
            Labels are single letters (M = Mastered, L = Learning, N = New,
            R = Remaining) so the row never truncates; the full name is on
            the button's tooltip. */}
        <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card p-1 sm:p-1.5 shadow-xs">
          <div className="flex items-center justify-between gap-1 w-full">
            {(
              isAdmin
                ? [
                    { key: "all" as const, label: "All", title: "All dictionary words", count: null, tone: "" },
                    { key: "learned" as const, label: "M", title: "Mastered", count: liveLearnedCount, tone: "M" },
                    { key: "learning" as const, label: "L", title: "Learning", count: liveLearningCount, tone: "L" },
                    { key: "new" as const, label: "N", title: "New", count: liveNewCount, tone: "N" },
                    {
                      key: "remaining" as const,
                      label: "R",
                      title: "Remaining — dictionary words not yet new, learning or mastered",
                      count: liveRemainingCount,
                      tone: "R",
                    },
                  ]
                : [
                    {
                      key: "mine" as const,
                      label: "All",
                      title: "All my words — mastered, learning and new (M + L + N)",
                      // No count: "All" is the umbrella over M + L + N, so a number
                      // there would just repeat the three next to it.
                      count: null,
                      tone: "",
                    },
                    { key: "learned" as const, label: "M", title: "Mastered", count: liveLearnedCount, tone: "M" },
                    { key: "learning" as const, label: "L", title: "Learning", count: liveLearningCount, tone: "L" },
                    { key: "new" as const, label: "N", title: "New", count: liveNewCount, tone: "N" },
                  ]
            ).map((f) => {
              const active = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => handleStatusChange(f.key)}
                  title={f.title}
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
                          : f.tone === "M"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                          : f.tone === "L"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
                          : f.tone === "R"
                          ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
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
          {statusFilter === "remaining"
            ? `${total.toLocaleString()} remaining words`
            : `${words.length.toLocaleString()} of ${total.toLocaleString()} words`}
          {selectedLevel && ` • ${selectedLevel}`}
          {selectedLetter !== "ALL" && ` • "${selectedLetter}"`}
          {selectedPos !== "all" && ` • ${posLabelFor(selectedPos)}`}
          {statusFilter !== defaultFilter &&
            statusFilter !== "remaining" &&
            ` • ${statusLabelFor(statusFilter)}`}
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

      {/* ── BULK ACTION BAR: 1. Reset  2. Master  3. Select All ──
          Acts on every word ticked with the round button on its row. */}
      <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card p-1.5 sm:p-2 shadow-xs flex items-center gap-1.5 sm:gap-2">
        <span
          className={`pl-1 text-[10px] sm:text-[11px] font-black shrink-0 tabular-nums ${
            bulkError ? "text-rose-500" : "text-lingo-text-light"
          }`}
        >
          {bulkError
            ? bulkError
            : bulkBusy
            ? "Updating..."
            : selectedOnScreen.length > 0
            ? `${selectedOnScreen.length} selected`
            : "Tick words to edit"}
        </span>

        <div className="flex-1" />

        {/* 1st: Reset selected words */}
        <button
          type="button"
          onClick={() => applyBulk("remove")}
          disabled={bulkBusy || selectedOnScreen.length === 0}
          title="Reset status of all selected words"
          className={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 text-[10px] sm:text-[11px] font-black transition-all ${
            bulkBusy || selectedOnScreen.length === 0
              ? "bg-slate-100 dark:bg-slate-800 text-slate-300 cursor-not-allowed"
              : "bg-white text-rose-600 border-2 border-rose-200 hover:bg-rose-50 hover:border-rose-400 cursor-pointer shadow-xs"
          }`}
        >
          <RotateCcw className="w-3 h-3 stroke-[2.5]" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        {/* 2nd: Master selected words */}
        <button
          type="button"
          onClick={() => applyBulk("learned")}
          disabled={bulkBusy || selectedOnScreen.length === 0}
          title="Mark all selected words as Mastered"
          className={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 text-[10px] sm:text-[11px] font-black transition-all ${
            bulkBusy || selectedOnScreen.length === 0
              ? "bg-slate-100 dark:bg-slate-800 text-slate-300 cursor-not-allowed"
              : "bg-white text-emerald-600 border-2 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400 cursor-pointer shadow-xs"
          }`}
        >
          <Check className="w-3 h-3 stroke-[3]" />
          <span className="hidden sm:inline">Master</span>
        </button>

        {/* 3rd: Select / Deselect everything on screen */}
        <button
          type="button"
          onClick={() =>
            setSelectedKeys((prev) =>
              allOnScreenSelected
                ? new Set()
                : new Set(words.map((w) => w.word.toLowerCase().trim()))
            )
          }
          disabled={bulkBusy || words.length === 0}
          title={
            allOnScreenSelected
              ? "Deselect all words on screen"
              : "Select all words on screen"
          }
          className={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 text-[10px] sm:text-[11px] font-black transition-all ${
            bulkBusy || words.length === 0
              ? "bg-slate-100 dark:bg-slate-800 text-slate-300 cursor-not-allowed"
              : allOnScreenSelected
              ? "bg-lingo-blue text-white border-2 border-lingo-blue hover:bg-lingo-blue-dark cursor-pointer shadow-xs"
              : "bg-white text-lingo-blue border-2 border-lingo-blue/40 hover:bg-lingo-blue/5 hover:border-lingo-blue cursor-pointer shadow-xs"
          }`}
        >
          <ListChecks className="w-3 h-3 stroke-[2.5]" />
          <span className="hidden sm:inline">
            {allOnScreenSelected ? "Clear" : "Select All"}
          </span>
        </button>
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
                  onStatusChange={onCardStatusChange}
                  selected={selectedKeys.has(w.word.toLowerCase().trim())}
                  onToggleSelect={toggleSelect}
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
  onStatusChange,
  selected = false,
  onToggleSelect,
}: {
  word: Word;
  card?: SrsCard;
  language: string;
  onStatusChange?: (
    word: string,
    status: "new" | "learning" | "learned" | "remove",
    meta?: { cefrLevel?: string; translation?: string; pos?: string }
  ) => void;
  /** Bulk-edit: is this word part of the current screen selection? */
  selected?: boolean;
  onToggleSelect?: (key: string) => void;
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
  const levelBadge = LEVEL_BADGES[level] || LEVEL_BADGES["A1"];
  const posList = getAllPosLabels(w);

  const isMastered = currentStatus === "learned" || currentStatus === "review";
  const selectKey = w.word.toLowerCase().trim();

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className={`w-full rounded-xl border-2 transition-all overflow-hidden shadow-xs cursor-pointer ${
        selected
          ? "border-lingo-blue bg-lingo-blue/5 dark:bg-lingo-blue/10"
          : "border-lingo-border bg-lingo-card hover:border-lingo-gray-dark"
      }`}
    >
      {/* ── TOP BAR (Word, Multi-POS, English Meaning Preview, Status + Select) ── */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 gap-2">
        {/* Left: Pronounce, Level Badge, Word, IPA, Multi-POS */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0 max-w-[38%] sm:max-w-[44%]">
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

          {/* Level Badge (CEFR) */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black border ${levelBadge}`}
          >
            {level}
          </span>

          {/* Word Name, IPA & Multiple POS */}
          <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap min-w-0">
            <span className="text-xs sm:text-sm font-black text-lingo-text shrink-0">
              {w.word}
            </span>
            {w.ipa && (
              <span className="hidden sm:inline text-[10px] sm:text-[11px] font-mono text-lingo-text-light/80 shrink-0">
                /{w.ipa}/
              </span>
            )}
            {posList.length > 0 && (
              <span className="hidden sm:inline text-[10px] font-semibold text-lingo-text-light/70 italic truncate">
                {posList.join(" · ")}
              </span>
            )}
          </div>
        </div>

        {/* ── Middle: Simplest Chinese Translation Preview at Top Line ── */}
        <div className="flex-1 min-w-0 px-1.5 sm:px-3 text-left">
          <p
            className="text-xs sm:text-sm font-bold text-lingo-text dark:text-lingo-text truncate"
            title={zhDef || engDef || "Click to expand details"}
          >
            {cleanZhSummary(zhDef || engDef) || (
              <span className="text-lingo-text-light/40 italic text-[10px] sm:text-[11px]">
                Click for details
              </span>
            )}
          </p>
        </div>

        {/* Right: Status Badge (display only) + Round Select Button (bulk edit) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Status Indicator (display only, does not trigger actions) */}
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

          {/* Round Select Button — picks this word for the Reset / Master
              buttons in the bulk bar above the list. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(selectKey);
            }}
            aria-pressed={selected}
            className={`w-7 h-7 rounded-full transition-all flex items-center justify-center shadow-xs shrink-0 ${
              selected
                ? "bg-lingo-blue text-white ring-2 ring-lingo-blue/30 cursor-pointer"
                : "bg-white text-lingo-text-light border-2 border-lingo-border hover:border-lingo-blue hover:text-lingo-blue hover:bg-lingo-blue/5 cursor-pointer"
            }`}
            title={selected ? "Deselect this word" : "Select this word"}
          >
            <Check
              className={`w-3.5 h-3.5 stroke-[3] transition-opacity ${
                selected ? "opacity-100" : "opacity-25"
              }`}
            />
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
