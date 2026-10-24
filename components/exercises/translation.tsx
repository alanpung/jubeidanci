"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Volume2, ChevronLeft, ChevronRight } from "lucide-react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { generateAlternativeTranslations } from "@/lib/similarity";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { detectTextLanguage } from "@/lib/language-detector";
import { BUILTIN_WORD_DICT } from "./translation-word-dict";
import {
  POS_BADGE_STYLES,
  resolveGrammarTag,
} from "./translation-helpers";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  onPrev: () => void;
  canGoPrev: boolean;
  exerciseIndex: number;
  totalExercises: number;
  direction: "forward" | "backward" | null;
  language: string;
  autoplayAudio?: boolean;
}

interface AnalyzedWord {
  word: string;
  ipa?: string;
  meaning?: string;
  pos?: string;
  grammarTag?: string;
}

interface SentenceAnalysisData {
  fullTranslation?: string;
  acceptableTranslations?: string[];
  words?: AnalyzedWord[];
  chunks?: { chunkLabel: string; words: AnalyzedWord[] }[];
}

export function Translation({
  exercise,
  onResult,
  onContinue,
  onPrev,
  canGoPrev,
  exerciseIndex,
  totalExercises,
  direction,
  language,
  autoplayAudio = true,
}: Props) {
  const [analysis, setAnalysis] = useState<SentenceAnalysisData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [userInput, setUserInput] = useState("");

  useEffect(() => {
    setSubmitted(false);
    setUserInput("");
  }, [exercise.sentence, exercise.answer]);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

  const allAnswers = useMemo(() => {
    const fromProps = exercise.acceptAlso || [];
    const fromApi = analysis?.acceptableTranslations || [];
    return generateAlternativeTranslations(exercise.answer, [...fromProps, ...fromApi]);
  }, [exercise.answer, exercise.acceptAlso, analysis?.acceptableTranslations]);

  const { status } = useExercise();
  const { play, stop, prefetch } = useAudio();

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language]
  );

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
        console.error("Failed to fetch sentence analysis", err);
      }
    }
    fetchAnalysis();
    return () => {
      isMounted = false;
    };
  }, [exercise.answer]);

  const analyzedWordList = useMemo<AnalyzedWord[]>(() => {
    return rawAnswerTokens.map((token: string) => {
      const clean = token.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
      const dict = BUILTIN_WORD_DICT[clean];

      const apiWord = analysis?.chunks?.flatMap((c) => c.words)?.find((w) =>
        w.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "") === clean
      );

      let gTag = (apiWord?.pos && POS_BADGE_STYLES[apiWord.pos])
        ? apiWord.pos
        : (dict?.grammarTag || resolveGrammarTag(clean, apiWord?.pos));

      let meaning = "";
      if (dict?.meaning && /[\u4e00-\u9fa5]/.test(dict.meaning)) {
        meaning = dict.meaning;
      } else if (apiWord?.meaning && /[\u4e00-\u9fa5]/.test(apiWord.meaning)) {
        meaning = apiWord.meaning;
      }

      const ipa = dict?.ipa || apiWord?.ipa || "";

      return { word: token, ipa, meaning, pos: gTag, grammarTag: gTag };
    });
  }, [rawAnswerTokens, analysis]);

  const orderedAnswers = useMemo(() => {
    const primary = allAnswers[0] || exercise.answer;
    const matched = allAnswers.find((a) => a.toLowerCase() === primary.toLowerCase());
    if (!matched) return allAnswers;
    return [matched, ...allAnswers.filter((a) => a.toLowerCase() !== primary.toLowerCase())];
  }, [allAnswers, exercise.answer]);

  useEffect(() => {
    const toFetch = [exercise.sentence, ...allAnswers].filter(Boolean);
    prefetch(toFetch, language);
  }, [exercise.sentence, allAnswers, language, prefetch]);

  // Only auto-read Chinese; English is manual so the answer is not revealed early.
  useEffect(() => {
    if (!autoplayAudio) return;
    if (exercise.noAudio?.includes("sentence")) return stop;
    play(exercise.sentence, sentenceLang);
    return () => {
      stop();
    };
  }, [exercise.sentence, sentenceLang, autoplayAudio, play, stop, exercise.noAudio]);

  const goNext = useCallback(() => {
    onResult(true, exercise.answer);
    onContinue();
  }, [onResult, onContinue, exercise.answer]);

  const goPrev = useCallback(() => {
    if (canGoPrev) onPrev();
  }, [canGoPrev, onPrev]);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    onResult(true, userInput.trim() || exercise.answer);
    if (!exercise.noAudio?.includes("answer")) {
      play(exercise.answer, "en");
    }
  }, [submitted, userInput, onResult, exercise.answer, exercise.noAudio, play]);

  const animClass =
    direction === "backward" ? "animate-slide-in-left" : "animate-slide-in-right";

  return (
    <ExerciseShell
      status={status}
      onCheck={() => {}}
      onContinue={onContinue}
      canCheck={false}
      hideCheck
      hideContinue
      freeNav
      onSwipeLeft={goNext}
      onSwipeRight={goPrev}
    >
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-2 sm:py-4">
        <div className="mb-3 text-xs font-bold text-lingo-text-light">
          Question {exerciseIndex + 1} / {totalExercises}
        </div>

        <div className="flex flex-col items-center mt-2 mb-4 text-center px-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-800 tracking-normal select-none">
            <HoverableText text={exercise.sentence} language={sentenceLang} />
          </h1>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              play(exercise.sentence, sentenceLang);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-lingo-blue px-3.5 text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold shadow-sm"
            aria-label="播放中文音频"
            title="中文音频"
          >
            <Volume2 className="h-4 w-4" />
            中文
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              play(exercise.answer, "en");
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-lingo-blue px-3.5 text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold shadow-sm"
            aria-label="播放英文音频"
            title="英文音频"
          >
            <Volume2 className="h-4 w-4" />
            English
          </button>
        </div>

        {!submitted ? (
          <div className="flex w-full items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              aria-label="上一题"
              className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-border bg-white h-12 w-12 text-lingo-text shadow-sm transition-all hover:border-lingo-blue hover:text-lingo-blue active:translate-y-0.5 disabled:opacity-30 disabled:hover:border-lingo-border disabled:hover:text-lingo-text"
            >
              <ChevronLeft className="h-7 w-7 stroke-[3]" />
            </button>

            <div className={`min-w-0 flex-1 ${animClass}`}>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Type your translation…"
                autoFocus
                className="w-full rounded-2xl border-2 border-lingo-border bg-white px-4 py-3 text-center text-base sm:text-lg font-semibold text-lingo-text shadow-sm outline-none transition-all placeholder:text-lingo-text-light/60 focus:border-lingo-blue focus:shadow-[0_0_0_3px_rgba(28,176,246,0.15)]"
                aria-label="Your translation"
              />
              <p className="mt-2 text-center text-[11px] font-medium text-lingo-text-light">
                Press Enter to reveal the answer
              </p>
            </div>

            <button
              type="button"
              onClick={goNext}
              aria-label="下一题"
              className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-green bg-lingo-green h-12 w-12 text-white shadow-[0_4px_0_0] shadow-[#4a9e02] transition-all hover:bg-[#4a9e02] active:translate-y-0.5 active:shadow-none"
            >
              <ChevronRight className="h-7 w-7 stroke-[3]" />
            </button>
          </div>
        ) : (
          <div className={`w-full ${animClass}`}>
            <div className="flex flex-wrap items-start justify-center gap-2 sm:gap-3 lg:gap-4 w-full max-w-3xl mx-auto">
              {analyzedWordList.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border-2 border-emerald-200 bg-emerald-50/20 shadow-xs px-2 sm:px-3 lg:px-4 py-2 sm:py-3 flex flex-col items-center justify-start min-w-[62px] sm:min-w-[92px] lg:min-w-[100px]"
                >
                  <span
                    style={{ minWidth: `${Math.max(3, item.word.length)}ch` }}
                    className="text-center font-serif text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-emerald-700"
                  >
                    {item.word}
                  </span>
                  <div className="flex flex-col items-center justify-center mt-1 sm:mt-2 w-full space-y-1 sm:space-y-1.5">
                    {item.grammarTag && (
                      <div
                        className={`text-[10px] sm:text-[11px] lg:text-xs font-bold text-center px-2 sm:px-2.5 py-0.5 rounded-full border shadow-2xs tracking-wide ${
                          POS_BADGE_STYLES[item.grammarTag]
                            ? `${POS_BADGE_STYLES[item.grammarTag].bg} ${POS_BADGE_STYLES[item.grammarTag].text} ${POS_BADGE_STYLES[item.grammarTag].border}`
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {item.grammarTag}
                      </div>
                    )}
                    {item.meaning && (
                      <div className="text-xs sm:text-sm lg:text-base text-gray-800 text-center font-semibold">
                        {item.meaning}
                      </div>
                    )}
                    {item.ipa && (
                      <div className="text-[10px] sm:text-xs lg:text-sm text-gray-500 font-mono text-center">
                        {item.ipa}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex w-full items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoPrev}
                aria-label="上一题"
                className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-border bg-white h-12 w-12 text-lingo-text shadow-sm transition-all hover:border-lingo-blue hover:text-lingo-blue active:translate-y-0.5 disabled:opacity-30 disabled:hover:border-lingo-border disabled:hover:text-lingo-text"
              >
                <ChevronLeft className="h-7 w-7 stroke-[3]" />
              </button>

              <div className="min-w-0 flex-1">
                {orderedAnswers.length > 1 ? (
                  <div className="mx-auto w-full max-w-2xl p-3 sm:p-4 bg-blue-50/40 border-2 border-blue-200 rounded-2xl shadow-sm space-y-1">
                    <span className="block text-xs font-bold text-blue-700 uppercase tracking-wider">
                      ALTERNATIVE ANSWERS:
                    </span>
                    {orderedAnswers.slice(1).map((alt, aIdx) => (
                      <div key={aIdx} className="text-sm sm:text-base font-bold text-blue-700">
                        {alt}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-2xl p-3 text-center text-sm text-lingo-text-light" />
                )}
              </div>

              <button
                type="button"
                onClick={goNext}
                aria-label="下一题"
                className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-green bg-lingo-green h-12 w-12 text-white shadow-[0_4px_0_0] shadow-[#4a9e02] transition-all hover:bg-[#4a9e02] active:translate-y-0.5 active:shadow-none"
              >
                <ChevronRight className="h-7 w-7 stroke-[3]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </ExerciseShell>
  );
}
