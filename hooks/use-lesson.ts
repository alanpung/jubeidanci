"use client";

import { useState, useCallback, useMemo } from "react";
import type { Exercise } from "@/lib/content/types";

interface ExerciseResult {
  exerciseIndex: number;
  exerciseType: string;
  correct: boolean;
  userAnswer: string;
  /** Translation-exercise score (0–100). Undefined for non-scored exercises. */
  score?: number;
}

interface UseLessonReturn {
  currentIndex: number;
  totalExercises: number;
  currentExercise: Exercise;
  results: ExerciseResult[];
  isComplete: boolean;
  mistakeCount: number;
  /** Per-exercise "has been revealed/graded" flags, keyed by index — lets the
   *  Translation free-navigation mode remember which cards were already opened
   *  so swiping back shows the answer instead of a blank input. */
  revealed: boolean[];
  recordResult: (correct: boolean, userAnswer: string, score?: number) => void;
  revealCurrent: () => void;
  advance: () => void;
  /** Jump to an absolute exercise index; out-of-range (>= length) finishes. */
  goTo: (index: number) => void;
  canGoBack: boolean;
  /** Last navigation direction — drives the slide-in animation on the exercise
   *  card (forward = enter from the right, backward = enter from the left). */
  direction: "forward" | "backward" | null;
}

export function useLesson(exercises: Exercise[]): UseLessonReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    exercises.map(() => false),
  );
  const [isComplete, setIsComplete] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward" | null>(null);

  const currentExercise = exercises[currentIndex];

  // Idempotent by exercise index: re-grading the same card (e.g. when the user
  // swipes back and forwards again) replaces the prior entry instead of
  // stacking duplicates — this is what keeps mistakeCount honest.
  const recordResult = useCallback(
    (correct: boolean, userAnswer: string, score?: number) => {
      setResults((prev) => {
        const entry: ExerciseResult = {
          exerciseIndex: currentIndex,
          exerciseType: exercises[currentIndex]?.type ?? "",
          correct,
          userAnswer,
          score,
        };
        const existing = prev.findIndex((r) => r.exerciseIndex === currentIndex);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = entry;
          return next;
        }
        return [...prev, entry];
      });
    },
    [currentIndex, exercises],
  );

  const revealCurrent = useCallback(() => {
    setRevealed((prev) => {
      if (prev[currentIndex]) return prev;
      const next = [...prev];
      next[currentIndex] = true;
      return next;
    });
  }, [currentIndex]);

  // Derived, so it always reflects the idempotent results array.
  const mistakeCount = useMemo(
    () => results.filter((r) => !r.correct).length,
    [results],
  );

  const advance = useCallback(() => {
    setDirection("forward");
    if (currentIndex + 1 >= exercises.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, exercises.length]);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(exercises.length, index));
      if (clamped >= exercises.length) {
        setDirection("forward");
        setIsComplete(true);
      } else {
        setDirection(clamped > currentIndex ? "forward" : "backward");
        setCurrentIndex(clamped);
      }
    },
    [exercises.length, currentIndex],
  );

  const canGoBack = currentIndex > 0;

  return {
    currentIndex,
    totalExercises: exercises.length,
    currentExercise,
    results,
    isComplete,
    mistakeCount,
    revealed,
    recordResult,
    revealCurrent,
    advance,
    goTo,
    canGoBack,
    direction,
  };
}
