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
  {
    bg: string;
    border: string;
    text: string;
    pill: string;
    /** Very light tint used as the cover fill. */
    light: string;
    /** The coloured outline (border) of the cover. */
    outline: string;
    /** The coloured symbol drawn on the cover. */
    symbol: string;
  }
> = {
  A1: {
    bg: "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-600/30",
    border: "border-emerald-300/60",
    text: "text-white",
    pill: "bg-emerald-500 text-white",
    light: "bg-emerald-50",
    outline: "border-emerald-400",
    symbol: "text-emerald-600",
  },
  A2: {
    bg: "bg-gradient-to-br from-teal-400 to-cyan-600 shadow-cyan-600/30",
    border: "border-teal-300/60",
    text: "text-white",
    pill: "bg-teal-500 text-white",
    light: "bg-teal-50",
    outline: "border-teal-400",
    symbol: "text-teal-600",
  },
  B1: {
    bg: "bg-gradient-to-br from-sky-400 to-blue-600 shadow-blue-600/30",
    border: "border-sky-300/60",
    text: "text-white",
    pill: "bg-blue-500 text-white",
    light: "bg-sky-50",
    outline: "border-sky-400",
    symbol: "text-sky-600",
  },
  B2: {
    bg: "bg-gradient-to-br from-indigo-400 to-violet-600 shadow-violet-600/30",
    border: "border-indigo-300/60",
    text: "text-white",
    pill: "bg-indigo-500 text-white",
    light: "bg-indigo-50",
    outline: "border-indigo-400",
    symbol: "text-indigo-600",
  },
  C1: {
    bg: "bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-fuchsia-600/30",
    border: "border-purple-300/60",
    text: "text-white",
    pill: "bg-purple-600 text-white",
    light: "bg-purple-50",
    outline: "border-purple-400",
    symbol: "text-purple-600",
  },
  C2: {
    bg: "bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-600/30",
    border: "border-rose-300/60",
    text: "text-white",
    pill: "bg-rose-500 text-white",
    light: "bg-rose-50",
    outline: "border-rose-400",
    symbol: "text-rose-600",
  },
};

const DEFAULT_STYLE = {
  bg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/30",
  border: "border-amber-300/60",
  text: "text-white",
  pill: "bg-amber-500 text-white",
  light: "bg-amber-50",
  outline: "border-amber-400",
  symbol: "text-amber-600",
};

const QUESTION_TYPE_VISUALS: Record<
  string,
  {
    bg: string;
    border: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    pill: string;
    light: string;
    outline: string;
    symbol: string;
  }
> = {
  "flashcard-review": {
    bg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/30",
    border: "border-amber-300/70",
    label: "Flashcards",
    Icon: Layers,
    pill: "bg-amber-500 text-white",
    light: "bg-amber-50",
    outline: "border-amber-400",
    symbol: "text-amber-600",
  },
  translation: {
    bg: "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-600/30",
    border: "border-indigo-300/70",
    label: "Translation",
    Icon: Languages,
    pill: "bg-indigo-500 text-white",
    light: "bg-indigo-50",
    outline: "border-indigo-400",
    symbol: "text-indigo-600",
  },
  "multiple-choice": {
    bg: "bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-600/30",
    border: "border-blue-300/70",
    label: "Multiple Choice",
    Icon: ListChecks,
    pill: "bg-blue-500 text-white",
    light: "bg-blue-50",
    outline: "border-blue-400",
    symbol: "text-blue-600",
  },
  "fill-in-the-blank": {
    bg: "bg-gradient-to-br from-purple-400 to-purple-600 shadow-purple-600/30",
    border: "border-purple-300/70",
    label: "Fill in Blank",
    Icon: PenLine,
    pill: "bg-purple-500 text-white",
    light: "bg-purple-50",
    outline: "border-purple-400",
    symbol: "text-purple-600",
  },
  "matching-pairs": {
    bg: "bg-gradient-to-br from-pink-400 to-rose-500 shadow-rose-500/30",
    border: "border-pink-300/70",
    label: "Matching Pairs",
    Icon: Puzzle,
    pill: "bg-rose-500 text-white",
    light: "bg-rose-50",
    outline: "border-rose-400",
    symbol: "text-rose-600",
  },
  listening: {
    bg: "bg-gradient-to-br from-cyan-400 to-teal-600 shadow-teal-600/30",
    border: "border-cyan-300/70",
    label: "Listening",
    Icon: Headphones,
    pill: "bg-cyan-500 text-white",
    light: "bg-cyan-50",
    outline: "border-cyan-400",
    symbol: "text-cyan-600",
  },
  "word-bank": {
    bg: "bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-600/30",
    border: "border-amber-300/70",
    label: "Word Bank",
    Icon: LayoutGrid,
    pill: "bg-amber-500 text-white",
    light: "bg-amber-50",
    outline: "border-amber-400",
    symbol: "text-amber-600",
  },
  speaking: {
    bg: "bg-gradient-to-br from-emerald-400 to-green-600 shadow-green-600/30",
    border: "border-emerald-300/70",
    label: "Speaking",
    Icon: Mic,
    pill: "bg-emerald-500 text-white",
    light: "bg-emerald-50",
    outline: "border-emerald-400",
    symbol: "text-emerald-600",
  },
  mix: {
    bg: "bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-purple-600/30",
    border: "border-fuchsia-300/70",
    label: "Mixed Practice",
    Icon: Shuffle,
    pill: "bg-fuchsia-500 text-white",
    light: "bg-fuchsia-50",
    outline: "border-fuchsia-400",
    symbol: "text-fuchsia-600",
  },
};

export function getCourseLevelStyle(level?: string | null) {
  const key = (level || "A1").toUpperCase().trim();
  return LEVEL_STYLES[key] || DEFAULT_STYLE;
}

export function resolveCourseQuestionType(
  title?: string | null,
  courseId?: string | null,
  questionType?: string | null,
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

/** CEFR code → plain-English descriptor, drawn to the right of the code on a
 *  level folder's cover so the tile reads "A1 · Beginner", etc. */
export const LEVEL_LABELS: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Mastery",
};

/** A light "book" cover — ONE anatomy for every surface on /library.
 *
 *  Layout:  [symbol]  [name]  — centred as a group, so the symbol sits closer
 *  to the middle of the tile (and clear of the corner badges) and the title
 *  always reads to its right, inside the cover.
 *
 *  The SYMBOL is a solid, fully-coloured tile with a white glyph — exactly the
 *  symbols shown in the legend (blue Multiple Choice, purple Translation, …).
 *  A *level* folder instead wears a round colour badge carrying its CEFR code
 *  (A1–C2), so a level tile and a type tile are told apart at a glance.
 *
 *  The fill is a *very light* tint; only the outline (border) carries the full
 *  colour. A course's CEFR level is a small round badge in the LOWER-RIGHT
 *  corner. `children` are the other corner controls (visibility badge,
 *  add/remove ×, owner edit button) rendered INSIDE the cover. */
export function CourseCover({
  level,
  questionType,
  title,
  courseId,
  glyph,
  name,
  levelAsSymbol = false,
  showLevel = true,
  className = "",
  children,
}: {
  level?: string | null;
  questionType?: string | null;
  title?: string | null;
  courseId?: string | null;
  glyph?: React.ReactNode;
  name?: string | null;
  levelAsSymbol?: boolean;
  showLevel?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const cleanLevel = (level || "").toUpperCase().trim();
  const levelStyle = getCourseLevelStyle(cleanLevel);
  const typeVisual = resolveCourseQuestionType(title, courseId, questionType);
  const visual = typeVisual ?? levelStyle;
  const Icon = (typeVisual?.Icon ?? BookOpen) as React.ComponentType<{
    className?: string;
  }>;

  return (
    <div
      className={`relative flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-3 pt-7 pb-7 shadow-sm ${visual.light} ${visual.outline} ${className}`}
    >
      {/* Symbol — grouped with the title and centred, so it never collides with
          the top-left visibility badge.

          A level folder wears a ROUND colour badge with its CEFR code; every
          other cover wears the solid, filled symbol tile from the legend. */}
      {levelAsSymbol ? (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-white shadow-sm ${levelStyle.bg} ${levelStyle.border}`}
        >
          <span className="text-2xl font-black leading-none tracking-tight">
            {cleanLevel}
          </span>
        </span>
      ) : (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 text-white shadow-sm [&_svg]:h-6 [&_svg]:w-6 ${visual.bg} ${visual.border}`}
        >
          {glyph ?? <Icon className="h-6 w-6 stroke-[2.25]" />}
        </span>
      )}

      {/* Title — inside the cover, to the right of the symbol. Its width is
          capped (no flex-grow) so the symbol + title stay a centred group. */}
      {name ? (
        <span className="line-clamp-2 min-w-0 max-w-[58%] text-[13px] font-black leading-tight text-lingo-text">
          {name}
        </span>
      ) : null}

      {/* CEFR level — a small round badge in the LOWER-RIGHT corner. */}
      {showLevel && cleanLevel && !levelAsSymbol ? (
        <span
          className={`absolute right-1 bottom-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] leading-none font-black text-white shadow-sm ${levelStyle.pill}`}
        >
          {cleanLevel}
        </span>
      ) : null}

      {children}
    </div>
  );
}

/** Stable list of every course "symbol" and what it stands for — used by the
 *  library folders and browse window so students can decode the book covers. */
export const QUESTION_TYPE_LEGEND = Object.entries(QUESTION_TYPE_VISUALS).map(
  ([id, v]) => ({ id, label: v.label, Icon: v.Icon, bg: v.bg }),
);
