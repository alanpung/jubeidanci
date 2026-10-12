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
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-10 py-8 px-6 bg-white border border-gray-100 rounded-3xl shadow-sm">
          {analyzedWords.map((w: any, i: number) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <input
                ref={(el: HTMLInputElement | null) => { inputRefs.current[i] = el; }}
                type="text"
                value={inputWords[i] || ""}
                onChange={(e) => {
                  const newInput = [...inputWords];
                  newInput[i] = e.target.value;
                  setInputWords(newInput);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleNavigation(i, e)}
                disabled={status !== "answering"}
                style={{ width: `${Math.max(4, w.word.length)}ch` }}
                className="text-center text-xl sm:text-2xl font-bold border-b-4 border-lingo-blue bg-transparent focus:outline-none py-1 px-1"
              />
              {/* IPA and Chinese meaning below */}
              <div className={`flex flex-col items-center transition-opacity duration-300 ${status === "answering" ? "opacity-0 h-0 overflow-hidden" : "opacity-100"}`}>
                <span className="text-[11px] font-mono text-gray-400">{w.ipa}</span>
                <span className="text-xs font-bold text-gray-800">{w.word}</span>
                <span className="text-[11px] font-medium text-gray-600">{w.meaning}</span>
              </div>
            </div>
          ))}
        </div>
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
