"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Volume2, ChevronLeft, ChevronRight, Check, RotateCcw, Eye, Languages } from "lucide-react";
import type { WritingExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { useMobileKeyboardOpen } from "@/hooks/use-mobile-keyboard-open";
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

/** The model passage, shared by the graded result and the instant-reveal view. */
function ModelAnswerPanel({ exercise }: { exercise: WritingExercise }) {
  return (
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
      {/* Chinese translation of the model essay, shown below it. */}
      {exercise.modelAnswerZh?.trim() && (
        <div className="mt-3 border-t border-blue-200 pt-3">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-blue-600">
            中文翻译
          </span>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-blue-800">
            {exercise.modelAnswerZh}
          </p>
        </div>
      )}
    </div>
  );
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
}: Props) {
  const [phase, setPhase] = useState<Phase>("writing");
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // B2 / Advanced only: the Chinese model essay is shown above the textarea
  // as a writing hint, independent of the graded/ungraded result view.
  const [showChineseModel, setShowChineseModel] = useState(false);
  const isKeyboardOpen = useMobileKeyboardOpen();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { status } = useExercise();
  const { play, stop, prefetch } = useAudio();

  // Reset whenever a different exercise is shown.
  useEffect(() => {
    setPhase("writing");
    setEssay("");
    setGrade(null);
    setError(null);
    setShowChineseModel(false);
  }, [exercise.sentence, exercise.answer]);

  // Warm the TTS audio for the Chinese essay so the 中文 button responds
  // instantly. B2 / Advanced have no Chinese source text, so there is nothing
  // to prefetch for them.
  useEffect(() => {
    if (exercise.noAudio?.includes("sentence")) return;
    const zh = exercise.chineseEssay?.trim();
    if (!zh) return;
    prefetch([zh], "zh");
  }, [exercise.chineseEssay, prefetch, exercise.noAudio]);

  const wordCount = useMemo(
    () => essay.trim().split(/\s+/).filter(Boolean).length,
    [essay],
  );

  const chineseModel = exercise.modelAnswerZh?.trim() ?? "";
  // B2 ("B2") and Advanced ("C1") have no Chinese source text in the prompt,
  // so their Chinese model essay is offered separately as a writing hint.
  // Other levels already show a Chinese essay in the prompt card and keep the
  // single "Reveal answer" button. The field-based fallback also covers stored
  // content whose unit frontmatter has no level.
  const hasSplitModelButtons =
    exercise.level === "B2" ||
    exercise.level === "C1" ||
    (!!chineseModel && !exercise.chineseEssay?.trim());

  /**
   * The Chinese prompt sent to the grader.
   *
   * When a Chinese essay exists (A1 / A2 / B1) we send just that — it is the
   * exact source text the learner translated, so the grader's "meaning
   * coverage" check is precise. For B2 / Advanced there is no Chinese essay,
   * so we fall back to the whole prompt (topic + requirements + hints), which
   * still tells the grader what was asked for.
   */
  const gradingPrompt = useMemo(() => {
    const zh = exercise.chineseEssay?.trim();
    if (zh) return zh;
    return exercise.sentence;
  }, [exercise.chineseEssay, exercise.sentence]);

  /**
   * The prompt card is rendered in three parts when a Chinese essay is
   * present:
   *
   *   1. the instruction block — topic and requirements (always first);
   *   2. the Chinese essay (中文范文 / 中文结构提示) in its own tinted panel;
   *   3. the vocabulary hints (B1 / B2 / Advanced only).
   *
   * The Chinese essay itself lives in the dedicated `chineseEssay` field —
   * it is NOT embedded in `sentence` — so it can never be rendered twice.
   *
   * Without a Chinese essay (B2 / Advanced) the whole `sentence` is shown as
   * one instruction block, exactly as before.
   */
  const { chineseEssay, instructionBefore, instructionAfter, chineseLabel } = useMemo(() => {
    const zh = exercise.chineseEssay?.trim();
    if (!zh) {
      return {
        chineseEssay: null,
        instructionBefore: [],
        instructionAfter: [],
        chineseLabel: "",
      };
    }

    // `sentence` holds "topic || requirements [|| vocabulary hints]".
    // Everything up to the vocabulary hints is the instruction block; the
    // hints themselves go below the Chinese essay.
    const lines = exercise.sentence
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");

    const hintIndex = lines.findIndex((l) => l.startsWith("Key vocabulary"));

    const before = hintIndex === -1 ? lines : lines.slice(0, hintIndex);
    const after = hintIndex === -1 ? [] : lines.slice(hintIndex);

    return {
      chineseEssay: zh,
      instructionBefore: before,
      instructionAfter: after,
      chineseLabel: exercise.level === "B1" ? "中文结构提示" : "中文范文",
    };
  }, [exercise.chineseEssay, exercise.sentence, exercise.level]);

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
          promptZh: gradingPrompt,
          modelAnswer: exercise.answer,
          acceptAlso: exercise.acceptAlso ?? [],
          core: exercise.core ?? "",
          level: exercise.level ?? "A2",
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
  }, [essay, phase, gradingPrompt, exercise.answer, exercise.acceptAlso, exercise.noAudio, onResult, play]);

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

  /**
   * Instant reveal — skips grading entirely and jumps straight to the model
   * answer (plus its Chinese translation). It is recorded as an incorrect
   * result because the learner did not produce the answer themselves, which
   * keeps the lesson's mistake count honest. Continue / Next then works just
   * like it does after a graded submission.
   */
  const handleReveal = useCallback(() => {
    if (phase !== "writing") return;
    setGrade(null);
    setError(null);
    setPhase("result");
    onResult(false, exercise.answer);

    if (!exercise.noAudio?.includes("answer")) {
      play(exercise.answer, "en");
    }
  }, [phase, exercise.answer, exercise.noAudio, onResult, play]);

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

        {/* Instruction — hidden while the keyboard is open to save vertical space */}
        {!isKeyboardOpen && (
          <h1 className="mb-3 text-center text-lg font-black text-lingo-text sm:text-xl">
            {exercise.text}
          </h1>
        )}

        {/* The complete Chinese prompt — plain text on purpose. No HoverableText,
            so no hover lookup, no POS, no IPA, no gloss.

            MOBILE TYPING MODE: when the on-screen keyboard opens we switch to a
            full-height flex column. The Chinese essay is pinned at the TOP
            (shrink-0, never scrolls away) and the English textarea gets its OWN
            internal scroller (flex-1 min-h-0 overflow-y-auto). The question
            therefore stays visible at the top the whole time and the learner
            never has to scroll the page up to read it. */}
        {/* The complete Chinese prompt — plain text on purpose. No HoverableText,
            so no hover lookup, no POS, no IPA, no gloss.

            MOBILE TYPING MODE: when the on-screen keyboard opens we make this card
            STICKY just BELOW the app's 64px top bar (top-16), with a higher
            z-index and an opaque background. As the page scrolls to keep the
            textarea above the keyboard, the Chinese essay stays pinned under the
            header and remains fully visible — the learner never has to scroll up
            to read it, and the English text (a separate block below) never
            overlaps it. */}
        <div
          className={`w-full rounded-2xl border-2 border-lingo-border p-3 sm:p-4 ${
            isKeyboardOpen && phase !== "result"
              ? "sticky top-16 z-40 bg-white shadow-md text-sm leading-snug max-h-[30vh] overflow-y-auto"
              : "bg-lingo-gray/20 text-base leading-relaxed text-lingo-text sm:text-lg"
          }`}
        >
          {/*
            The prompt card is rendered in two parts when a Chinese essay is
            present:

              1. the instruction block — topic, requirements and vocabulary
                 hints (always English, always shown);
              2. the Chinese essay (中文范文 / 中文结构提示) — the source text
                 the learner translates.

            Splitting them lets us style the Chinese essay distinctly (own
            tinted panel) so the learner immediately sees "this is the text I
            must render in English" without having to hunt for it.

            Without a Chinese essay (B2 / Advanced) the whole `sentence` is
            rendered as one instruction block, exactly as before.
          */}
          {chineseEssay ? (
            <div className="space-y-2.5">
              {/* Topic + requirements */}
              <p className="whitespace-pre-wrap text-lingo-text">
                {instructionBefore.join("\n")}
              </p>

              {/* The Chinese essay the learner translates */}
              <div className="rounded-xl border border-lingo-border/70 bg-white/70 px-3 py-2.5">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-lingo-text-light">
                  {chineseLabel}
                </span>
                <p className="whitespace-pre-wrap text-lingo-text">
                  {chineseEssay}
                </p>
              </div>

              {/* Vocabulary hints */}
              {instructionAfter.length > 0 && (
                <p className="whitespace-pre-wrap text-lingo-text">
                  {instructionAfter.join("\n")}
                </p>
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-lingo-text">{exercise.sentence}</p>
          )}
        </div>

        {/* B2 / Advanced only: the Chinese model essay, toggled by the
            "Chinese Model" button. It sits directly above the textarea so it
            works as a hint while the learner types the English passage. It is
            independent of grading — submitting still grades the learner's own
            writing. */}
        {hasSplitModelButtons && showChineseModel && chineseModel && phase !== "result" && (
          <div
            className={`w-full rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 sm:p-4 ${
              isKeyboardOpen
                ? "relative mt-2 max-h-[22vh] overflow-y-auto text-sm leading-snug"
                : "relative mt-4 text-base leading-relaxed"
            }`}
          >
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              中文范文（写作提示）
            </span>
            <p className="whitespace-pre-wrap text-emerald-900">{chineseModel}</p>
          </div>
        )}

        {/* English textarea — always its own block below the prompt, never
            overlapping it. Grows taller when the keyboard is open. */}
        {phase !== "result" && (
          <textarea
            ref={textareaRef}
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={phase === "grading"}
            placeholder="Write your passage in English here..."
            className={`w-full rounded-2xl border-2 border-lingo-border p-4 text-base leading-relaxed text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none resize-y disabled:opacity-60 ${
              isKeyboardOpen
                ? "relative mt-2 bg-white min-h-[50vh]"
                : "relative mt-4 bg-white min-h-[240px]"
            }`}
            autoFocus
            enterKeyHint="enter"
          />
        )}

        {/* word count + submit hint (non-keyboard layout) */}
        {!isKeyboardOpen && phase !== "result" && (
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-lingo-text-light">
            <span>{wordCount} words</span>
            <span>Shift+Enter 提交 · Enter 换行</span>
          </div>
        )}

        {/* Audio + model buttons:
              - 中文 button — reads the Chinese essay (A1/A2/B1 only). For B2
                and Advanced there is no Chinese source text, so the button is
                hidden entirely rather than showing a disabled control.
              - English button — reads the English model answer. It stays locked
                until the learner has submitted their own writing or revealed
                the answer directly.
              - B2 / Advanced: two buttons replace the single reveal button.
                "English Model" skips grading and shows the model answer in the
                result view; "Chinese Model" toggles the Chinese essay as a
                writing hint above the textarea without ending the exercise.
              - Other levels keep the single "Reveal answer" button.

            All are hidden while the keyboard is open to maximise the writing
            area. */}
        <div className={`mt-4 mb-4 flex flex-wrap items-center justify-center gap-2.5 ${
          isKeyboardOpen ? "hidden" : ""
        }`}>
          {chineseEssay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                play(chineseEssay, "zh");
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-lingo-blue px-3.5 text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold shadow-sm"
              aria-label="播放中文音频"
              title="中文音频"
            >
              <Volume2 className="h-4 w-4" />
              中文
            </button>
          )}
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
            title={phase === "result" ? "英文范文音频" : "提交或显示答案后可播放范文"}
          >
            <Volume2 className="h-4 w-4" />
            English
          </button>
          {phase === "writing" && hasSplitModelButtons && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReveal();
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border-b-2 border-amber-400 bg-amber-100 px-3.5 text-xs font-bold text-amber-800 shadow-sm transition-all hover:bg-amber-200 active:border-b-0 active:mt-0.5"
                aria-label="显示英文范文"
                title="跳过评分，直接显示英文范文"
              >
                <Eye className="h-4 w-4" />
                English Model
              </button>
              {chineseModel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowChineseModel((shown) => !shown);
                  }}
                  aria-pressed={showChineseModel}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border-b-2 px-3.5 text-xs font-bold shadow-sm transition-all active:border-b-0 active:mt-0.5 ${
                    showChineseModel
                      ? "border-emerald-500 bg-emerald-200 text-emerald-900 hover:bg-emerald-300"
                      : "border-emerald-400 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                  }`}
                  aria-label="显示中文范文提示"
                  title={showChineseModel ? "隐藏中文范文提示" : "在输入区上方显示中文范文作为写作提示"}
                >
                  <Languages className="h-4 w-4" />
                  Chinese Model
                </button>
              )}
            </>
          )}
          {phase === "writing" && !hasSplitModelButtons && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReveal();
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border-b-2 border-amber-400 bg-amber-100 px-3.5 text-xs font-bold text-amber-800 shadow-sm transition-all hover:bg-amber-200 active:border-b-0 active:mt-0.5"
              aria-label="直接显示答案"
              title="跳过评分，直接显示范文和中文翻译"
            >
              <Eye className="h-4 w-4" />
              Reveal answer
            </button>
          )}
        </div>

        {/* Navigation row — hidden while the keyboard is open */}
        <div className={`mb-4 flex w-full items-center justify-between gap-2 px-1 ${
          isKeyboardOpen ? "hidden" : ""
        }`}>
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
                  <p className="mt-1 text-[11px] font-semibold capitalize text-indigo-400">
                    {grade.ai.provider} · 综合评分
                  </p>
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
            <ModelAnswerPanel exercise={exercise} />

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

        {/* Instant reveal — no grading took place, so instead of the score and
            feedback panels we show the model answer directly. */}
        {phase === "result" && !grade && (
          <div className={`w-full space-y-4 px-1 ${animClass}`}>
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                Answer revealed
              </span>
              <p className="text-center text-[11px] font-medium text-lingo-text-light">
                未评分 — 直接显示范文和中文翻译
              </p>
            </div>
            <ModelAnswerPanel exercise={exercise} />
            <Button onClick={onContinue} variant="primary" className="w-full">
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
