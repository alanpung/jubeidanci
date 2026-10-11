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
}: ExerciseShellProps) {
  const justCheckedRef = useRef(false);

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
    <div className="flex flex-col min-h-[400px] pb-12 sm:pb-6">
      <div className="flex-1">{children}</div>

      {status === "answering" && (
        <div className="mt-6">
          <Button
            onClick={onCheck}
            disabled={!canCheck}
            className="w-full h-12 text-base font-bold"
          >
            Check
          </Button>
        </div>
      )}

      {status === "correct" && (
        <div className="mt-6">
          <div className="rounded-xl bg-green-50 border-2 border-lingo-green p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">&#10003;</span>
              <span className="font-bold text-lingo-green">Correct!</span>
            </div>
            {allAnswers && allAnswers.length > 0 && (
              <div className="mt-2 text-sm text-lingo-text border-t border-lingo-green/20 pt-2.5">
                <span className="font-bold text-lingo-green-dark text-xs uppercase tracking-wider block mb-1.5">
                  {allAnswers.length > 1
                    ? `Accepted Answers (Max ${Math.min(3, allAnswers.length)}):`
                    : "Accepted Answer:"}
                </span>
                <div className="space-y-1">
                  {allAnswers.slice(0, 3).map((ans, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm font-semibold text-lingo-text">
                      <span className="text-lingo-green font-bold select-none">{idx + 1}.</span>
                      <div>{language ? <HoverableText text={ans} language={language} /> : ans}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button onClick={onContinue} className="w-full h-12 text-base font-bold">
            Continue
          </Button>
        </div>
      )}

      {status === "incorrect" && (
        <div className="mt-6">
          <div className="rounded-xl bg-red-50 border-2 border-lingo-red p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">&#10007;</span>
              <span className="font-bold text-lingo-red">Incorrect</span>
            </div>
            {allAnswers && allAnswers.length > 0 ? (
              <div className="mt-2 text-sm text-lingo-text border-t border-lingo-red/20 pt-2.5">
                <span className="font-bold text-lingo-red text-xs uppercase tracking-wider block mb-1.5">
                  {allAnswers.length > 1
                    ? `All Possible Answers (Max ${Math.min(3, allAnswers.length)}):`
                    : "Correct Answer:"}
                </span>
                <div className="space-y-1">
                  {allAnswers.slice(0, 3).map((ans, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm font-semibold text-lingo-text">
                      <span className="text-lingo-red font-bold select-none">{idx + 1}.</span>
                      <div>{language ? <HoverableText text={ans} language={language} /> : ans}</div>
                    </div>
                  ))}
                </div>
                {correctedMarkdown && (
                  <div className="mt-2.5 text-xs text-lingo-text-light bg-white/70 rounded-lg p-2 border border-lingo-red/10">
                    <span className="font-semibold text-lingo-text">Best match comparison:</span>{" "}
                    <Markdown>{correctedMarkdown}</Markdown>
                  </div>
                )}
              </div>
            ) : correctAnswer && (
              <div className="mt-1 text-sm text-lingo-text">
                Correct answer:{" "}
                {correctedMarkdown ? (
                  <Markdown>{correctedMarkdown}</Markdown>
                ) : (
                  <strong>{language ? <HoverableText text={correctAnswer} language={language} /> : correctAnswer}</strong>
                )}
              </div>
            )}
          </div>
          <Button variant="danger" onClick={onContinue} className="w-full h-12 text-base font-bold">
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
