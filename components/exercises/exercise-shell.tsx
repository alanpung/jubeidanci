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
  /** Hide the Check button (e.g. Translation free-nav mode, where arrows/swipe
   *  take its place and the button would only waste mobile vertical space). */
  hideCheck?: boolean;
  /** Hide the Continue button — used together with hideCheck for nav-only UIs. */
  hideContinue?: boolean;
  /** Swipe-left action. Defaults to onContinue so existing exercises keep their
   *  "swipe to advance" behaviour untouched. */
  onSwipeLeft?: () => void;
  /** Swipe-right action (e.g. go to the previous question). */
  onSwipeRight?: () => void;
  /** Allow swipe navigation even while the user is still answering — Translation
   *  uses this so questions can be flipped through without a Check gate. */
  freeNav?: boolean;
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
  hideCheck = false,
  hideContinue = false,
  onSwipeLeft,
  onSwipeRight,
  freeNav = false,
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

  // Swipe anywhere on the exercise: left = next, right = previous. Guarded out
  // of the answering state by default (so a stray drag while typing can't skip
  // the exercise), unless `freeNav` is set — Translation flips through cards
  // without a Check gate, so it opts in to swiping in any state.
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
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
      const canSwipe = freeNav || status !== "answering";
      if (!horizontal || !canSwipe) return;
      if (dx < -50) {
        (onSwipeLeft ?? onContinue)();
      } else if (dx > 50) {
        onSwipeRight?.();
      }
    },
    [status, freeNav, onSwipeLeft, onSwipeRight, onContinue],
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
      // Don't steal arrow keys while the user is typing in an input/textarea.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;

      // Arrow keys → same as swipe / on-screen arrows (when freeNav or after check).
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const canNav = freeNav || status !== "answering";
        if (!canNav) return;
        // While the user is typing in a field, leave arrow keys to the field
        // itself (e.g. moving between per-word boxes in the translation
        // exercise, or normal cursor movement). Never navigate questions.
        if (typing) return;
        e.preventDefault();
        if (e.key === "ArrowRight") {
          (onSwipeLeft ?? onContinue)(); // right arrow = next (same as swipe left on mobile metaphor…)
          // Actually: UI chevron RIGHT = next. Keyboard Right should = next.
          // Swipe LEFT = next (finger moves left to reveal next card).
          // So ArrowRight → next = onSwipeLeft ?? onContinue
          // ArrowLeft → prev = onSwipeRight
        } else {
          onSwipeRight?.();
        }
        return;
      }

      if (e.key !== "Enter") return;
      if (status === "answering" && canCheck && !hideCheck) {
        e.preventDefault();
        onCheck();
      } else if (
        (status === "correct" || status === "incorrect") &&
        !justCheckedRef.current &&
        !hideContinue
      ) {
        e.preventDefault();
        onContinue();
      }
    },
    [
      status,
      canCheck,
      hideCheck,
      hideContinue,
      freeNav,
      onCheck,
      onContinue,
      onSwipeLeft,
      onSwipeRight,
    ],
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

      {status === "answering" && !hideCheck && (
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

      {(status === "correct" || status === "incorrect") && !hideContinue && (
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
                          matchedWordIndices &&
                          matchedWordIndices[wIdx] !== undefined
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
                        (
                          correctAnswer ||
                          (allAnswers && allAnswers[0]) ||
                          ""
                        )
                          .toLowerCase()
                          .trim(),
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
                                (
                                  correctAnswer ||
                                  (allAnswers && allAnswers[0]) ||
                                  ""
                                )
                                  .toLowerCase()
                                  .trim(),
                            )
                            .map((other, oIdx) => (
                              <div
                                key={oIdx}
                                className="text-gray-800 font-medium text-sm"
                              >
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
                    <span className="text-2xl">
                      {status === "correct" ? "✓" : "✗"}
                    </span>
                    <span
                      className={`font-bold ${
                        status === "correct"
                          ? "text-lingo-green"
                          : "text-lingo-red"
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
              variant={
                status === "correct"
                  ? ("primary" as const)
                  : ("danger" as const)
              }
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
