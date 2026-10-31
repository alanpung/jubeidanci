"use client";

import { useState, useMemo, useEffect } from "react";
import {
  TrendingUp,
  GraduationCap,
  Users,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { StudentInspector } from "@/components/words/student-inspector";
import { WordStatusFlow } from "@/components/words/word-status-flow";

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
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** Normalize a CEFR level string to one of the known buckets (default A1). */
function normalizeLevel(level?: string | null): string {
  const raw = (level || "A1").toUpperCase().trim();
  return CEFR_LEVELS.includes(raw as (typeof CEFR_LEVELS)[number])
    ? raw
    : "A1";
}

const LEVEL_BADGES: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  A2: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-800",
  B1: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800",
  B2: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  C1: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  C2: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
};

export function ProgressView({
  isAdmin = false,
  isAuthorAllWords = false,
  srsCards = [],
  libraryWords = [],
  language = "en",
  levelDictionaryCounts = { A1: 1000, A2: 1555, B1: 4610, B2: 8760, C1: 5127, C2: 1275 },
}: {
  isAdmin?: boolean;
  isAuthorAllWords?: boolean;
  srsCards?: SrsCard[];
  libraryWords?: { word: string; level: string }[];
  language?: string;
  levelDictionaryCounts?: Record<string, number>;
}) {
  const [activeTab, setActiveTab] = useState<"author" | "inspector">("author");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [cards, setCards] = useState<SrsCard[]>(srsCards);
  // "My Books" vocabulary (word + CEFR level). The source of truth for the
  // "My Words" and "New" counts — see levelStats below.
  const [libWords, setLibWords] = useState<{ word: string; level: string }[]>(
    libraryWords || [],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Client-side "fetch latest SRS info" — bypasses the server render path
  // (and its silent .catch(() => []) swallow) so a zero count is never
  // silently shown, and the user can pull fresh data on demand.
  async function refreshSrs() {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshNote(null);
    try {
      const res = await fetch(`/api/srs-cards`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRefreshError(data.error || `HTTP ${res.status}`);
        setRefreshNote(null);
      } else {
        setCards(Array.isArray(data.cards) ? data.cards : []);
        setLibWords(Array.isArray(data.libraryWords) ? data.libraryWords : []);
        const dbInfo = data.dbUp
          ? `DB up · ${data.dbRowCount ?? "?"} rows in Postgres`
          : "DB unreachable — reading local store only";
        setRefreshNote(`${dbInfo} · ${data.count ?? 0} cards loaded`);

        // If Postgres has rows but the deck read failed (a schema/connection
        // error), say so loudly — otherwise the page just shows the
        // locally-seeded course words and looks like data loss.
        if (data.dbDeckError) {
          setRefreshError(
            `Database read failed: ${data.dbDeckError}. The counts below may be incomplete.`,
          );
        }
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  // Sync with server data (deck cards + My Books vocabulary)
  useEffect(() => {
    setCards(srsCards || []);
    setLibWords(libraryWords || []);
  }, [srsCards, libraryWords]);

  // Compute level statistics. Per the product rule (d/n/L/M model):
  //   - Mastered / Learning come from the FULL SRS deck, independent of
  //     whether a word is still in My Books. Removing a book must NOT erase
  //     the learner's progress — L/M "保持不变" (stay the same).
  //   - My Words = M ∪ L ∪ My Books (the union of Mastered, Learning and the
  //     learner's current library vocabulary). Because removing a book must
  //     NOT erase earned progress, Mastered/Learning words from the deck stay
  //     counted even when their source book is gone. For the owner
  //     ("isAuthorAllWords") the whole deck is theirs, so My Words = every
  //     distinct deck word. This makes the Quick-Stat subtitle
  //     "Mastered + Learning + New" exact: those three sets are pairwise
  //     disjoint and together exhaust My Words.
  //   - New = My Books words that are not yet mastered / learning. New reaches
  //     zero the instant My Books is empty, regardless of any stale "new"
  //     cards a removed course left in the deck (those aren't part of My
  //     Books, so they don't count — and the cleanup in syncUserCourseWordsToSrs
  //     physically removes the orphaned rows).
  const levelStats = useMemo(() => {
    const stats: Record<
      string,
      {
        wordCount: number;
        curriculumTotal: number;
        learning: number;
        learned: number;
        new: number;
        myWords: number;
        /** Dictionary words not yet in the learner's deck (owner only). */
        remaining: number;
      }
    > = {};

    CEFR_LEVELS.forEach((lvl) => {
      const dictCount = levelDictionaryCounts[lvl] || 0;
      stats[lvl] = {
        wordCount: dictCount,
        curriculumTotal: dictCount,
        learning: 0,
        learned: 0,
        new: 0,
        myWords: 0,
        remaining: 0,
      };
    });

    // Per-word studied status from the FULL deck. Mastered/Learning tiles read
    // the global totals; New reads only how many *My Books* words are studied.
    const studiedByWord = new Map<string, "learned" | "learning">();
    for (const card of cards) {
      const w = (card.word || "").toLowerCase().trim();
      if (!w) continue;
      const lvl = normalizeLevel(card.cefrLevel);
      if (card.status === "learning") {
        studiedByWord.set(w, "learning");
        stats[lvl].learning++;
      } else if (
        card.status === "learned" ||
        card.status === "review" ||
        (card.repetitions && card.repetitions >= 3)
      ) {
        studiedByWord.set(w, "learned");
        stats[lvl].learned++;
      }
    }

    // Count My Words = M ∪ L ∪ My Books and split out New.
    //   - myWordsSets[lvl] = distinct words at that level in the union.
    //   - myStudiedByLevel[lvl] = how many of the OWNER's deck words are
    //     studied (only used for the owner's New = unpractised deck words).
    //   - newByLevel[lvl] = My Books words that are NOT yet mastered/learning
    //     (the student's New). A My Books word that is studied is folded into
    //     M/L and so is excluded from New but still counts toward My Words.
    const myStudiedByLevel: Record<string, number> = {};
    const newByLevel: Record<string, number> = {};
    const myWordsSets: Record<string, Set<string>> = {};
    CEFR_LEVELS.forEach((lvl) => {
      myStudiedByLevel[lvl] = 0;
      newByLevel[lvl] = 0;
      myWordsSets[lvl] = new Set<string>();
    });

    if (isAuthorAllWords) {
      // Owner: the whole deck is theirs, so My Words = every distinct deck word.
      const seen = new Set<string>();
      for (const card of cards) {
        const w = (card.word || "").toLowerCase().trim();
        if (!w || seen.has(w)) continue;
        seen.add(w);
        const lvl = normalizeLevel(card.cefrLevel);
        myWordsSets[lvl].add(w);
        if (studiedByWord.has(w)) myStudiedByLevel[lvl]++;
      }
    } else {
      // Student: start from My Books (libWords)…
      for (const lw of libWords || []) {
        const w = (lw.word || "").toLowerCase().trim();
        if (!w) continue;
        const lvl = normalizeLevel(lw.level);
        myWordsSets[lvl].add(w);
        if (studiedByWord.has(w)) myStudiedByLevel[lvl]++;
        else newByLevel[lvl]++; // My Books word not yet mastered/learning = New
      }
      // …then fold in every Mastered/Learning word from the FULL deck, even
      // ones whose source book was removed — they remain "my words".
      for (const card of cards) {
        const w = (card.word || "").toLowerCase().trim();
        if (!w || !studiedByWord.has(w)) continue;
        const lvl = normalizeLevel(card.cefrLevel);
        myWordsSets[lvl].add(w);
      }
    }

    CEFR_LEVELS.forEach((lvl) => {
      stats[lvl].myWords = myWordsSets[lvl].size;
      if (isAuthorAllWords) {
        // Owner has no separate "library" notion: New = unpractised deck words.
        stats[lvl].new = Math.max(0, stats[lvl].myWords - myStudiedByLevel[lvl]);
      } else {
        stats[lvl].new = newByLevel[lvl];
      }
      // Dictionary words the learner has not taken on yet (owner only).
      stats[lvl].remaining = Math.max(0, stats[lvl].wordCount - stats[lvl].myWords);
    });

    return stats;
  }, [cards, libWords, levelDictionaryCounts, isAuthorAllWords]);

  const totalLearning = useMemo(() => {
    return Object.values(levelStats).reduce((acc, curr) => acc + curr.learning, 0);
  }, [levelStats]);

  const totalLearned = useMemo(() => {
    return Object.values(levelStats).reduce((acc, curr) => acc + curr.learned, 0);
  }, [levelStats]);

  const totalNew = useMemo(() => {
    return Object.values(levelStats).reduce((acc, curr) => acc + curr.new, 0);
  }, [levelStats]);

  const totalMyWords = useMemo(() => {
    return Object.values(levelStats).reduce((acc, curr) => acc + curr.myWords, 0);
  }, [levelStats]);

  const totalWordCount = useMemo(() => {
    return Object.values(levelDictionaryCounts).reduce((acc, curr) => acc + curr, 0);
  }, [levelDictionaryCounts]);

  // Dictionary words the owner has not taken on yet: the whole dictionary
  // minus the words already in their deck.
  const totalRemaining = useMemo(() => {
    return Object.values(levelStats).reduce((acc, curr) => acc + curr.remaining, 0);
  }, [levelStats]);

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Top Header with Alan P / Student Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-lingo-text tracking-tight flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-lingo-blue" />
            Progress
          </h1>
          <p className="text-xs sm:text-sm text-lingo-text-light font-bold mt-0.5">
            Vocabulary Learning & Mastery Tracking
          </p>
        </div>

        {/* Alan P / Student Switcher (for Alan P only) */}
        {isAdmin && (
          <div className="flex items-center gap-1 p-1 bg-lingo-card border-2 border-lingo-border rounded-xl self-start sm:self-auto shadow-xs">
            <button
              onClick={() => setActiveTab("author")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === "author"
                  ? "bg-lingo-blue text-white shadow-xs"
                  : "text-lingo-text-light hover:text-lingo-text"
              }`}
            >
              <span className="text-xs">👤</span>
              Alan P
            </button>
            <button
              onClick={() => setActiveTab("inspector")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === "inspector"
                  ? "bg-lingo-purple text-white shadow-xs"
                  : "text-lingo-text-light hover:text-lingo-text"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Student
            </button>
          </div>
        )}
      </div>

      {isAdmin && activeTab === "inspector" ? (
        <StudentInspector />
      ) : (
        <div className="space-y-4">
          {/* Quick Stat Cards */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <div className="rounded-2xl border-2 border-lingo-border bg-white p-3 sm:p-4 shadow-xs">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-lingo-text-light block">
                My Words
              </span>
              <p className="text-xl sm:text-3xl font-black text-lingo-text mt-1">
                {totalMyWords.toLocaleString()}
              </p>
              <span className="text-[10px] text-lingo-text-light font-bold block mt-0.5">
                Mastered + Learning + New
              </span>
            </div>

            <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3 sm:p-4 shadow-xs">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-700 block">
                Mastered
              </span>
              <p className="text-xl sm:text-3xl font-black text-emerald-700 mt-1">
                {totalLearned.toLocaleString()}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                Mastered (≥3 correct)
              </span>
            </div>

            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-3 sm:p-4 shadow-xs">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-blue-700 block">
                Learning
              </span>
              <p className="text-xl sm:text-3xl font-black text-blue-700 mt-1">
                {totalLearning.toLocaleString()}
              </p>
              <span className="text-[10px] text-blue-600 font-bold block mt-0.5">
                In Practice
              </span>
            </div>
          </div>

          {/* ── PROGRESS TABLE (LEVEL, MY WORDS, LEARNED, LEARNING, [ACTION]) ── */}
          <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card overflow-hidden shadow-xs">
            <div className="px-4 py-3 border-b border-lingo-border flex items-center justify-between gap-2 bg-lingo-card/50">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-lingo-blue" />
                <h2 className="text-sm sm:text-base font-black text-lingo-text">
                  Progress
                </h2>
                {isAdmin && (
                  <span className="rounded-md bg-lingo-blue/10 px-2 py-0.5 text-[10px] font-black text-lingo-blue">
                    Alan P
                  </span>
                )}
              </div>

              {!isAdmin && (
                <span className="text-[11px] font-bold text-lingo-text-light hidden sm:inline">
                  Students add words by completing lessons & units
                </span>
              )}

              <button
                onClick={refreshSrs}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-lingo-blue/30 bg-lingo-blue/5 px-2.5 py-1 text-[11px] font-black text-lingo-blue hover:bg-lingo-blue/10 disabled:opacity-50 transition-colors"
                title="Fetch the latest SRS deck numbers from the server"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Fetching…" : "Refresh SRS Data"}
              </button>
            </div>

            {(refreshNote || refreshError) && (
              <div
                className={`px-4 py-2 text-[11px] font-bold ${
                  refreshError
                    ? "bg-lingo-red/5 text-lingo-red"
                    : "bg-lingo-blue/5 text-lingo-blue"
                }`}
              >
                {refreshError
                  ? `Refresh failed: ${refreshError}`
                  : refreshNote}
              </div>
            )}

            {/* 100% Fit Responsive Table */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm table-fixed">
                {isAdmin ? (
                  <colgroup>
                    <col className="w-[14%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                ) : (
                  <colgroup>
                    <col className="w-[22%]" />
                    <col className="w-[19%]" />
                    <col className="w-[19%]" />
                    <col className="w-[19%]" />
                    <col className="w-[21%]" />
                  </colgroup>
                )}
                <thead className="bg-lingo-gray/30 text-[10px] sm:text-xs font-black text-lingo-text-light uppercase tracking-wider border-b border-lingo-border">
                  <tr>
                    <th className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-left">Level</th>
                    <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-lingo-text">
                      <span className="hidden sm:inline">My Words</span>
                      <span className="sm:hidden">My Words</span>
                    </th>
                    <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center">
                      <span className="hidden sm:inline text-emerald-700">Mastered</span>
                      <span
                        className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white font-black text-[11px] shadow-xs"
                        title="Mastered (M)"
                      >
                        M
                      </span>
                    </th>
                    <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center">
                      <span className="hidden sm:inline text-blue-700">Learning</span>
                      <span
                        className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-black text-[11px] shadow-xs"
                        title="Learning (L)"
                      >
                        L
                      </span>
                    </th>
                    <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center">
                      <span className="hidden sm:inline text-lingo-text-light">New</span>
                      <span
                        className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white font-black text-[11px] shadow-xs"
                        title="New (N)"
                      >
                        N
                      </span>
                    </th>
                    {isAdmin && (
                      <>
                        <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-lingo-text-light">
                          <span className="hidden sm:inline">Remaining</span>
                          <span
                            className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-400 text-white font-black text-[11px] shadow-xs"
                            title="Remaining (R)"
                          >
                            R
                          </span>
                        </th>
                        <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-lingo-text-light">
                          <span className="hidden sm:inline">Dictionary</span>
                          <span className="sm:hidden text-[10px]">Dict</span>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-lingo-border">
                  {CEFR_LEVELS.map((lvl) => {
                    const stat = levelStats[lvl];
                    const isSelected = selectedLevel === lvl;
                    return (
                      <tr
                        key={lvl}
                        onClick={() => setSelectedLevel(isSelected ? "" : lvl)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-lingo-blue/10 hover:bg-lingo-blue/15"
                            : "hover:bg-lingo-gray/20"
                        }`}
                      >
                        {/* Level */}
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-block w-9 py-0.5 text-center rounded-md text-[11px] sm:text-xs font-black border ${LEVEL_BADGES[lvl]}`}
                            >
                              {lvl}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-black text-lingo-blue">
                                ●
                              </span>
                            )}
                          </div>
                        </td>
                        {/* My Words */}
                        <td className="py-2.5 px-2 text-center font-black text-lingo-text text-xs sm:text-sm whitespace-nowrap">
                          {stat.myWords.toLocaleString()}
                        </td>
                        {/* Learned */}
                        <td className="py-2.5 px-2 text-center font-black text-emerald-600 text-xs sm:text-sm whitespace-nowrap">
                          {stat.learned.toLocaleString()}
                        </td>
                        {/* Learning */}
                        <td className="py-2.5 px-2 text-center font-bold text-blue-600 text-xs sm:text-sm whitespace-nowrap">
                          {stat.learning.toLocaleString()}
                        </td>
                        {/* New */}
                        <td className="py-2.5 px-2 text-center font-medium text-lingo-text-light text-xs sm:text-sm whitespace-nowrap">
                          {stat.new.toLocaleString()}
                        </td>
                        {/* Remaining — dictionary words still untaken (owner only) */}
                        {isAdmin && (
                          <td className="py-2.5 px-2 text-center font-medium text-lingo-text-light text-xs sm:text-sm whitespace-nowrap">
                            {stat.remaining.toLocaleString()}
                          </td>
                        )}
                        {/* Dictionary — the master dictionary size (owner only) */}
                        {isAdmin && (
                          <td className="py-2.5 px-2 text-center font-medium text-lingo-text-light text-xs sm:text-sm whitespace-nowrap">
                            {stat.wordCount.toLocaleString()}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Summary TOTAL Row */}
                <tfoot className="bg-lingo-gray/40 border-t-2 border-lingo-border font-black">
                  <tr>
                    <td className="py-3 px-3.5 text-xs sm:text-sm font-black text-lingo-text uppercase tracking-wider">
                      TOTAL
                    </td>
                    <td className="py-3 px-2 text-center font-black text-lingo-text text-xs sm:text-sm whitespace-nowrap">
                      {totalMyWords.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-center font-black text-emerald-700 text-xs sm:text-sm whitespace-nowrap">
                      {totalLearned.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-center font-black text-blue-700 text-xs sm:text-sm whitespace-nowrap">
                      {totalLearning.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-center font-black text-lingo-text-light text-xs sm:text-sm whitespace-nowrap">
                      {totalNew.toLocaleString()}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-2 text-center font-black text-lingo-text-light text-xs sm:text-sm whitespace-nowrap">
                        {totalRemaining.toLocaleString()}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="py-3 px-2 text-center font-black text-lingo-text-light text-xs sm:text-sm whitespace-nowrap">
                        {totalWordCount.toLocaleString()}
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Word Status Process Flow Chart */}
          <WordStatusFlow
            dictionaryCount={totalWordCount}
            newCount={totalNew}
            learningCount={totalLearning}
            masteredCount={totalLearned}
            showDictionaryLegend={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
