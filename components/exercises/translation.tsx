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
import { SentenceAnalysisView } from "./sentence-analysis";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  language: string;
  autoplayAudio?: boolean;
}

export function Translation({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const words = useMemo(() => exercise.answer.split(/\s+/), [exercise.answer]);
  const [inputWords, setInputWords] = useState<string[]>(words.map(() => ""));
  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch, loading: audioLoading } = useAudio();

  const allAnswers = useMemo(() => {
    const rawList = [exercise.answer, ...(exercise.acceptAlso || [])];
    const list: string[] = [];
    for (const item of rawList) {
      if (!item) continue;
      const trimmed = item.trim();
      if (trimmed && !list.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        list.push(trimmed);
      }
      if (list.length >= 3) break;
    }
    return list.length > 0 ? list : [exercise.answer];
  }, [exercise.answer, exercise.acceptAlso]);

  const orderedAnswers = useMemo(() => {
    if (!bestMatchAnswer) return allAnswers;
    const matched = allAnswers.find((a) => a.toLowerCase() === bestMatchAnswer.toLowerCase());
    if (!matched) return allAnswers;
    return [matched, ...allAnswers.filter((a) => a.toLowerCase() !== bestMatchAnswer.toLowerCase())];
  }, [allAnswers, bestMatchAnswer]);

  useEffect(() => {
    setBestMatchAnswer(exercise.answer);
  }, [exercise.answer]);

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language]
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
    const fullAnswer = inputWords.join(" ").trim();
    const result = checkBestMatch(fullAnswer, allAnswers);
    setSimilarityScore(result.similarity);
    const chosenBest = result.matchedAnswer || allAnswers[0] || exercise.answer;
    setBestMatchAnswer(chosenBest);
    if (!result.isCorrect) setCorrectedMarkdown(result.correctedMarkdown);
    checkAnswer(result.isCorrect);
    onResult(result.isCorrect, fullAnswer);

    if (!exercise.noAudio?.includes("sentence")) {
      play(chosenBest, "en");
    }
  }

  return (
    <ExerciseShell
      status={status}
      onCheck={handleCheck}
      onContinue={onContinue}
      canCheck={inputWords.every(w => w.trim().length > 0)}
      correctAnswer={bestMatchAnswer}
      allAnswers={orderedAnswers}
      correctedMarkdown={correctedMarkdown}
      language={language}
      similarityScore={similarityScore}
    >
      {/* 1. Only show question text if still answering */}
      {(status === "answering") && (
        <div className="flex flex-col items-center mb-10">
          <h2 className="text-xl font-bold text-lingo-text mb-2">Translate this sentence</h2>
          <div className="flex items-center gap-2">
            <p className="text-lg text-lingo-text-light">
              &ldquo;<HoverableText text={exercise.sentence} language={sentenceLang} />&rdquo;
            </p>
            {!exercise.noAudio?.includes("sentence") && (
              <ReplayButton onPlay={() => play(exercise.sentence, sentenceLang)} />
            )}
          </div>
        </div>
      )}
      
      {/* 2. Word-by-word input builder */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
        {words.map((word, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <input
              type="text"
              value={inputWords[i]}
              onChange={(e) => {
                const newInput = [...inputWords];
                newInput[i] = e.target.value;
                setInputWords(newInput);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputWords.every(w => w.trim()) && status === "answering") handleCheck();
              }}
              disabled={status !== "answering"}
              className={`w-20 text-center border-b-2 bg-transparent focus:outline-none text-lg font-semibold ${
                status === "correct" ? "border-lingo-green text-lingo-green" :
                status === "incorrect" ? "border-lingo-red text-lingo-red" :
                "border-gray-300 focus:border-lingo-blue"
              }`}
            />
            {/* The hidden hint revealed after submission */}
            <span className={`text-xs font-bold transition-opacity ${status === "answering" ? "opacity-0" : "opacity-100 text-amber-500"}`}>
              {word}
            </span>
          </div>
        ))}
      </div>

      {/* 3. Feedback and Alternatives shown at bottom */}
      {status !== "answering" && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <SentenceAnalysisView
            sentence={bestMatchAnswer || orderedAnswers[0] || exercise.answer}
            language="en"
            onPlayAudio={() => play(bestMatchAnswer || orderedAnswers[0] || exercise.answer, "en")}
          />
        </div>
      )}
    </ExerciseShell>
  );
}
