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
  const words = useMemo(() => exercise.answer.split(/\s+/), [exercise.answer]);
  const [inputWords, setInputWords] = useState<string[]>(() => exercise.answer.split(/\s+/).map(() => ""));
  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch, loading: audioLoading } = useAudio();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setInputWords(exercise.answer.split(/\s+/).map(() => ""));
  }, [exercise.answer]);

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
      inputRefs.current[Math.min(words.length - 1, i + 1)]?.focus();
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
      {status === "answering" && (
        <div className="flex flex-col items-center mb-8">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Translate this sentence</h2>
          <div className="flex items-center gap-3">
            <p className="text-2xl sm:text-3xl font-black text-lingo-text-dark tracking-wide">
              &ldquo;<HoverableText text={exercise.sentence} language={sentenceLang} />&rdquo;
            </p>
            {!exercise.noAudio?.includes("sentence") && (
              <ReplayButton onPlay={() => play(exercise.sentence, sentenceLang)} />
            )}
          </div>
        </div>
      )}

      {status === "answering" ? (
        analysis ? (
          <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
            {(() => {
              let globalCounter = 0;
              return analysis.chunks.map((chunk: any, cIdx: number) => {
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
                  <div key={cIdx} className={`flex flex-col items-center p-3 border-2 ${colorClass} rounded-2xl bg-white shadow-xs`}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${badgeClass}`}>
                      {label}
                    </span>
                    <div className="flex gap-2">
                      {chunk.words.map((w: any, _: number) => {
                        const curIdx = globalCounter++;
                        const targetWord = words[curIdx] || w.word;
                        return (
                          <div key={curIdx} className="flex flex-col items-center">
                            <input
                              ref={(el: HTMLInputElement | null) => { inputRefs.current[curIdx] = el; }}
                              type="text"
                              value={inputWords[curIdx] || ""}
                              onChange={(e) => {
                                const newInput = [...inputWords];
                                newInput[curIdx] = e.target.value;
                                setInputWords(newInput);
                              }}
                              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleNavigation(curIdx, e)}
                              disabled={status !== "answering"}
                              style={{ width: `${Math.max(4, targetWord.length)}ch` }}
                              className="text-center text-xl font-bold border-b-4 border-lingo-blue bg-transparent focus:outline-none py-1 px-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">Loading structure breakdown...</div>
        )
      ) : (
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
