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
  
  const analyzedWords = useMemo(() => {
    if (!analysis || !analysis.chunks) {
      return exercise.answer.split(/\s+/).map(w => ({ word: w, ipa: "", meaning: "" }));
    }
    return analysis.chunks.flatMap((c: any) => c.words);
  }, [analysis, exercise.answer]);

  const words = useMemo(() => analyzedWords.map(w => w.word), [analyzedWords]);

  const [inputWords, setInputWords] = useState<string[]>(() => exercise.answer.split(/\s+/).map(() => ""));
  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch, loading: audioLoading } = useAudio();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setInputWords(analyzedWords.map(() => ""));
  }, [analyzedWords]);

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

  // Auto-focus first input on mount / when analysis loads
  useEffect(() => {
    if (status === "answering" && analysis) {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [status, analysis]);

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
        <div className="flex flex-col items-center mb-6">
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

      {analysis ? (
        <div className="my-4 p-4 sm:p-6 bg-white rounded-3xl border border-gray-200 shadow-xl transition-all w-full max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 py-4 px-1">
            {(() => {
              let globalCounter = 0;
              const badgeColors: Record<string, string> = {
                "主语": "bg-amber-100 text-amber-900 border border-amber-300",
                "谓语": "bg-rose-100 text-rose-900 border border-rose-300",
                "宾语": "bg-blue-100 text-blue-900 border border-blue-300",
                "状语": "bg-teal-100 text-teal-900 border border-teal-300",
                "定语": "bg-purple-100 text-purple-900 border border-purple-300",
                "补语": "bg-indigo-100 text-indigo-900 border border-indigo-300",
                "连词": "bg-slate-100 text-slate-800 border border-slate-300",
                "句子": "bg-gray-100 text-gray-800 border border-gray-300",
              };

              return analysis.chunks.map((chunk: any, cIdx: number) => {
                const badgeStyle = badgeColors[chunk.chunkLabel] || "bg-gray-100 text-gray-800 border border-gray-300";
                return (
                  <div
                    key={cIdx}
                    className="flex flex-col items-center bg-white border border-gray-200 rounded-2xl p-3 sm:px-4 sm:py-3.5 shadow-xs hover:border-gray-300 transition-all flex-shrink-0"
                  >
                    <span className={`text-[10px] sm:text-xs font-bold px-3 py-0.5 rounded-full mb-2 shadow-2xs whitespace-nowrap ${badgeStyle}`}>
                      {chunk.chunkLabel}
                    </span>
                    <div className="flex flex-row items-center gap-3 sm:gap-4">
                      {chunk.words.flatMap((w: any) => w.word.split(/\s+/).map((sub: string) => ({ ...w, word: sub }))).map((w: any, _: number) => {
                        const curIdx = globalCounter++;
                        const targetWord = words[curIdx] || w.word;
                        return (
                          <div key={curIdx} className="flex flex-col items-center text-center">
                            <span className="text-[10px] font-mono text-gray-400 mb-0.5">
                              {w.ipa || ""}
                            </span>
                            {status === "answering" ? (
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
                                className="text-center text-base sm:text-xl font-extrabold text-gray-900 tracking-tight border-b-2 border-lingo-blue bg-transparent focus:outline-none py-0.5"
                              />
                            ) : (
                              <span className="text-base sm:text-xl font-extrabold text-gray-900 tracking-tight whitespace-nowrap">
                                {w.word}
                              </span>
                            )}
                            <span className="text-[11px] font-medium text-gray-600 mt-0.5 whitespace-nowrap">
                              {w.meaning}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">Loading sentence structure...</div>
      )}

      {status !== "answering" && (
        <div className="mt-6 text-center">
          {/* SentenceAnalysisView can be omitted here since we render the exact same breakdown live */}
        </div>
      )}
    </ExerciseShell>
  );
}
