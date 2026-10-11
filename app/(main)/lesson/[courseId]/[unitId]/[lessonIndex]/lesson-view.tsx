"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitLesson, Exercise } from "@/lib/content/types";
import { exerciseSchema } from "@/lib/content/exercise-schema";
import { useLesson } from "@/hooks/use-lesson";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MultipleChoice } from "@/components/exercises/multiple-choice";
import { Translation } from "@/components/exercises/translation";
import { FillInTheBlank } from "@/components/exercises/fill-in-the-blank";
import { MatchingPairs } from "@/components/exercises/matching-pairs";
import { Listening } from "@/components/exercises/listening";
import { WordBank } from "@/components/exercises/word-bank";
import { Speaking } from "@/components/exercises/speaking";
import { FreeText } from "@/components/exercises/free-text";
import { FlashcardReview } from "@/components/exercises/flashcard-review";
import { HoverableText } from "@/components/word/hoverable-text";
import { LessonCompleteModal } from "@/components/gamification/lesson-complete-modal";
import { completeLesson } from "@/lib/actions/lesson";

interface LessonViewProps {
  courseId?: string | null;
  unitId: string;
  lessonIndex: number;
  lesson: UnitLesson;
  lessonTitle: string;
  unitTitle: string;
  targetLanguage: string;
}

export function LessonView({
  courseId,
  unitId,
  lessonIndex,
  lesson,
  lessonTitle,
  unitTitle,
  targetLanguage,
}: LessonViewProps) {
  const router = useRouter();
  const [showComplete, setShowComplete] = useState(false);
  const [lessonResult, setLessonResult] = useState<{
    perfectScore: boolean;
  } | null>(null);

  const [backUrl, setBackUrl] = useState<string>(() => {
    if (courseId) return `/units/${courseId}?unit=${unitId}`;
    return `/unit/${unitId}`;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && courseId) {
      if (document.referrer.includes("/library/")) {
        setBackUrl(`/library/${courseId}?unit=${unitId}`);
      }
    }
  }, [courseId, unitId]);

  // Pre-fetch return URLs immediately so navigation on completion is instant
  useEffect(() => {
    if (courseId) {
      router.prefetch(`/units/${courseId}?unit=${unitId}`);
      router.prefetch(`/library/${courseId}?unit=${unitId}`);
    } else {
      router.prefetch(`/unit/${unitId}`);
    }
  }, [courseId, unitId, router]);

  const {
    currentIndex,
    totalExercises,
    currentExercise,
    results,
    isComplete,
    mistakeCount,
    recordResult,
    advance,
  } = useLesson(lesson.exercises);

  const progress = ((currentIndex) / totalExercises) * 100;

  function handleResult(correct: boolean, answer: string) {
    recordResult(correct, answer);
  }

  function handleContinue() {
    advance();
  }

  function handleReturn() {
    router.replace(backUrl);
  }

  // When lesson completes, trigger UI instantly & submit results in background
  useEffect(() => {
    if (isComplete && !showComplete) {
      // 1. Show celebration screen IMMEDIATELY (0ms latency)
      setShowComplete(true);
      setLessonResult({ perfectScore: mistakeCount === 0 });

      // 2. Persist lesson completion asynchronously in background without blocking UI
      completeLesson({
        unitId,
        lessonIndex,
        results: results.map((r) => ({
          exerciseIndex: r.exerciseIndex,
          exerciseType: r.exerciseType,
          correct: r.correct,
          userAnswer: r.userAnswer,
        })),
        mistakeCount,
      })
        .then((result) => {
          if (result) setLessonResult(result);
        })
        .catch((err) => {
          console.error("Failed to persist lesson completion:", err);
        });
    }
  }, [isComplete, showComplete, unitId, lessonIndex, results, mistakeCount]);

  if (showComplete) {
    return (
      <LessonCompleteModal
        perfectScore={lessonResult?.perfectScore ?? mistakeCount === 0}
        totalExercises={totalExercises}
        mistakeCount={mistakeCount}
        onContinue={handleReturn}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.push(backUrl)}
          className="text-lingo-text-light hover:text-lingo-text"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <ProgressBar value={progress} className="flex-1" />
      </div>

      <p className="text-sm text-lingo-text-light mb-1"><HoverableText text={unitTitle} language={targetLanguage} /></p>
      <h1 className="text-xl font-bold text-lingo-text mb-6"><HoverableText text={lessonTitle} language={targetLanguage} /></h1>

      {/* Exercise */}
      {!isComplete && (
        <ExerciseRenderer
          key={currentIndex}
          exercise={currentExercise}
          onResult={handleResult}
          onContinue={handleContinue}
          language={targetLanguage}
        />
      )}

      {isComplete && !showComplete && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-lingo-green border-t-transparent" />
        </div>
      )}
    </div>
  );
}

function ExerciseRenderer({
  exercise,
  onResult,
  onContinue,
  language,
}: {
  exercise: Exercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  language: string;
}) {
  const parsed = exerciseSchema.safeParse(exercise);
  if (!parsed.success) {
    console.warn("Skipping invalid exercise:", parsed.error.flatten(), exercise);
    return <SkipInvalid onResult={onResult} onContinue={onContinue} />;
  }

  const ex = parsed.data;
  switch (ex.type) {
    case "multiple-choice":
      return (
        <MultipleChoice
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "translation":
      return (
        <Translation
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "fill-in-the-blank":
      return (
        <FillInTheBlank
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "matching-pairs":
      return (
        <MatchingPairs
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "listening":
      return (
        <Listening
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "word-bank":
      return (
        <WordBank
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "speaking":
      return (
        <Speaking
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "free-text":
      return (
        <FreeText
          exercise={ex}
          onResult={onResult}
          onContinue={onContinue}
          language={language}
        />
      );
    case "flashcard-review":
      return (
        <FlashcardReview
          exercise={ex}
          language={language}
          onResult={onResult}
          onContinue={onContinue}
        />
      );
  }
}

/** Auto-skips an invalid exercise so it doesn't block lesson progress. */
function SkipInvalid({
  onResult,
  onContinue,
}: {
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    onResult(true, "[skipped]");
    onContinue();
  }, [onResult, onContinue]);
  return null;
}
