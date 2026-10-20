"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { BookOpen, Target, Award, Loader2 } from "lucide-react";

interface LessonCompleteModalProps {
  perfectScore: boolean;
  totalExercises?: number;
  mistakeCount?: number;
  wordsLearned?: number;
  wordsMastered?: number;
  wordsPracticed?: number;
  /** Absolute count of distinct words that are now in the learner's active
   *  vocabulary (learning or mastered) as a result of this lesson. Computed
   *  server-side so it never collapses to a misleading 0 just because the
   *  words were already past "new". */
  wordsAdded?: number;
  onContinue: () => void;
}

export function LessonCompleteModal({
  perfectScore,
  totalExercises = 5,
  mistakeCount = 0,
  wordsLearned = 0,
  wordsMastered = 0,
  wordsPracticed = 0,
  wordsAdded,
  onContinue,
}: LessonCompleteModalProps) {
  const [isNavigating, setIsNavigating] = useState(false);

  const accuracy = totalExercises > 0
    ? Math.max(0, Math.round(((totalExercises - mistakeCount) / totalExercises) * 100))
    : 100;

  // Prefer the server-computed absolute count (distinct words now active) so a
  // lesson of already-learning words still reports a meaningful number. Fall
  // back to the delta sum only if the server value is unavailable.
  const addedCount =
    typeof wordsAdded === "number" && wordsAdded > 0
      ? wordsAdded
      : wordsLearned + wordsMastered;
  const breakdown =
    wordsLearned > 0 && wordsMastered > 0
      ? `${wordsLearned} new · ${wordsMastered} mastered`
      : wordsMastered > 0
        ? `${wordsMastered} mastered`
        : wordsLearned > 0
          ? `${wordsLearned} new in learning`
          : wordsPracticed > 0
            ? `${wordsPracticed} reviewed`
            : "no words recorded";

  function handleContinue() {
    if (isNavigating) return;
    setIsNavigating(true);
    onContinue();
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleContinue();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleContinue]);

  return (
    <div className="mx-auto max-w-md py-8 px-4 text-center select-none">
      <motion.div
        initial={{ scale: 0.82, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-3xl border-2 border-lingo-border bg-white p-6 sm:p-8 shadow-lg"
      >
        {/* Floating Sparkle Particles */}
        <div className="absolute -top-4 -left-3 text-2xl animate-bounce">
          ✨
        </div>
        <div className="absolute -top-5 -right-2 text-2xl animate-bounce [animation-delay:200ms]">
          🎉
        </div>

        {/* Hero Badge */}
        <motion.div
          initial={{ scale: 0.5, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.05 }}
          className="mb-4 inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/60 shadow-xs"
        >
          <span className="text-6xl">{perfectScore ? "🏆" : "🎉"}</span>
        </motion.div>

        <h1 className="text-2xl sm:text-3xl font-black text-lingo-text mb-1">
          {perfectScore ? "Perfect Lesson!" : "Lesson Complete!"}
        </h1>

        <p className="text-xs sm:text-sm font-bold text-lingo-text-light mb-6">
          {perfectScore
            ? "Flawless performance — zero mistakes!"
            : "Great job! You completed all exercises."}
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Words Added Card */}
          <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/80 p-3 flex flex-col items-center justify-center text-sky-900 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-200">
            <div className="flex items-center gap-1 mb-0.5">
              <BookOpen className="w-4 h-4 text-sky-500" />
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">
                Words Added
              </span>
            </div>
            <span className="text-xl sm:text-2xl font-black">{addedCount}</span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-sky-700/80 dark:text-sky-300/80 mt-0.5 text-center leading-tight">
              {breakdown}
            </span>
          </div>

          {/* Accuracy Card */}
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/80 p-3 flex flex-col items-center justify-center text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200">
            <div className="flex items-center gap-1 mb-0.5">
              <Target className="w-4 h-4 text-emerald-500" />
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Accuracy
              </span>
            </div>
            <span className="text-xl sm:text-2xl font-black">{accuracy}%</span>
          </div>
        </div>

        {perfectScore && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl bg-amber-100/90 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 px-4 py-2 text-xs font-black text-amber-900 dark:text-amber-200">
            <Award className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Perfect score — flawless run!</span>
          </div>
        )}

        {/* Continue Action */}
        <Button
          onClick={handleContinue}
          disabled={isNavigating}
          className="w-full h-12 text-base font-black uppercase tracking-wide bg-lingo-green hover:bg-lingo-green-dark border-b-4 border-lingo-green-dark active:border-b-0 active:translate-y-[2px] transition-all rounded-2xl cursor-pointer disabled:opacity-80 flex items-center justify-center gap-2"
        >
          {isNavigating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </motion.div>
    </div>
  );
}

