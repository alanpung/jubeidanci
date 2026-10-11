"use client";

import { useState, useMemo, useEffect } from "react";
import {
  TrendingUp,
  GraduationCap,
  Users,
  Sparkles,
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
  language = "en",
  levelDictionaryCounts = { A1: 1000, A2: 1555, B1: 4610, B2: 8760, C1: 5127, C2: 1275 },
}: {
  isAdmin?: boolean;
  isAuthorAllWords?: boolean;
  srsCards?: SrsCard[];
  language?: string;
  levelDictionaryCounts?: Record<string, number>;
}) {
  const [activeTab, setActiveTab] = useState<"author" | "inspector">("author");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [cards, setCards] = useState<SrsCard[]>(srsCards);

  // Sync with server cards
  useEffect(() => {
    setCards(srsCards || []);
  }, [srsCards]);

  // Compute level statistics live based on libraryWords and cards
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
      };
    });

    cards.forEach((card) => {
      if (!card.word) return;
      const lvl = (card.cefrLevel || "A1").toUpperCase().trim();
      const targetLvl = CEFR_LEVELS.includes(lvl as (typeof CEFR_LEVELS)[number]) ? lvl : "A1";

      if (card.status === "learned" || card.status === "review" || (card.repetitions && card.repetitions >= 3)) {
        stats[targetLvl].learned++;
      } else if (card.status === "learning") {
        stats[targetLvl].learning++;
      } else if (card.status === "new") {
        stats[targetLvl].new++;
      }
    });

    CEFR_LEVELS.forEach((lvl) => {
      stats[lvl].myWords = stats[lvl].learned + stats[lvl].learning + stats[lvl].new;
    });

    return stats;
  }, [cards, levelDictionaryCounts, isAuthorAllWords]);

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
            </div>

            {/* 100% Fit Responsive Table */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm table-fixed">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[17%]" />
                  <col className="w-[17%]" />
                  <col className="w-[17%]" />
                  <col className="w-[16%]" />
                  <col className="w-[17%]" />
                </colgroup>
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
                    <th className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-lingo-text-light">
                      <span className="hidden sm:inline">Word Count</span>
                      <span className="sm:hidden text-[10px]">Total</span>
                    </th>
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
                        {/* Word Count */}
                        <td className="py-2.5 px-2 text-center font-medium text-lingo-text-light/80 text-xs sm:text-sm whitespace-nowrap">
                          {stat.wordCount.toLocaleString()}
                        </td>
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
                    <td className="py-3 px-2 text-center font-black text-lingo-text-light/90 text-xs sm:text-sm whitespace-nowrap">
                      {totalWordCount.toLocaleString()}
                    </td>
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
          />
        </div>
      )}
    </div>
  );
}
