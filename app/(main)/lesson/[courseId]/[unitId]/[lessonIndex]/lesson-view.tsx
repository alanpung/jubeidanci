"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitLesson, Exercise } from "@/lib/content/types";
import { exerciseSchema } from "@/lib/content/exercise-schema";
import { useLesson } from "@/hooks/use-lesson";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
  /** Total lessons in this unit — decides whether "Next lesson" is offered. */
  totalLessons?: number;
  /** Title of the following lesson, shown as a hint on the completion screen. */
  nextLessonTitle?: string | null;
  lesson: UnitLesson;
  lessonTitle: string;
  unitTitle: string;
  targetLanguage: string;
  /** Course name for the breadcrumb; omitted for standalone units. */
  courseTitle?: string | null;
}

export function LessonView({
  courseId,
  unitId,
  lessonIndex,
  totalLessons,
  nextLessonTitle,
  lesson,
  lessonTitle,
  unitTitle,
  targetLanguage,
  courseTitle,
}: LessonViewProps) {
  const router = useRouter();
  const [showComplete, setShowComplete] = useState(false);
  // Only perfectScore is rendered on the completion screen; the SRS word
  // counters come back from the background action but are intentionally not
  // shown here (see LessonCompleteModal).
  const [lessonResult, setLessonResult] = useState<{
    perfectScore: boolean;
  } | null>(null);

  const [backUrl, setBackUrl] = useState<string>(() => {
    if (courseId) return `/library/${courseId}?unit=${unitId}`;
    return `/unit/${unitId}`;
  });

  // Authored unit titles normally start with their own label ("Unit 3: Food
  // & Dining"), so reuse it instead of inventing a second "Unit N:".
  const unitLabel = /unit\s*\d+/i.test(unitTitle)
    ? (unitTitle.match(/unit\s*\d+/i)?.[0] ?? "Unit").replace(/\s+/g, " ")
    : "Unit";

  const lessonLabel = `Lesson ${lessonIndex + 1}`;

  // Authored lesson titles often repeat their own label ("Lesson 1: Everyday
  // Essentials"), and the breadcrumb already says "Lesson 1" — so drop the
  // prefix and show only the actual title, on one line.
  const lessonHeading =
    lessonTitle.replace(/^\s*lesson\s*\d+\s*:?\s*/i, "").trim() || lessonTitle;

  // Directory-style path bar. Everything above the current page is a link, so
  // no separate back button is needed anywhere.
  const crumbs = [
    { label: "Library", href: "/library" },
    ...(courseId
      ? [
          {
            // Back to the course's unit list, not the current unit — the crumb
            // after it already points at the unit itself.
            label: courseTitle ?? "Course",
            href: `/library/${courseId}`,
          },
          { label: unitLabel, href: backUrl },
        ]
      : [{ label: unitLabel, href: `/unit/${unitId}` }]),
    { label: lessonLabel },
  ];

  // The "Next lesson" action only exists when this isn't the last lesson.
  const nextIndex = lessonIndex + 1;
  const hasNextLesson =
    typeof totalLessons === "number" && nextIndex < totalLessons;
  const nextUrl = courseId
    ? `/lesson/${courseId}/${unitId}/${nextIndex}`
    : `/unit/${unitId}/lesson/${nextIndex}`;

  // Warm the next lesson so the button is instant.
  useEffect(() => {
    if (hasNextLesson) router.prefetch(nextUrl);
  }, [hasNextLesson, nextUrl, router]);

  useEffect(() => {
    if (typeof window !== "undefined" && courseId) {
      if (document.referrer.includes("/units/")) {
        setBackUrl(`/units/${courseId}?unit=${unitId}`);
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
    goTo,
    canGoBack,
    direction,
  } = useLesson(lesson.exercises);

  const progress = ((currentIndex) / totalExercises) * 100;

  function handleResult(correct: boolean, answer: string, score?: number) {
    recordResult(correct, answer, score);
  }

  function handleContinue() {
    advance();
  }

  function handlePrev() {
    goTo(currentIndex - 1);
  }

  function handleReturn() {
    router.replace(backUrl);
  }

  function handleNextLesson() {
    router.push(nextUrl);
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
          score: r.score,
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
        onNextLesson={hasNextLesson ? handleNextLesson : null}
        nextLessonTitle={hasNextLesson ? (nextLessonTitle ?? "") : undefined}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 sm:px-8 py-6">
      {/* Header — directory style: Library / Course / Unit N / Lesson N.
          No extra back button: every level above is clickable. */}
      <Breadcrumb items={crumbs} className="mb-4" />

      <div className="mb-6 flex items-center gap-4">
        <ProgressBar value={progress} className="flex-1" />
      </div>

      {/* The lesson name only — same size as the breadcrumb above it, and one
          line: the breadcrumb already carries "Lesson N", so this must not
          repeat it or push the exercise further down the screen. */}
      <h1
        className="mb-4 truncate text-sm font-bold text-lingo-text"
        title={lessonHeading}
      >
        <HoverableText text={lessonHeading} language={targetLanguage} />
      </h1>

      {/* Exercise */}
      {!isComplete && (
        <ExerciseRenderer
          key={currentIndex}
          exercise={currentExercise}
          onResult={handleResult}
          onContinue={handleContinue}
          onPrev={handlePrev}
          canGoPrev={canGoBack}
          exerciseIndex={currentIndex}
          totalExercises={totalExercises}
          direction={direction}
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
  onPrev,
  canGoPrev,
  exerciseIndex,
  totalExercises,
  direction,
  language,
}: {
  exercise: Exercise;
  onResult: (correct: boolean, answer: string, score?: number) => void;
  onContinue: () => void;
  onPrev?: () => void;
  canGoPrev?: boolean;
  exerciseIndex?: number;
  totalExercises?: number;
  direction?: "forward" | "backward" | null;
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
          onPrev={onPrev ?? (() => {})}
          canGoPrev={canGoPrev ?? false}
          exerciseIndex={exerciseIndex ?? 0}
          totalExercises={totalExercises ?? 1}
          direction={direction ?? null}
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
  onResult: (correct: boolean, answer: string, score?: number) => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    onResult(true, "[skipped]");
    onContinue();
  }, [onResult, onContinue]);
  return null;
}
