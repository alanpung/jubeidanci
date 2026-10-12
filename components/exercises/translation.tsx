"use client";

import { useState, useEffect, useMemo, useRef, KeyboardEvent } from "react";
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
  const [analysis, setAnalysis] = useState<any>(null);
  
  // Create a flattened list of words from analysis chunks if available
  const words = useMemo(() => {
    if (!analysis) return exercise.answer.split(/\s+/);
    return analysis.chunks.flatMap((c: any) => c.words.map((w: any) => w.word));
  }, [analysis, exercise.answer]);

  // Sync inputWords with words
  const [inputWords, setInputWords] = useState<string[]>([]);
  useEffect(() => {
    setInputWords(words.map(() => ""));
  }, [words]);

  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch, loading: audioLoading } = useAudio();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence: exercise.answer, targetLanguage: "en" }),
        });
        if (res.ok) setAnalysis(await res.json());
      } catch (err) { console.error(err); }
    }
    fetchAnalysis();
  }, [exercise.answer]);

  // ... (rest of the logic remains similar)

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

  const handleNavigation = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      inputRefs.current[Math.min(inputWords.length - 1, i + 1)]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      inputRefs.current[Math.max(0, i - 1)]?.focus();
    }
  };

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
      {(status === "answering") && (
        <div className="flex flex-col items-center mb-10">
          <h2 className="text-xl font-bold text-lingo-text mb-2">Translate this sentence</h2>
          <p className="text-lg text-lingo-text-light">&ldquo;{exercise.sentence}&rdquo;</p>
        </div>
      )}

      {analysis ? (
        <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
          {analysis.chunks.map((chunk: any, cIdx: number) => {
            const label = chunk.chunkLabel;
            const colorClass = 
              label === "主语" ? "border-amber-300" :
              label === "谓语" ? "border-rose-300" :
              label === "宾语" ? "border-blue-300" :
              label === "状语" ? "border-teal-300" :
              label === "定语" ? "border-purple-300" :
              label === "补语" ? "border-indigo-300" :
              "border-gray-300";
            
            const badgeClass = 
              label === "主语" ? "bg-amber-100 text-amber-900" :
              label === "谓语" ? "bg-rose-100 text-rose-900" :
              label === "宾语" ? "bg-blue-100 text-blue-900" :
              label === "状语" ? "bg-teal-100 text-teal-900" :
              label === "定语" ? "bg-purple-100 text-purple-900" :
              label === "补语" ? "bg-indigo-100 text-indigo-900" :
              "bg-gray-100 text-gray-800";

            return (
              <div key={cIdx} className={`flex flex-col items-center p-3 border-2 ${colorClass} rounded-2xl`}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${badgeClass}`}>
                  {label}
                </span>
                <div className="flex gap-2">
                  {chunk.words.map((w: any, wIdx: number) => {
                    const globalIdx = analysis.chunks.slice(0, cIdx).reduce((acc: number, c: any) => acc + c.words.length, 0) + wIdx;
                    return (
                      <div key={wIdx} className="flex flex-col items-center">
                        <input
                          ref={(el: HTMLInputElement | null) => { inputRefs.current[globalIdx] = el; }}
                          type="text"
                          value={inputWords[globalIdx]}
                          onChange={(e) => {
                            const newInput = [...inputWords];
                            newInput[globalIdx] = e.target.value;
                            setInputWords(newInput);
                          }}
                          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleNavigation(globalIdx, e)}
                          disabled={status !== "answering"}
                          style={{ width: `${Math.max(4, w.word.length)}ch` }}
                          className={`text-center border-b-2 bg-transparent focus:outline-none ${
                            status === "correct" ? "border-lingo-green text-lingo-green" :
                            status === "incorrect" ? "border-lingo-red text-lingo-red" :
                            "border-gray-300 focus:border-lingo-blue"
                          }`}
                        />
                        <div className={`flex flex-col items-center transition-opacity ${status === "answering" ? "opacity-0" : "opacity-100"}`}>
                          <span className="text-[10px] text-gray-400">{w.ipa}</span>
                          <span className="text-sm font-bold">{w.word}</span>
                          <span className="text-[10px] text-gray-500">{w.meaning}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center">Loading structure...</div>
      )}
    </ExerciseShell>
  );
}
