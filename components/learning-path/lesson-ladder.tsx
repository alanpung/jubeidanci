"use client";

import Link from "next/link";
import { Fragment } from "react";

export type LadderState = "completed" | "current" | "locked";

export interface LadderLesson {
  state: LadderState;
  href: string;
  /** Lesson title, used as the hover/aria label for the number bubble. */
  title?: string;
  /** Public preview: locked bubbles still have to lead to the sign-up page. */
  clickableWhenLocked?: boolean;
}

interface LessonLadderProps {
  lessons: LadderLesson[];
  color: string;
}

/** Five per row keeps every unit on screen without scrolling. */
const PER_ROW = 5;

function Dash({ completed, color }: { completed: boolean; color: string }) {
  return (
    <span
      aria-hidden
      className="mx-0.5 h-1 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: completed ? color : "#E5E5E5" }}
    />
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

export function LessonNode({
  state,
  href,
  color,
  index,
  title,
  clickableWhenLocked = false,
}: LadderLesson & { color: string; index: number }) {
  const label = `Lesson ${index + 1}`;
  const bubbleClass = "flex h-11 w-11 items-center justify-center rounded-full border-b-4";

  if (state === "locked") {
    const bubble = (
      <div
        className={`${bubbleClass} border-lingo-gray-dark bg-lingo-gray opacity-60`}
      >
        <LockIcon className="h-5 w-5 text-lingo-gray-dark" />
      </div>
    );

    return (
      <div className="flex items-center" title={title ?? label} aria-label={label}>
        {clickableWhenLocked ? (
          <Link href={href} className="transition-transform hover:scale-110">
            {bubble}
          </Link>
        ) : (
          bubble
        )}
      </div>
    );
  }

  const isCompleted = state === "completed";

  return (
    <Link
      href={href}
      prefetch
      className="group flex items-center"
      title={title ?? label}
      aria-label={label}
    >
      <div
        className={`${bubbleClass} transition-transform group-hover:scale-110 ${
          isCompleted ? "border-yellow-500 bg-lingo-yellow" : "animate-pulse-glow"
        }`}
        style={
          isCompleted
            ? undefined
            : { backgroundColor: color, borderColor: color + "cc" }
        }
      >
        {isCompleted ? (
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
        ) : (
          <span className="text-lg font-black text-white">{index + 1}</span>
        )}
      </div>
    </Link>
  );
}

/**
 * Horizontal ladder: 1-2-3-4-5 on the first row, 6-7-8-9-10 on the second, and
 * so on. The old vertical zigzag needed a scroll for anything past ~4 lessons
 * and hid the unit behind the fold.
 */
export function LessonLadder({ lessons, color }: LessonLadderProps) {
  const rows: LadderLesson[][] = [];
  for (let i = 0; i < lessons.length; i += PER_ROW) {
    rows.push(lessons.slice(i, i + PER_ROW));
  }

  return (
    <div className="flex w-full flex-col items-center gap-y-3">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-center justify-center">
          {row.map((lesson, i) => {
            const index = rowIndex * PER_ROW + i;
            return (
              <Fragment key={index}>
                {i > 0 && (
                  <Dash completed={lesson.state === "completed"} color={color} />
                )}
                <LessonNode
                  {...lesson}
                  index={index}
                  color={color}
                />
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}
