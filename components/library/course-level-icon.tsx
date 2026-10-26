import React from "react";
import {
  Layers,
  Languages,
  ListChecks,
  PenLine,
  Puzzle,
  Headphones,
  LayoutGrid,
  Mic,
  Shuffle,
  BookOpen,
} from "lucide-react";
import { normalizeQuestionType } from "@/lib/content/question-types";

const LEVEL_STYLES: Record<
  string,
  { bg: string; border: string; text: string; pill: string }
> = {
  A1: {
    bg: "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-600/30",
    border: "border-emerald-300/60",
    text: "text-white",
    pill: "bg-emerald-500 text-white",
  },
  A2: {
    bg: "bg-gradient-to-br from-teal-400 to-cyan-600 shadow-cyan-600/30",
    border: "border-teal-300/60",
    text: "text-white",
    pill: "bg-teal-500 text-white",
  },
  B1: {
    bg: "bg-gradient-to-br from-sky-400 to-blue-600 shadow-blue-600/30",
    border: "border-sky-300/60",
    text: "text-white",
    pill: "bg-blue-500 text-white",
  },
  B2: {
    bg: "bg-gradient-to-br from-indigo-400 to-violet-600 shadow-violet-600/30",
    border: "border-indigo-300/60",
    text: "text-white",
    pill: "bg-indigo-500 text-white",
  },
  C1: {
    bg: "bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-fuchsia-600/30",
    border: "border-purple-300/60",
    text: "text-white",
    pill: "bg-purple-600 text-white",
  },
  C2: {
    bg: "bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-600/30",
    border: "border-rose-300/60",
    text: "text-white",
    pill: "bg-rose-500 text-white",
  },
};

const DEFAULT_STYLE = {
  bg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/30",
  border: "border-amber-300/60",
  text: "text-white",
  pill: "bg-amber-500 text-white",
};

const QUESTION_TYPE_VISUALS: Record<
  string,
  {
    bg: string;
    border: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  "flashcard-review": {
    bg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/30",
    border: "border-amber-300/70",
    label: "Flashcards",
    Icon: Layers,
  },
  translation: {
    bg: "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-600/30",
    border: "border-indigo-300/70",
    label: "Translation",
    Icon: Languages,
  },
  "multiple-choice": {
    bg: "bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-600/30",
    border: "border-blue-300/70",
    label: "Multiple Choice",
    Icon: ListChecks,
  },
  "fill-in-the-blank": {
    bg: "bg-gradient-to-br from-purple-400 to-purple-600 shadow-purple-600/30",
    border: "border-purple-300/70",
    label: "Fill in Blank",
    Icon: PenLine,
  },
  "matching-pairs": {
    bg: "bg-gradient-to-br from-pink-400 to-rose-500 shadow-rose-500/30",
    border: "border-pink-300/70",
    label: "Matching Pairs",
    Icon: Puzzle,
  },
  listening: {
    bg: "bg-gradient-to-br from-cyan-400 to-teal-600 shadow-teal-600/30",
    border: "border-cyan-300/70",
    label: "Listening",
    Icon: Headphones,
  },
  "word-bank": {
    bg: "bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-600/30",
    border: "border-amber-300/70",
    label: "Word Bank",
    Icon: LayoutGrid,
  },
  speaking: {
    bg: "bg-gradient-to-br from-emerald-400 to-green-600 shadow-green-600/30",
    border: "border-emerald-300/70",
    label: "Speaking",
    Icon: Mic,
  },
  mix: {
    bg: "bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-purple-600/30",
    border: "border-fuchsia-300/70",
    label: "Mixed Practice",
    Icon: Shuffle,
  },
};

export function getCourseLevelStyle(level?: string | null) {
  const key = (level || "A1").toUpperCase().trim();
  return LEVEL_STYLES[key] || DEFAULT_STYLE;
}

export function resolveCourseQuestionType(
  title?: string | null,
  courseId?: string | null,
  questionType?: string | null
) {
  if (questionType) {
    const q = normalizeQuestionType(questionType);
    if (q && QUESTION_TYPE_VISUALS[q.id]) return QUESTION_TYPE_VISUALS[q.id];
  }
  const combined = `${title || ""} ${courseId || ""}`.toLowerCase();
  const detected = normalizeQuestionType(combined);
  if (detected && QUESTION_TYPE_VISUALS[detected.id]) {
    return QUESTION_TYPE_VISUALS[detected.id];
  }
  return null;
}

export function CourseLevelIcon({
  level,
  title,
  courseId,
  questionType,
  size = "md",
}: {
  level?: string | null;
  title?: string | null;
  courseId?: string | null;
  questionType?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const cleanLevel = (level || "A1").toUpperCase().trim();
  const levelStyle = getCourseLevelStyle(cleanLevel);
  const typeVisual = resolveCourseQuestionType(title, courseId, questionType);

  const sizeClasses =
    size === "sm"
      ? "h-10 w-10 rounded-xl text-sm"
      : size === "lg"
      ? "h-14 w-14 rounded-2xl text-xl"
      : "h-12 w-12 rounded-xl text-base";

  const iconSizeClasses =
    size === "sm"
      ? "h-5 w-5"
      : size === "lg"
      ? "h-7 w-7"
      : "h-6 w-6";

  if (typeVisual) {
    const IconComponent = typeVisual.Icon;
    return (
      <div
        title={`${cleanLevel} · ${typeVisual.label}`}
        className={`relative flex shrink-0 items-center justify-center border-2 text-white shadow-sm select-none ${sizeClasses} ${typeVisual.bg} ${typeVisual.border}`}
      >
        <IconComponent className={`${iconSizeClasses} stroke-[2.25]`} />
        <span
          className={`absolute -bottom-1 -right-1 rounded-md px-1 py-0.2 text-[9px] leading-tight font-black border border-white shadow-2xs ${levelStyle.pill}`}
        >
          {cleanLevel}
        </span>
      </div>
    );
  }

  return (
    <div
      title={`Level ${cleanLevel}`}
      className={`relative flex shrink-0 items-center justify-center border-2 font-black tracking-tight shadow-sm select-none ${sizeClasses} ${levelStyle.bg} ${levelStyle.border} ${levelStyle.text}`}
    >
      <BookOpen className={`${iconSizeClasses} stroke-[2.25]`} />
      <span
        className={`absolute -bottom-1 -right-1 rounded-md px-1 py-0.2 text-[9px] leading-tight font-black border border-white shadow-2xs ${levelStyle.pill}`}
      >
        {cleanLevel}
      </span>
    </div>
  );
}

/** A full-bleed course cover.
 *
 *  The *whole* tile is the colour — the symbol sits directly on the gradient
 *  instead of floating inside a white card. Every surface (Library folders,
 *  My Favorite, the browse window) draws its tiles with this one component,
 *  so a book always looks the same wherever it shows up.
 *
 *  `glyph` replaces the symbol (level folders show their CEFR code instead of
 *  a type icon); `questionType` decides the colour + symbol when the entry
 *  has no title-derived type of its own. */
export function CourseCover({
  level,
  questionType,
  title,
  courseId,
  glyph,
  showLevel = true,
  className = "",
}: {
  level?: string | null;
  questionType?: string | null;
  title?: string | null;
  courseId?: string | null;
  glyph?: React.ReactNode;
  showLevel?: boolean;
  className?: string;
}) {
  const cleanLevel = (level || "").toUpperCase().trim();
  const levelStyle = getCourseLevelStyle(cleanLevel);
  const typeVisual = resolveCourseQuestionType(title, courseId, questionType);
  const Icon = typeVisual?.Icon ?? BookOpen;
  const bg = typeVisual?.bg ?? levelStyle.bg;
  const border = typeVisual?.border ?? levelStyle.border;

  return (
    <div
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 text-white shadow-sm ${bg} ${border} ${className}`}
    >
      {glyph ?? <Icon className="h-9 w-9 stroke-[2.25]" />}
      {showLevel && cleanLevel ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md border border-white/40 bg-black/25 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
          {cleanLevel}
        </span>
      ) : null}
    </div>
  );
}

/** Stable list of every course "symbol" and what it stands for — used by the
 *  library folders and browse window so students can decode the book covers. */
export const QUESTION_TYPE_LEGEND = Object.entries(QUESTION_TYPE_VISUALS).map(
  ([id, v]) => ({ id, label: v.label, Icon: v.Icon, bg: v.bg }),
);

