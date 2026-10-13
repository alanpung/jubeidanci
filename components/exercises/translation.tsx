"use client";

import { useState, useEffect, useMemo, useRef, KeyboardEvent } from "react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { checkBestMatch } from "@/lib/similarity";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { ReplayButton } from "@/components/replay-button";
import { detectTextLanguage } from "@/lib/language-detector";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  language: string;
  autoplayAudio?: boolean;
}

interface AnalyzedWord {
  word: string;
  ipa?: string;
  meaning?: string;
  pos?: string;
}

interface SyntacticChunk {
  chunkLabel: string;
  words: AnalyzedWord[];
}

interface SentenceAnalysisData {
  fullTranslation?: string;
  chunks: SyntacticChunk[];
}

export function Translation({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const [analysis, setAnalysis] = useState<SentenceAnalysisData | null>(null);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

  const analyzedWordList = useMemo<AnalyzedWord[]>(() => {
    if (!analysis || !Array.isArray(analysis.chunks)) {
      return rawAnswerTokens.map((w: string) => ({ word: w, ipa: "", meaning: "" }));
    }
    const flattened: AnalyzedWord[] = [];
    for (const c of analysis.chunks) {
      if (!c || !Array.isArray(c.words)) continue;
      for (const w of c.words) {
        if (!w) continue;
        const parts = String(w.word || "").trim().split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
          for (let pIdx = 0; pIdx < parts.length; pIdx++) {
            flattened.push({
              word: parts[pIdx],
              ipa: pIdx === 0 ? (w.ipa || "") : "",
              meaning: pIdx === 0 ? (w.meaning || "") : "",
            });
          }
        } else if (parts.length === 1) {
          flattened.push({
            word: parts[0],
            ipa: w.ipa || "",
            meaning: w.meaning || "",
          });
        }
      }
    }
    return rawAnswerTokens.map((token: string, idx: number) => {
      const found = flattened[idx];
      if (found) return found;
      return { word: token, ipa: "", meaning: "" };
    });
  }, [analysis, rawAnswerTokens]);

  const [inputWords, setInputWords] = useState<string[]>(() => rawAnswerTokens.map(() => ""));
  const [correctedMarkdown, setCorrectedMarkdown] = useState<string>();
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch } = useAudio();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setInputWords(rawAnswerTokens.map(() => ""));
    setCorrectedMarkdown(undefined);
    setSimilarityScore(null);
    setBestMatchAnswer(exercise.answer);
    // Auto-focus the first word line immediately as soon as question is displayed
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [exercise.answer, rawAnswerTokens]);

  useEffect(() => {
    if (status === "answering") {
      inputRefs.current[0]?.focus();
    }
  }, [status]);

  useEffect(() => {
    let isMounted = true;
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence: exercise.answer, targetLanguage: "en" }),
        });
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setAnalysis(json);
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchAnalysis();
    return () => {
      isMounted = false;
    };
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
    if (e.key === "ArrowRight") {
      e.preventDefault();
      inputRefs.current[Math.min(rawAnswerTokens.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      inputRefs.current[Math.max(0, i - 1)]?.focus();
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (i + 1 < rawAnswerTokens.length) {
        inputRefs.current[i + 1]?.focus();
      }
    } else if (e.key === "Backspace" && (!inputWords[i] || inputWords[i].length === 0)) {
      if (i > 0) {
        e.preventDefault();
        inputRefs.current[i - 1]?.focus();
      }
    }
  };

  return (
    <ExerciseShell
      status={status}
      onCheck={handleCheck}
      onContinue={onContinue}
      canCheck={inputWords.length === rawAnswerTokens.length && inputWords.every((w: string) => w.trim().length > 0)}
      correctAnswer={bestMatchAnswer}
      allAnswers={orderedAnswers}
      correctedMarkdown={correctedMarkdown}
      language={language}
      similarityScore={similarityScore}
    >
      {/* Question Section - always visible and prominent */}
      <div className="flex flex-col items-center mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Translate this sentence</h2>
        <div className="flex items-center justify-center gap-3">
          <p className="text-2xl sm:text-3xl font-black text-gray-900 tracking-wide text-center">
            &ldquo;<HoverableText text={exercise.sentence} language={sentenceLang} />&rdquo;
          </p>
          {!exercise.noAudio?.includes("sentence") && (
            <ReplayButton onPlay={() => play(exercise.sentence, sentenceLang)} />
          )}
        </div>
      </div>

      {/* Unified Answer Card with IPA, Inputs/Words, and Chinese Meaning */}
      <div className="my-6 p-4 sm:p-6 bg-white rounded-3xl border border-gray-200 shadow-sm transition-all w-full max-w-4xl mx-auto">
        <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-4 py-3 px-1">
          {rawAnswerTokens.map((targetWord: string, idx: number) => {
            const info = analyzedWordList[idx] || { word: targetWord, ipa: "", meaning: "" };
            return (
              <div key={idx} className="flex flex-col items-center text-center">
                {/* IPA above */}
                <span className="text-[11px] sm:text-xs font-mono text-gray-400 min-h-[1.25rem] select-none mb-1">
                  {info.ipa || ""}
                </span>

                {/* Word Input or Revealed Word */}
                {status === "answering" ? (
                  <input
                    ref={(el: HTMLInputElement | null) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    autoFocus={idx === 0}
                    value={inputWords[idx] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes(" ")) {
                        const clean = val.replace(/\s+/g, "");
                        const next = [...inputWords];
                        next[idx] = clean;
                        setInputWords(next);
                        if (idx + 1 < rawAnswerTokens.length) {
                          inputRefs.current[idx + 1]?.focus();
                        }
                        return;
                      }
                      const next = [...inputWords];
                      next[idx] = val;
                      setInputWords(next);
                    }}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleNavigation(idx, e)}
                    disabled={status !== "answering"}
                    style={{ width: `${Math.max(4, targetWord.length + 1)}ch` }}
                    className="text-center text-xl sm:text-2xl font-black text-gray-900 tracking-tight border-b-2 border-lingo-blue focus:border-lingo-blue-dark bg-transparent focus:outline-none py-0.5 px-1 min-w-[3.2rem]"
                  />
                ) : (
                  <span className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight px-1 py-0.5 border-b-2 border-transparent">
                    {targetWord}
                  </span>
                )}

                {/* Chinese meaning below */}
                <span className="text-xs sm:text-sm font-medium text-gray-600 mt-1 min-h-[1.25rem] whitespace-nowrap">
                  {info.meaning || ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ExerciseShell>
  );
}
