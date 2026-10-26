"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Volume2, ChevronLeft, ChevronRight } from "lucide-react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { useIsMobile } from "@/hooks/use-media-query";
import { useMobileKeyboardOpen } from "@/hooks/use-mobile-keyboard-open";
import {
  generateAlternativeTranslations,
  checkWordMatch,
  type WordMatchResult,
} from "@/lib/similarity";
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
  const [matchResult, setMatchResult] = useState<WordMatchResult | null>(null);
  const isMobile = useIsMobile();
  const isKeyboardOpen = useMobileKeyboardOpen();
  const promptRef = useRef<HTMLDivElement>(null);
  const inputRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSubmitted(false);
    setUserInput("");
    setMatchResult(null);
  }, [exercise.sentence, exercise.answer]);

  useEffect(() => {
    if (!isKeyboardOpen || !promptRef.current) return;
    const id = requestAnimationFrame(() => {
      promptRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [isKeyboardOpen]);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

  const allAnswers = useMemo(() => {
    const fromProps = exercise.acceptAlso || [];
    const fromApi = analysis?.acceptableTranslations || [];
    return generateAlternativeTranslations(exercise.answer, [
      ...fromProps,
      ...fromApi,
    ]);
  }, [exercise.answer, exercise.acceptAlso, analysis?.acceptableTranslations]);

  const { status } = useExercise();
  const { play, stop, prefetch } = useAudio();

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language],
  );

  useEffect(() => {
    let isMounted = true;
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentence: exercise.answer,
            targetLanguage: "en",
          }),
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
      const clean = token
        .toLowerCase()
        .replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
      const dict = BUILTIN_WORD_DICT[clean];
      const apiWord = analysis?.chunks
        ?.flatMap((c) => c.words)
        ?.find(
          (w) =>
            w.word
              .toLowerCase()
              .replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "") === clean,
        );
      let gTag =
        apiWord?.pos && POS_BADGE_STYLES[apiWord.pos]
          ? apiWord.pos
          : dict?.grammarTag || resolveGrammarTag(clean, apiWord?.pos);
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

  useEffect(() => {
    if (!autoplayAudio) return;
    if (exercise.noAudio?.includes("sentence")) return stop;
    play(exercise.sentence, sentenceLang);
    return () => {
      stop();
    };
  }, [exercise.sentence, sentenceLang, autoplayAudio, play, stop, exercise.noAudio]);

  const goNext = useCallback(() => {
    if (!submitted) {
      onResult(false, userInput.trim() || "");
    }
    onContinue();
  }, [submitted, onResult, onContinue, userInput]);

  const goPrev = useCallback(() => {
    if (canGoPrev) onPrev();
  }, [canGoPrev, onPrev]);

  // After answer is checked, Enter advances to the next question (same as next arrow).
  useEffect(() => {
    if (!submitted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitted, goNext]);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    const input = userInput.trim();
    const result = checkWordMatch(input, allAnswers);
    setMatchResult(result);
    setSubmitted(true);
    onResult(result.isCorrect, input || exercise.answer);
    if (!exercise.noAudio?.includes("answer")) {
      play(exercise.answer, "en");
    }
  }, [submitted, userInput, allAnswers, onResult, exercise.answer, exercise.noAudio, play]);

  const animClass =
    direction === "backward" ? "animate-slide-in-left" : "animate-slide-in-right";

  const matchPct = matchResult?.percentage ?? 0;
  const isCorrect = matchResult?.isCorrect ?? false;
  const matchedIndices = matchResult?.matchedWordIndices ?? [];

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
      <div
        className={`w-full max-w-5xl mx-auto flex flex-col items-center ${
          isKeyboardOpen ? "py-1" : "py-2 sm:py-4"
        }`}
      >
        {!isKeyboardOpen && (
          <div className="mb-3 text-xs font-bold text-lingo-text-light">
            Question {exerciseIndex + 1} / {totalExercises}
          </div>
        )}

        <div
          ref={promptRef}
          className={`flex flex-col items-center text-center px-2 ${
            isKeyboardOpen ? "mt-0 mb-2" : "mt-2 mb-4"
          }`}
        >
          <h1
            className={`font-black text-gray-800 tracking-normal select-none ${
              isKeyboardOpen
                ? "text-lg sm:text-xl leading-snug"
                : "text-2xl sm:text-3xl md:text-4xl"
            }`}
          >
            <HoverableText text={exercise.sentence} language={sentenceLang} />
          </h1>
        </div>

        <div
          className={`flex w-full max-w-5xl items-center justify-between gap-2 px-1 ${
            isKeyboardOpen ? "mb-2" : "mb-6"
          }`}
        >
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="上一题"
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-border bg-white h-11 w-11 sm:h-12 sm:w-12 text-lingo-text shadow-sm transition-all hover:border-lingo-blue hover:text-lingo-blue active:translate-y-0.5 disabled:opacity-30 disabled:hover:border-lingo-border disabled:hover:text-lingo-text"
          >
            <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7 stroke-[3]" />
          </button>

          <div className="flex items-center justify-center gap-2.5">
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

          <button
            type="button"
            onClick={goNext}
            aria-label="下一题"
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-green bg-lingo-green h-11 w-11 sm:h-12 sm:w-12 text-white shadow-[0_4px_0_0] shadow-[#4a9e02] transition-all hover:bg-[#4a9e02] active:translate-y-0.5 active:shadow-none"
          >
            <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7 stroke-[3]" />
          </button>
        </div>

        <div className={`w-full max-w-4xl mx-auto px-1 ${isKeyboardOpen ? "mb-2" : "mb-4"}`}>
          <div
            className="flex flex-wrap items-stretch justify-center gap-1.5 sm:gap-2 pb-1"
          >
            {analyzedWordList.map((item, idx) => {
              const wordMatched = submitted ? matchedIndices[idx] === true : false;
              const bgClass = !submitted
                ? "bg-gray-50/70"
                : wordMatched
                  ? "bg-emerald-50"
                  : "bg-rose-50";
              const wordColor = !submitted
                ? "text-transparent select-none"
                : wordMatched
                  ? "text-emerald-700"
                  : "text-rose-700";
              return (
                <div
                  key={idx}
                  className={`rounded-xl flex flex-col items-center justify-center min-w-0 ${bgClass} ${
                    isMobile
                      ? "px-1.5 py-1"
                      : "px-2 sm:px-2.5 py-1.5 sm:py-2"
                  } ${isKeyboardOpen ? "py-1" : ""}`}
                >
                  <span
                    className={`w-full break-words text-center font-serif font-bold tracking-tight leading-tight ${wordColor} ${
                      isKeyboardOpen ? "text-xs" : "text-sm sm:text-base md:text-lg"
                    }`}
                    title={submitted ? item.word : undefined}
                    aria-hidden={!submitted}
                  >
                    {submitted ? item.word : "·"}
                  </span>
                  <div className="flex flex-col items-center justify-center mt-1 w-full gap-0.5 min-w-0">
                    {item.grammarTag && (
                      <div
                        className={`text-[9px] sm:text-[10px] font-bold text-center px-1.5 py-0.5 rounded-full border shadow-2xs tracking-wide whitespace-nowrap ${
                          POS_BADGE_STYLES[item.grammarTag]
                            ? `${POS_BADGE_STYLES[item.grammarTag].bg} ${POS_BADGE_STYLES[item.grammarTag].text} ${POS_BADGE_STYLES[item.grammarTag].border}`
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {item.grammarTag}
                      </div>
                    )}
                    {submitted && item.meaning && (
                      <div
                        className="text-[10px] sm:text-xs text-gray-800 text-center font-semibold leading-tight break-words w-full"
                        title={item.meaning}
                      >
                        {item.meaning}
                      </div>
                    )}
                    {submitted && item.ipa && (
                      <div
                        className="text-[9px] sm:text-[10px] text-gray-500 font-mono text-center leading-tight break-words w-full"
                        title={item.ipa}
                      >
                        {item.ipa}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!submitted ? (
          <div
            ref={inputRowRef}
            className={`w-full ${
              isKeyboardOpen ? "sticky bottom-0 z-10 bg-lingo-bg/95 backdrop-blur-sm pt-1 pb-1" : ""
            }`}
          >
            <div className={`min-w-0 w-full ${animClass}`}>
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
                onFocus={() => {
                  requestAnimationFrame(() => {
                    promptRef.current?.scrollIntoView({
                      block: "start",
                      behavior: "instant" as ScrollBehavior,
                    });
                  });
                }}
                placeholder="Type your translation…"
                autoFocus
                enterKeyHint="done"
                className="w-full rounded-2xl border-2 border-lingo-border bg-white px-3 sm:px-4 py-2.5 sm:py-3 text-center text-base sm:text-lg font-semibold text-lingo-text shadow-sm outline-none transition-all placeholder:text-lingo-text-light/60 focus:border-lingo-blue focus:shadow-[0_0_0_3px_rgba(28,176,246,0.15)]"
                aria-label="Your translation"
              />
              {!isKeyboardOpen && (
                <p className="mt-2 text-center text-[11px] font-medium text-lingo-text-light">
                  Press Enter to check · 80%+ word match = correct
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className={`w-full ${animClass}`}>
            <div
              className={`mx-auto mb-4 w-full max-w-md rounded-2xl border-2 px-4 py-3 text-center shadow-sm ${
                isCorrect
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-rose-300 bg-rose-50 text-rose-800"
              }`}
            >
              <div className="text-2xl font-black tabular-nums">{matchPct}%</div>
              <div className="text-xs font-bold uppercase tracking-wider mt-0.5">
                {isCorrect ? "Correct" : "Not quite"} ·{" "}
                {matchResult?.matchCount ?? 0}/{matchResult?.totalCount ?? 0} words
              </div>
              {userInput.trim() && (
                <div className="mt-2 text-sm font-semibold opacity-80">
                  Your answer: {userInput.trim()}
                </div>
              )}
              <div className="mt-2 text-[11px] font-medium opacity-70">
                Press Enter or → for next
              </div>
            </div>

            <div className="mt-2 w-full">
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
              ) : null}
            </div>
          </div>
        )}
      </div>
    </ExerciseShell>
  );
}
