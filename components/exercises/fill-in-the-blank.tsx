"use client";

import { useState, useEffect, useMemo } from "react";
import type { FillInTheBlankExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { checkBestMatch } from "@/lib/similarity";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { AudioSpinner } from "@/components/audio-spinner";
import { ReplayButton } from "@/components/replay-button";

interface Props {
  exercise: FillInTheBlankExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  language: string;
  autoplayAudio?: boolean;
}

export function FillInTheBlank({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const [input, setInput] = useState("");
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch, loading: audioLoading } = useAudio();

  // Combine primary blank and acceptAlso, deduplicate, and limit to maximum 3 answers
  const allAnswers = useMemo(() => {
    const rawList = [exercise.blank, ...(exercise.acceptAlso || [])];
    const list: string[] = [];
    for (const item of rawList) {
      if (!item) continue;
      const trimmed = item.trim();
      if (trimmed && !list.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        list.push(trimmed);
      }
      if (list.length >= 3) break; // Limit to maximum 3 answers
    }
    return list.length > 0 ? list : [exercise.blank];
  }, [exercise.blank, exercise.acceptAlso]);

  const blankSentence = useMemo(() => exercise.sentence.replace("___", " "), [exercise.sentence]);

  useEffect(() => {
    prefetch([blankSentence], language);
  }, [blankSentence, language, prefetch]);

  useEffect(() => {
    if (autoplayAudio && !exercise.noAudio?.includes("sentence"))
      play(blankSentence, language);
    return stop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCheck() {
    const trimmed = input.trim();
    const result = checkBestMatch(trimmed, allAnswers);
    setSimilarityScore(result.similarity);
    if (!result.isCorrect) setCorrectedMarkdown(result.correctedMarkdown);
    checkAnswer(result.isCorrect);
    onResult(result.isCorrect, trimmed);
  }

  const parts = exercise.sentence.split("___");

  return (
    <ExerciseShell
      status={status}
      onCheck={handleCheck}
      onContinue={onContinue}
      canCheck={input.trim().length > 0}
      correctAnswer={exercise.blank}
      allAnswers={allAnswers}
      correctedMarkdown={correctedMarkdown}
      language={language}
      similarityScore={similarityScore}
      inputWords={[input]}
    >
      <div className="flex items-start gap-2 mb-6">
        <h2 className="text-xl font-bold text-lingo-text">
          Fill in the blank
        </h2>
        {!exercise.noAudio?.includes("sentence") && (
          <ReplayButton onPlay={() => play(blankSentence, language)} />
        )}
      </div>
      <AudioSpinner loading={audioLoading} />
      <div className="flex flex-wrap items-center gap-2 text-2xl font-bold text-lingo-text mb-6">
        <HoverableText text={parts[0]} language={language} noAudio={exercise.noAudio?.includes("sentence")} />
          {status === "answering" ? (
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim() && status === "answering") handleCheck();
              }}
              className="w-40 border-b-4 border-lingo-blue bg-transparent text-center focus:outline-none font-bold text-lingo-text"
              autoFocus={true}
            />
          ) : (
            <span className={`px-4 py-1 rounded-xl border-b-4 font-bold text-2xl ${
              status === "correct"
                ? "border-lingo-green text-lingo-green bg-green-50"
                : "border-lingo-red text-lingo-red bg-red-50"
            }`}>
              {input || "(empty)"}
            </span>
          )}
        <HoverableText text={parts[1]} language={language} noAudio={exercise.noAudio?.includes("sentence")} />
      </div>
    </ExerciseShell>
  );
}
