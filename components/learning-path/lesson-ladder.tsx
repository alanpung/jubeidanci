"use client";

import Link from "next/link";
import { Lock, Star, Play } from "lucide-react";

export type LadderState = "completed" | "current" | "locked";

export interface LadderLesson {
  state: LadderState;
  href: string;
  /** Lesson title, used as the hover/aria label for the row. */
  title?: string;
  /** Public preview: locked bubbles still have to lead to the sign-up page. */
  clickableWhenLocked?: boolean;
}

interface LessonLadderProps {
  lessons: LadderLesson[];
  color: string;
}

/**
 * Vertical list of rounded "pill" buttons — one per lesson, stacked top to
 * bottom (Lesson 1 on top, Lesson N at the bottom). Replaces the old circular
 * star/number bubbles, which read as scattered icons rather than a clear
 * pick-list. The whole row is the hit target, with a state badge on the right:
 *   - completed : yellow, star badge
 *   - current   : unit-colour outline + glow, play badge ("start here")
 *   - locked    : grey, lock badge (links only when clickableWhenLocked)
 */
export function LessonLadder({ lessons, color }: LessonLadderProps) {
  return (
    <div className="flex w-full flex-col gap-2">
      {lessons.map((lesson, index) => (
        <LessonRow
          key={index}
          {...lesson}
          index={index}
          color={color}
        />
      ))}
    </div>
  );
}

function LessonRow({
  state,
  href,
  color,
  index,
  title,
  clickableWhenLocked = false,
}: LadderLesson & { color: string; index: number }) {
  const label = `Lesson ${index + 1}`;
  const isCompleted = state === "completed";
  const isLocked = state === "locked";

  const badge =
    isCompleted ? (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-white shadow-sm">
        <Star className="h-4 w-4 fill-white" />
      </span>
    ) : isLocked ? (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lingo-gray-dark text-white shadow-sm">
        <Lock className="h-3.5 w-3.5" />
      </span>
    ) : (
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        <Play className="h-3.5 w-3.5 fill-white" />
      </span>
    );

  const rowClass = isLocked
    ? "border-lingo-gray-dark bg-lingo-gray opacity-70"
    : isCompleted
      ? "border-yellow-300 bg-yellow-50 hover:bg-yellow-100"
      : "border-2 hover:-translate-y-0.5 transition-transform";

  const rowStyle =
    !isLocked && !isCompleted ? { borderColor: color, backgroundColor: color + "14" } : undefined;

  const inner = (
    <div
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-3.5 py-3 ${rowClass}`}
      style={rowStyle}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black ${
            isLocked
              ? "bg-white/70 text-lingo-gray-dark"
              : isCompleted
                ? "bg-yellow-400 text-white"
                : "text-white"
          }`}
          style={!isLocked && !isCompleted ? { backgroundColor: color } : undefined}
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-lingo-text">{label}</p>
          {title && (
            <p className="truncate text-[11px] font-medium text-lingo-text-light">
              {title}
            </p>
          )}
        </div>
      </div>
      {badge}
    </div>
  );

  if (isLocked && !clickableWhenLocked) {
    return (
      <div className="cursor-not-allowed" title={title ?? label} aria-label={label}>
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      prefetch
      className="group"
      title={title ?? label}
      aria-label={label}
    >
      {inner}
    </Link>
  );
}
