"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { Volume2, ChevronLeft, ChevronRight } from "lucide-react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
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
  // One entry per answer word; the user fills in each box.
  const [userInputs, setUserInputs] = useState<string[]>([]);
  const [matchResult, setMatchResult] = useState<WordMatchResult | null>(null);
  const isKeyboardOpen = useMobileKeyboardOpen();
  const promptRef = useRef<HTMLDivElement>(null);
  // Refs to each per-word box so Space can move focus to the next one.
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setSubmitted(false);
    setUserInputs(
      exercise.answer.trim().split(/\s+/).filter(Boolean).map(() => ""),
    );
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

  // Each input box is sized to the length of the word it expects, so short
  // words get a narrow box and long words a wide one. Measured in "ch"
  // (width of the "0" glyph) so it scales with the responsive font size.
  const boxWidths = useMemo(() => {
    return analyzedWordList.map((item) => {
      const cleanLen = item.word
        .replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "")
        .length;
      return Math.max(4, Math.min(20, cleanLen * 0.85 + 2.6));
    });
  }, [analyzedWordList]);

  // Exact pixel width of every answer word, measured with the real rendered
  // font. The "ch" estimate above is only a fallback: `ch` is the width of the
  // "0" glyph, and in Geist that is noticeably narrower than an average
  // lowercase letter, so long words used to overflow their box and lose the
  // last character. Measuring the actual glyphs guarantees the word always
  // fits with room to spare.
  const [measuredWidths, setMeasuredWidths] = useState<number[]>([]);
  const measureRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const probe = measureRef.current;
    if (!probe) return;
    const measure = () => {
      const widths = analyzedWordList.map((item) => {
        probe.textContent = item.word;
        return probe.offsetWidth;
      });
      setMeasuredWidths((prev) =>
        prev.length === widths.length && prev.every((w, i) => w === widths[i])
          ? prev
          : widths
      );
    };
    measure();
    // Webfonts land after the first paint — re-measure once they are ready.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
  }, [analyzedWordList]);

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

  const setWordInput = useCallback((idx: number, val: string) => {
    setUserInputs((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }, []);

  // Move focus to a given word box (used by Space navigation).
  const focusBox = useCallback((idx: number) => {
    inputRefs.current[idx]?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    const joined = userInputs.join(" ").trim();
    const result = checkWordMatch(userInputs, allAnswers);
    setMatchResult(result);
    setSubmitted(true);
    onResult(result.isCorrect, joined || exercise.answer);
    if (!exercise.noAudio?.includes("answer")) {
      play(exercise.answer, "en");
    }
  }, [submitted, userInputs, allAnswers, onResult, exercise.answer, exercise.noAudio, play]);

  // First press submits (reveals per-box colour feedback); second press advances.
  const goNext = useCallback(() => {
    if (!submitted) {
      handleSubmit();
      return;
    }
    onContinue();
  }, [submitted, handleSubmit, onContinue]);

  // Swipe-left mirrors the Enter key: first swipe submits, second advances.
  const handleSwipeLeft = useCallback(() => {
    if (!submitted) {
      handleSubmit();
    } else {
      goNext();
    }
  }, [submitted, handleSubmit, goNext]);

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
      onSwipeLeft={handleSwipeLeft}
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

        {/* Helper / result strip above the word boxes */}
        <div
          className={`w-full max-w-4xl mx-auto px-1 ${
            isKeyboardOpen ? "mb-2" : "mb-4"
          }`}
        >
          {!submitted ? (
            <p className="text-center text-[11px] font-medium text-lingo-text-light">
              Type each word, then press Enter to check · 80%+ word match = correct
            </p>
          ) : (
            <div
              className={`flex items-center justify-center gap-2 ${
                isKeyboardOpen ? "py-0.5" : "py-1"
              } ${animClass}`}
            >
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-black tabular-nums text-white shadow-sm ${
                  isCorrect ? "bg-emerald-500" : "bg-rose-500"
                }`}
              >
                {matchPct}%
              </span>
              <span
                className={`text-xs font-bold ${
                  isCorrect ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {isCorrect ? "Correct" : "Not quite"}
              </span>
              {!isKeyboardOpen && (
                <span className="text-[11px] font-medium text-lingo-text-light">
                  Press Enter or → for next
                </span>
              )}
            </div>
          )}
        </div>

        {/* Compact per-word boxes. One input per answer word, sized to the
            length of the word it expects (short word → narrow box, long word
            → wide box), laid out in a single wrapping row (1–2 rows). The POS
            tag is always visible above the box as a hint; Space jumps to the
            next box, Enter checks. After submitting, each box turns green
            (matched) or red (not matched) and the correct word, Chinese
            meaning and IPA are revealed beneath it. */}
        <div
          className={`w-full max-w-4xl mx-auto px-1 ${
            isKeyboardOpen ? "mb-2" : "mb-4"
          }`}
        >
          <div
            className="relative flex flex-wrap items-start justify-center gap-x-1.5 gap-y-3 sm:gap-x-2"
          >
            {/* Off-screen probe used to measure the true pixel width of each
                answer word in the real font. Same classes as the inputs so the
                measurement matches exactly. */}
            <span
              ref={measureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute whitespace-nowrap text-sm sm:text-base font-semibold"
            />
            {analyzedWordList.map((item, idx) => {
              const wordMatched = submitted ? matchedIndices[idx] === true : false;
              const lastBox = idx === analyzedWordList.length - 1;
              const posStyle = item.grammarTag
                ? POS_BADGE_STYLES[item.grammarTag]
                : null;
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center"
                  style={{ minWidth: "3rem" }}
                  title={
                    [item.meaning, item.ipa, item.grammarTag]
                      .filter(Boolean)
                      .join("  ·  ") || undefined
                  }
                >
                  {/* POS tag — always visible, coloured from the start so the
                      part-of-speech hint reads at a glance while answering. */}
                  {item.grammarTag ? (
                    <span
                      className={`mb-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold tracking-wide ${
                        posStyle
                          ? `${posStyle.bg} ${posStyle.text} ${posStyle.border}`
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {item.grammarTag}
                    </span>
                  ) : (
                    <span className="mb-1 h-[1.35rem]" aria-hidden="true" />
                  )}

                  <input
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    value={userInputs[idx] ?? ""}
                    disabled={submitted}
                    onChange={(e) => setWordInput(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSubmit();
                      } else if (e.code === "Space") {
                        // Space moves to the next word instead of typing a space.
                        e.preventDefault();
                        if (!lastBox) focusBox(idx + 1);
                        else handleSubmit();
                      } else if (e.key === "ArrowRight") {
                        // Right arrow jumps to the next word's box (not the next
                        // question) — unless this is already the last box.
                        e.preventDefault();
                        if (!lastBox) focusBox(idx + 1);
                      } else if (e.key === "ArrowLeft") {
                        // Left arrow jumps to the previous word's box.
                        e.preventDefault();
                        if (idx > 0) focusBox(idx - 1);
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
                    placeholder="…"
                    autoFocus={!submitted && idx === 0}
                    enterKeyHint="done"
                    inputMode="text"
                    style={{
                      // Real measured width of the word + room for the box's own
                      // padding (8px) and border (4px), plus a little breathing
                      // space so the word never touches the box edge.
                      width:
                        measuredWidths[idx] > 0
                          ? `${Math.max(48, measuredWidths[idx] + 16)}px`
                          : `${boxWidths[idx]}ch`,
                      minWidth: "3rem",
                    }}
                    className={`rounded-lg border-2 bg-white px-1 py-1.5 text-center text-sm sm:text-base font-semibold text-lingo-text shadow-sm outline-none transition-all placeholder:text-lingo-text-light/50 ${
                      submitted
                        ? wordMatched
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                          : "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-lingo-border focus:border-lingo-blue focus:shadow-[0_0_0_3px_rgba(28,176,246,0.15)]"
                    }`}
                    aria-label={`Word ${idx + 1}`}
                  />

                  {submitted ? (
                    <div className="mt-1 flex flex-col items-center leading-tight">
                      <span
                        className={`text-xs sm:text-sm font-serif font-bold tracking-tight ${
                          wordMatched ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {item.word}
                      </span>
                      {item.meaning && (
                        <span className="text-[10px] sm:text-[11px] font-semibold text-gray-800 whitespace-nowrap">
                          {item.meaning}
                        </span>
                      )}
                      {item.ipa && (
                        <span className="text-[9px] sm:text-[10px] font-mono text-gray-500 whitespace-nowrap">
                          {item.ipa}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="mt-1 h-[2.1rem]" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Alternative acceptable answers, shown after submitting */}
        {submitted && orderedAnswers.length > 1 && (
          <div className={`w-full max-w-4xl mx-auto px-1 ${animClass}`}>
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
          </div>
        )}
      </div>
    </ExerciseShell>
  );
}
