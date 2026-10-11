"use client";

import { useState, useEffect, useMemo } from "react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { checkBestMatch } from "@/lib/similarity";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { AudioSpinner } from "@/components/audio-spinner";
import { ReplayButton } from "@/components/replay-button";
import { detectTextLanguage } from "@/lib/language-detector";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  language: string;
  autoplayAudio?: boolean;
}

export function Translation({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const [input, setInput] = useState("");
  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch, loading: audioLoading } = useAudio();

  // Combine primary answer and acceptAlso, deduplicate, and limit to maximum 3 answers
  const allAnswers = useMemo(() => {
    const rawList = [exercise.answer, ...(exercise.acceptAlso || [])];
    const list: string[] = [];
    for (const item of rawList) {
      if (!item) continue;
      const trimmed = item.trim();
      if (trimmed && !list.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        list.push(trimmed);
      }
      if (list.length >= 3) break; // Limit to maximum 3 answers
    }
    return list.length > 0 ? list : [exercise.answer];
  }, [exercise.answer, exercise.acceptAlso]);

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language]
  );
  const textLang = useMemo(
    () => detectTextLanguage(exercise.text, { targetLanguage: language }),
    [exercise.text, language]
  );
  const answerLang = useMemo(
    () => detectTextLanguage(exercise.answer, { targetLanguage: language }),
    [exercise.answer, language]
  );

  // Prefetch sentence and all acceptable answer audio
  useEffect(() => {
    const toFetch = [exercise.sentence, ...allAnswers].filter(Boolean);
    prefetch(toFetch, language);
  }, [exercise.sentence, allAnswers, language, prefetch]);

  useEffect(() => {
    if (autoplayAudio && !exercise.noAudio?.includes("sentence")) {
      play(exercise.sentence, sentenceLang);
    }
    return stop;
  }, [exercise.sentence, sentenceLang, autoplayAudio, play, stop, exercise.noAudio]);

  function handleCheck() {
    const trimmed = input.trim();
    const result = checkBestMatch(trimmed, allAnswers);
    if (!result.isCorrect) setCorrectedMarkdown(result.correctedMarkdown);
    checkAnswer(result.isCorrect);
    onResult(result.isCorrect, trimmed);
  }

  return (
    <ExerciseShell
      status={status}
      onCheck={handleCheck}
      onContinue={onContinue}
      canCheck={input.trim().length > 0}
      correctAnswer={exercise.answer}
      allAnswers={allAnswers}
      correctedMarkdown={correctedMarkdown}
      language={answerLang}
    >
      <h2 className="text-xl font-bold text-lingo-text mb-2">
        <HoverableText text={exercise.text} language={textLang} noAudio={exercise.noAudio?.includes("text")} />
      </h2>
      <AudioSpinner loading={audioLoading} />
      <div className="flex items-start gap-2 mb-6">
        <p className="text-lg text-lingo-text-light">
          &ldquo;<HoverableText text={exercise.sentence} language={sentenceLang} noAudio={exercise.noAudio?.includes("sentence")} />&rdquo;
        </p>
        {!exercise.noAudio?.includes("sentence") && (
          <ReplayButton onPlay={() => play(exercise.sentence, sentenceLang)} />
        )}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim() && status === "answering") handleCheck();
        }}
        disabled={status !== "answering"}
        placeholder="Type your answer..."
        className="w-full rounded-xl border-2 border-lingo-border bg-white px-4 py-3 text-lg focus:border-lingo-blue focus:outline-none"
        autoFocus
      />
    </ExerciseShell>
  );
}
