"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Volume2, ChevronLeft, ChevronRight, Check, RotateCcw } from "lucide-react";
import type { WritingExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { useMobileKeyboardOpen } from "@/hooks/use-mobile-keyboard-open";
import { detectTextLanguage } from "@/lib/language-detector";
import { splitBySpans, type WritingErrorSpan } from "@/lib/writing-errors";
import { ExerciseShell } from "./exercise-shell";
import { Button } from "@/components/ui/button";

/**
 * Whole-passage writing exercise.
 *
 * Deliberately simpler than the `Translation` exercise:
 *   - the complete Chinese prompt is shown once, as plain text;
 *   - the learner writes the complete English passage in a single textarea;
 *   - no per-word input boxes, no part-of-speech badges, no IPA and no
 *     Chinese word glosses — nothing that would hint at the answer.
 *
 * The Chinese prompt is rendered as plain text (NOT via `HoverableText`), so
 * hovering a word does not open a lookup popover either.
 *
 * Grading happens server-side in `/api/grade-writing`; this component only
 * renders the result.
 */

interface InternalGradeBlock {
  score: number;
  passed: boolean;
  deductions: { kind: string; label: string; count: number; points: number }[];
  errorSpans: WritingErrorSpan[];
}

interface AiGradeBlock {
  provider: string;
  score: number;
  passed: boolean;
  strengths: string[];
  corrections: string[];
  errorSpans: WritingErrorSpan[];
}

interface GradeResponse {
  score: number;
  passed: boolean;
  strengths: string[];
  corrections: string[];
  /** Char ranges into the trimmed essay; absent on older in-flight responses. */
  errorSpans?: WritingErrorSpan[];
  source: "ai" | "fallback";
  /** Which AI actually graded it, when source === "ai". */
  provider?: string;
  /** Why we fell back to local grading, when source === "fallback". */
  fallbackReason?: "no_provider" | "all_failed";
  /** Always present: the local rule-based marker result. */
  internal: InternalGradeBlock;
  /** Present only when an AI provider actually graded the essay. */
  ai?: AiGradeBlock;
  /** Present only when both graded: their rounded mean. */
  average?: number;
}

interface Props {
  exercise: WritingExercise;
  onResult: (correct: boolean, answer: string, score?: number) => void;
  onContinue: () => void;
  onPrev: () => void;
  canGoPrev: boolean;
  exerciseIndex: number;
  totalExercises: number;
  direction: "forward" | "backward" | null;
  language: string;
}

type Phase = "writing" | "grading" | "result";

function renderStars(stars: 0 | 1 | 2 | 3): string {
  return "★★★".slice(0, stars).padEnd(3, "☆");
}

function starsForScore(score: number): 0 | 1 | 2 | 3 {
  if (score >= 90) return 3;
  if (score >= 75) return 2;
  if (score >= 70) return 1;
  return 0;
}

/** Tailwind background colour for a 0–100 score badge. */
function scoreColorClass(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 75) return "bg-sky-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

export function Writing({
  exercise,
  onResult,
  onContinue,
  onPrev,
  canGoPrev,
  exerciseIndex,
  totalExercises,
  direction,
  language,
}: Props) {
  const [phase, setPhase] = useState<Phase>("writing");
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isKeyboardOpen = useMobileKeyboardOpen();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { status } = useExercise();
  const { play, stop, prefetch } = useAudio();

  const promptLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language],
  );

  // Reset whenever a different exercise is shown.
  useEffect(() => {
    setPhase("writing");
    setEssay("");
    setGrade(null);
    setError(null);
  }, [exercise.sentence, exercise.answer]);

  // Warm the TTS audio for the Chinese prompt so the button responds instantly.
  useEffect(() => {
    if (exercise.noAudio?.includes("sentence")) return;
    prefetch([exercise.sentence], promptLang);
  }, [exercise.sentence, promptLang, prefetch, exercise.noAudio]);

  const wordCount = useMemo(
    () => essay.trim().split(/\s+/).filter(Boolean).length,
    [essay],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = essay.trim();
    if (!trimmed || phase === "grading") return;

    setPhase("grading");
    setError(null);

    try {
      const res = await fetch("/api/grade-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          essay: trimmed,
          promptZh: exercise.sentence,
          modelAnswer: exercise.answer,
          acceptAlso: exercise.acceptAlso ?? [],
          level: "A1",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Grading failed");
      }

      const data = (await res.json()) as GradeResponse;
      setGrade(data);
      setPhase("result");
      onResult(data.passed, trimmed, data.score);

      if (!exercise.noAudio?.includes("answer")) {
        play(exercise.answer, "en");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
      // Back to writing so the learner's text is still there to retry.
      setPhase("writing");
    }
  }, [essay, phase, exercise.sentence, exercise.answer, exercise.acceptAlso, exercise.noAudio, onResult, play]);

  const goNext = useCallback(() => {
    if (phase === "writing") {
      void handleSubmit();
      return;
    }
    onContinue();
  }, [phase, handleSubmit, onContinue]);

  const goPrev = useCallback(() => {
    if (canGoPrev) onPrev();
  }, [canGoPrev, onPrev]);

  // Keyboard shortcuts (global):
  //   - Enter  → continue, but only once the result (congratulation) page is
  //     shown and focus is not inside a text field. Inside the textarea a
  //     plain Enter is left alone so it inserts a newline; submission there
  //     is Shift+Enter (handled below).
  //   - ArrowRight / ArrowLeft → next / previous question. These also work on
  //     the result page (the textarea is hidden there, so focus is never in a
  //     field). While typing, arrow keys move the caret instead of navigating.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (inField) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Enter" && phase === "result") {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, goNext, goPrev, onContinue]);

  // Shift+Enter submits from inside the textarea. Plain Enter is left to the
  // browser so it inserts a newline. While an IME is composing (e.g. typing
  // Chinese), Enter confirms the candidate and must NOT submit.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === "Enter" &&
        e.shiftKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const animClass =
    direction === "backward" ? "animate-slide-in-left" : "animate-slide-in-right";

  const stars = grade ? starsForScore(grade.score) : 0;

  // The grader returns character ranges, not a rewritten essay, so the
  // learner's own wording, punctuation and line breaks stay exactly as typed.
  const writingSegments = useMemo(
    () =>
      grade ? splitBySpans(essay.trim(), grade.errorSpans ?? []) : [],
    [essay, grade],
  );
  const hasMarkedWords = writingSegments.some((s) => s.error);

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
        className={`w-full max-w-3xl mx-auto flex flex-col items-center ${
          isKeyboardOpen ? "py-1" : "py-2 sm:py-4"
        }`}
      >
        {!isKeyboardOpen && (
          <div className="mb-3 text-xs font-bold text-lingo-text-light">
            Question {exerciseIndex + 1} / {totalExercises}
          </div>
        )}

        {/* Instruction */}
        <h1 className="mb-3 text-center text-lg font-black text-lingo-text sm:text-xl">
          {exercise.text}
        </h1>

        {/* The complete Chinese prompt — plain text on purpose. No
            HoverableText, so no hover lookup, no POS, no IPA, no gloss. */}
        <div className="mb-4 w-full rounded-2xl border-2 border-lingo-border bg-lingo-gray/20 p-4 sm:p-5">
          <p className="text-base leading-relaxed text-lingo-text sm:text-lg">
            {exercise.sentence}
          </p>
        </div>

        {/* Audio: the Chinese prompt is safe to play. The English model passage
            stays locked until the learner has submitted their own. */}
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              play(exercise.sentence, promptLang);
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
            disabled={phase !== "result"}
            onClick={(e) => {
              e.stopPropagation();
              play(exercise.answer, "en");
            }}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border-b-2 px-3.5 text-xs font-bold shadow-sm transition-all active:mt-0.5 ${
              phase === "result"
                ? "bg-lingo-blue text-white border-lingo-blue-dark hover:bg-lingo-blue/90"
                : "cursor-not-allowed border-lingo-border bg-lingo-gray/40 text-lingo-text-light"
            }`}
            aria-label="播放英文范文音频"
            title={phase === "result" ? "英文范文音频" : "提交后可播放范文"}
          >
            <Volume2 className="h-4 w-4" />
            English
          </button>
        </div>

        {/* Navigation row */}
        <div className="mb-4 flex w-full items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="上一题"
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-border bg-white h-11 w-11 sm:h-12 sm:w-12 text-lingo-text shadow-sm transition-all hover:border-lingo-blue hover:text-lingo-blue active:translate-y-0.5 disabled:opacity-30 disabled:hover:border-lingo-border disabled:hover:text-lingo-text"
          >
            <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7 stroke-[3]" />
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="下一题"
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-lingo-green bg-lingo-green h-11 w-11 sm:h-12 sm:w-12 text-white shadow-[0_4px_0_0] shadow-[#4a9e02] transition-all hover:bg-[#4a9e02] active:translate-y-0.5 active:shadow-none"
          >
            <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7 stroke-[3]" />
          </button>
        </div>

        {/* The writing textarea */}
        {phase !== "result" && (
          <div className="w-full px-1">
            <textarea
              ref={textareaRef}
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={phase === "grading"}
              placeholder="Write your passage in English here..."
              className="w-full rounded-2xl border-2 border-lingo-border bg-white p-4 text-base leading-relaxed text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none min-h-[240px] resize-y disabled:opacity-60"
              autoFocus
              enterKeyHint="enter"
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-lingo-text-light">
              <span>{wordCount} words</span>
              <span>Shift+Enter 提交 · Enter 换行</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-lingo-red/30 bg-red-50 px-4 py-2.5">
            <p className="text-xs font-bold text-lingo-red">{error}</p>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-lingo-red/40 bg-white px-2.5 py-1 text-[11px] font-bold text-lingo-red hover:bg-red-50"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {/* Result: AI feedback + the model passage, revealed only after submit */}
        {phase === "result" && grade && (
          <div className={`w-full space-y-4 px-1 ${animClass}`}>
            {/* Score */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center justify-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-black tabular-nums text-white shadow-sm ${
                    grade.score >= 90
                      ? "bg-emerald-500"
                      : grade.score >= 75
                      ? "bg-sky-500"
                      : grade.score >= 70
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                >
                  {grade.score} 分
                </span>
                <span
                  className="text-amber-500 text-base leading-none tracking-tight"
                  aria-label={`${stars} / 3 stars`}
                >
                  {renderStars(stars)}
                </span>
                <span
                  className={`text-xs font-bold ${
                    grade.passed ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {grade.passed ? "Good job!" : "Keep practising"}
                </span>
              </div>
              {grade.source === "fallback" && (
                <p className="text-center text-[11px] font-medium text-lingo-text-light">
                  {grade.fallbackReason === "no_provider"
                    ? "基础评分（未配置 AI Key：请在环境变量设置 GEMINI_API_KEY 等）"
                    : "基础评分（AI 调用失败：请检查 Key 是否有效或网络是否可访问）"}
                </p>
              )}
            </div>

            {/* Three-way comparison: internal marker, AI scorer, and their
                rounded average. The internal marker always runs; the AI scorer
                is shown (greyed out when no provider graded) and the average
                is computed only when both are present. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Internal marker (local rule-based) */}
              <div className="rounded-2xl border-2 border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    本地评分
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums text-white shadow-sm ${scoreColorClass(
                      grade.internal.score,
                    )}`}
                  >
                    {grade.internal.score}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  规则扣分（拼写/词序/内容/多余）
                </p>
                {grade.internal.deductions.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {grade.internal.deductions.map((d, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-[11px] font-medium text-slate-600"
                      >
                        <span>{d.label} ×{d.count}</span>
                        <span className="tabular-nums text-rose-500">
                          −{d.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[11px] font-medium text-emerald-600">
                    无扣分
                  </p>
                )}
              </div>

              {/* AI scorer — always shown; greyed out when no provider graded */}
              <div
                className={`rounded-2xl border-2 p-3.5 ${
                  grade.ai
                    ? "border-indigo-200 bg-indigo-50/60"
                    : "border-slate-200 bg-slate-50 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                    AI 评分
                  </span>
                  {grade.ai ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums text-white shadow-sm ${scoreColorClass(
                        grade.ai.score,
                      )}`}
                    >
                      {grade.ai.score}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-300 px-2.5 py-0.5 text-sm font-black tabular-nums text-white">
                      —
                    </span>
                  )}
                </div>
                {grade.ai ? (
                  <>
                    <p className="mt-1 text-[11px] font-semibold capitalize text-indigo-400">
                      {grade.ai.provider} · 综合评分
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {grade.ai.strengths.slice(0, 2).map((s, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                        >
                          {s}
                        </span>
                      ))}
                      {grade.ai.corrections.slice(0, 2).map((c, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
                    {grade.fallbackReason === "no_provider"
                      ? "未配置 AI Key"
                      : "AI 未评分"}
                  </p>
                )}
              </div>

              {/* Average of the two scores (only when both graded) */}
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    平均分
                  </span>
                  {grade.average !== undefined ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums text-white shadow-sm ${scoreColorClass(
                        grade.average,
                      )}`}
                    >
                      {grade.average}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-300 px-2.5 py-0.5 text-sm font-black tabular-nums text-white">
                      —
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] font-semibold text-emerald-500">
                  （本地 + AI）÷ 2
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-emerald-600">
                  {grade.average !== undefined
                    ? "两套打分的综合结果"
                    : "需 AI 评分后计算"}
                </p>
              </div>
            </div>

            {/* What the learner wrote, with mistakes marked in red */}
            <div className="rounded-2xl border-2 border-lingo-border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-lingo-text-light">
                  Your writing
                </span>
                {hasMarkedWords && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                    <span className="inline-block h-2 w-2 rounded-sm bg-rose-400" />
                    需修改的词
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-lingo-text">
                {writingSegments.map((seg, i) =>
                  seg.error ? (
                    <mark
                      key={i}
                      className="rounded bg-rose-100 px-0.5 font-semibold text-rose-600 underline decoration-rose-500 decoration-wavy underline-offset-2"
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </p>
            </div>

            {/* Feedback */}
            {grade.strengths.length > 0 && (
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-4">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  What you did well
                </span>
                <ul className="mt-1.5 space-y-1">
                  {grade.strengths.map((s, i) => (
                    <li
                      key={i}
                      className="text-sm font-medium text-emerald-900"
                    >
                      • {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {grade.corrections.length > 0 && (
              <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-4">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  How to improve
                </span>
                <ul className="mt-1.5 space-y-1">
                  {grade.corrections.map((c, i) => (
                    <li
                      key={i}
                      className="text-sm font-medium text-amber-900"
                    >
                      • {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* The model passage */}
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-4">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Model writing
              </span>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-blue-900">
                {exercise.answer}
              </p>
              {(exercise.acceptAlso ?? []).length > 0 && (
                <>
                  <span className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-blue-600">
                    Another way to write it
                  </span>
                  {(exercise.acceptAlso ?? []).map((alt, i) => (
                    <p
                      key={i}
                      className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-blue-800"
                    >
                      {alt}
                    </p>
                  ))}
                </>
              )}
            </div>

            <Button
              onClick={onContinue}
              variant={grade.passed ? "primary" : "danger"}
              className="w-full"
            >
              <Check className="h-4 w-4" />
              Continue
            </Button>
          </div>
        )}

        {/* Submit */}
        {phase !== "result" && (
          <div className="mt-4 w-full px-1">
            <Button
              onClick={() => void handleSubmit()}
              loading={phase === "grading"}
              disabled={!essay.trim()}
              className="w-full"
            >
              Submit
            </Button>
          </div>
        )}

        {/* Hint line */}
        {phase === "writing" && !error && (
          <p className="mt-3 text-center text-[11px] font-medium text-lingo-text-light">
            写完整的一篇英文短文，Shift+Enter 提交 · 满分 100，70 分及格
          </p>
        )}
      </div>
    </ExerciseShell>
  );
}
