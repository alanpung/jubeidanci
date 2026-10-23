"use client";

import { useEffect, useCallback, useRef } from "react";
import type { ExerciseStatus } from "@/hooks/use-exercise";
import { Button } from "@/components/ui/button";
import { HoverableText } from "@/components/word/hoverable-text";
import Markdown from "react-markdown";

interface ExerciseShellProps {
  children: React.ReactNode;
  status: ExerciseStatus;
  onCheck: () => void;
  onContinue: () => void;
  canCheck: boolean;
  correctAnswer?: string;
  allAnswers?: string[];
  /** Correct answer with **bold** markers on differing chars */
  correctedMarkdown?: string;
  language?: string;
  similarityScore?: number | null;
  similarityDetail?: string;
  inputWords?: string[];
  matchedWordIndices?: boolean[];
  /** Hide the red/green "Correct/Incorrect + Correct answer" box that
   *  normally appears below the children when the user checks. Used by
   *  exercises (e.g. Translation) that render their own feedback panel. */
  hideBottomFeedback?: boolean;
}

export function ExerciseShell({
  children,
  status,
  onCheck,
  onContinue,
  canCheck,
  correctAnswer,
  allAnswers,
  correctedMarkdown,
  language,
  similarityScore,
  similarityDetail,
  inputWords,
  matchedWordIndices,
  hideBottomFeedback = false,
}: ExerciseShellProps) {
  const justCheckedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Swipe-left anywhere on the exercise advances to the next question. Guarded
  // to the result state so a stray drag while typing can't skip the exercise.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5 && status !== "answering") {
        onContinue();
      }
    },
    [status, onContinue]
  );

  // When status changes away from "answering", mark that we just checked
  // and clear the flag after a short delay to allow the user to see feedback
  useEffect(() => {
    if (status === "correct" || status === "incorrect") {
      justCheckedRef.current = true;
      const timer = setTimeout(() => {
        justCheckedRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (status === "answering" && canCheck) {
        e.preventDefault();
        onCheck();
      } else if ((status === "correct" || status === "incorrect") && !justCheckedRef.current) {
        e.preventDefault();
        onContinue();
      }
    },
    [status, canCheck, onCheck, onContinue]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="flex flex-col min-h-[400px] pb-12 sm:pb-6"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex-1">{children}</div>

      {status === "answering" && (
        <div className="mt-8 flex justify-center">
          <Button
            onClick={onCheck}
            disabled={!canCheck}
            className="w-48 sm:w-64 h-12 text-base font-bold shadow-md"
          >
            Check
          </Button>
        </div>
      )}

      {(status === "correct" || status === "incorrect") && (
        <div className="mt-6">
          {!hideBottomFeedback && (
            <div
              className={`rounded-2xl border-2 p-5 mb-4 ${
                status === "correct"
                  ? "bg-green-50/80 border-lingo-green"
                  : "bg-red-50/80 border-lingo-red"
              }`}
            >
              {inputWords && inputWords.length > 0 ? (
                <div className="space-y-3 font-sans">
                  {/* My input */}
                  <div className="flex items-baseline gap-3 text-base">
                    <span className="font-bold text-gray-800 w-24 shrink-0 text-left">
                      My input:
                    </span>
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      {inputWords.map((word, wIdx) => {
                        const isMatched =
                          matchedWordIndices && matchedWordIndices[wIdx] !== undefined
                            ? matchedWordIndices[wIdx]
                            : status === "correct";
                        return (
                          <span
                            key={wIdx}
                            className={
                              isMatched
                                ? "text-emerald-600 font-semibold"
                                : "text-red-600 font-bold underline decoration-wavy decoration-red-500"
                            }
                          >
                            {word}
                          </span>
                        );
                      })}
                      {typeof similarityScore === "number" && (
                        <span className="text-emerald-600 font-bold ml-1">
                          ({Math.round(similarityScore * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Answer */}
                  <div className="flex items-baseline gap-3 text-base">
                    <span className="font-bold text-gray-800 w-24 shrink-0 text-left">
                      Answer:
                    </span>
                    <span className="font-semibold text-gray-900">
                      {correctAnswer || (allAnswers && allAnswers[0]) || ""}
                    </span>
                  </div>

                  {/* Other answers */}
                  {allAnswers &&
                    allAnswers.filter(
                      (a) =>
                        a.toLowerCase().trim() !==
                        (correctAnswer || (allAnswers && allAnswers[0]) || "").toLowerCase().trim()
                    ).length > 0 && (
                      <div className="pt-3 border-t border-gray-200/70 mt-3">
                        <span className="block font-bold text-gray-800 mb-1 text-sm">
                          Other answers:
                        </span>
                        <div className="space-y-1">
                          {allAnswers
                            .filter(
                              (a) =>
                                a.toLowerCase().trim() !==
                                (correctAnswer || (allAnswers && allAnswers[0]) || "").toLowerCase().trim()
                            )
                            .map((other, oIdx) => (
                              <div key={oIdx} className="text-gray-800 font-medium text-sm">
                                {other}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-2xl">{status === "correct" ? "✓" : "✗"}</span>
                    <span
                      className={`font-bold ${
                        status === "correct" ? "text-lingo-green" : "text-lingo-red"
                      }`}
                    >
                      {status === "correct" ? "Correct!" : "Incorrect"}
                    </span>
                  </div>
                  {correctAnswer && (
                    <div className="mt-1 text-sm text-lingo-text">
                      Correct answer: <strong>{correctAnswer}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-center">
            <Button
              onClick={onContinue}
              variant={status === "correct" ? ("primary" as const) : ("danger" as const)}
              className="w-48 sm:w-64 h-12 text-base font-bold shadow-md"
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
