"use client";

import type { ComponentType, ReactNode } from "react";
import {
  QUESTION_TYPE_LEGEND,
  resolveCourseQuestionType,
  getCourseLevelStyle,
} from "@/components/library/course-level-icon";

/** One folder tile. A type folder carries an `Icon`; a level folder carries a
 *  `border` accent and renders its own CEFR code as the glyph. Keeping both on
 *  one optional-field shape (rather than a discriminated union) lets the grid
 *  below treat either grouping uniformly. */
interface FolderItem {
  key: string;
  label: string;
  bg: string;
  border?: string;
  Icon?: ComponentType<{ className?: string }>;
  isType: boolean;
}

/**
 * The "Library" section of /library.
 *
 * Students choose how to browse with the two-button toggle:
 *   - "By Level"  → six CEFR folders (A1–C2)  [DEFAULT]
 *   - "By Type"   → eight exercise-type folders (Flashcards, Translation, …)
 *
 * Tapping a folder does NOT navigate — it opens the small browser window
 * (`TypeBrowserWindow` in course-book-shelf) listing every course of that
 * level/type, where a +/× toggle adds to / removes from My Favorite. The window is
 * rendered *inside* this section (as children) so it never covers the My Favorite
 * shelf above it.
 */

const FOLDER_ORDER = [
  "flashcard-review",
  "translation",
  "multiple-choice",
  "fill-in-the-blank",
  "matching-pairs",
  "listening",
  "word-bank",
  "speaking",
];

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

export type GroupBy = "level" | "type";

interface LibraryFoldersProps {
  /** Current grouping mode. */
  groupBy: GroupBy;
  /** Switch grouping mode (resets the open folder). */
  onGroupBy: (g: GroupBy) => void;
  /** Label (level or type) of the open folder, if any. */
  activeKey: string | null;
  /** Open/close the folder with this key. */
  onOpenKey: (key: string | null) => void;
  /** The browser window, rendered inside the Library section. */
  children?: ReactNode;
}

export function LibraryFolders({
  groupBy,
  onGroupBy,
  activeKey,
  onOpenKey,
  children,
}: LibraryFoldersProps) {
  const typeFolders: FolderItem[] = FOLDER_ORDER.map((id) => {
    const found = QUESTION_TYPE_LEGEND.find((f) => f.id === id);
    const visual = resolveCourseQuestionType(undefined, undefined, id);
    const label = found?.label ?? visual?.label ?? id;
    const Icon = found?.Icon ?? visual?.Icon;
    const bg = found?.bg ?? visual?.bg ?? "bg-lingo-gray";
    return { key: label, label, Icon, bg, isType: true };
  }).filter((f) => f.Icon);

  const levelFolders: FolderItem[] = LEVEL_ORDER.map((lvl) => {
    const style = getCourseLevelStyle(lvl);
    return { key: lvl, label: lvl, bg: style.bg, border: style.border, isType: false };
  });

  const folders = groupBy === "type" ? typeFolders : levelFolders;

  // Tidy rows for both groupings: 6 CEFR levels sit 3-up on phones and 6-up
  // from `min-[480px]`; the 8 exercise types stay 4-up so neither grouping
  // leaves a ragged half-row.
  const gridClass =
    groupBy === "type"
      ? "grid grid-cols-4 gap-2.5"
      : "grid grid-cols-3 gap-2.5 min-[480px]:grid-cols-6";

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-lingo-text">Library</h2>

        {/* Two-button grouping toggle. Default = By Level. */}
        <div className="flex shrink-0 rounded-xl border-2 border-lingo-border bg-white p-0.5 text-xs font-bold">
          {(["level", "type"] as GroupBy[]).map((g) => {
            const active = groupBy === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => onGroupBy(g)}
                aria-pressed={active}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  active
                    ? "bg-lingo-green text-white shadow-[0_2px_0_0] shadow-green-700"
                    : "text-lingo-text-light hover:text-lingo-text"
                }`}
              >
                {g === "level" ? "By Level" : "By Type"}
              </button>
            );
          })}
        </div>
      </div>

      {/* relative: the browser window is absolutely positioned over this box on
          phones (covering the folders), and flows inline under it on desktop. */}
      <div className="relative">
        <div className={gridClass}>
          {folders.map((f) => {
            const isActive = activeKey === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onOpenKey(activeKey === f.key ? null : f.key)}
                aria-expanded={isActive}
                aria-label={f.label}
                className={`group flex flex-col items-center gap-1.5 transition-transform active:translate-y-0 ${
                  isActive ? "scale-105" : "hover:-translate-y-0.5"
                }`}
              >
                {/* The colored block IS the tile — no white card behind it, so the
                    grid reads as a row of solid level/type chips. */}
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-white shadow-sm transition-all group-hover:shadow-md sm:h-14 sm:w-14 ${
                    f.bg
                  } ${
                    f.border
                  } ${
                    isActive
                      ? "ring-2 ring-lingo-green ring-offset-2 ring-offset-lingo-bg"
                      : ""
                  }`}
                >
                  {f.isType ? (
                    f.Icon ? <f.Icon className="h-6 w-6 stroke-[2.25]" /> : null
                  ) : (
                    <span className="text-sm font-black sm:text-base">{f.label}</span>
                  )}
                </span>
                {/* Level folders already spell the code inside the block, so only
                    type folders need a caption under the glyph. */}
                {f.isType ? (
                  <span className="text-center text-[10px] font-bold leading-tight text-lingo-text">
                    {f.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* The browser window. On phones it layers over the folders above; from
            `lg` up it settles underneath them. */}
        {children}
      </div>
    </section>
  );
}
