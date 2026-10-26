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
 * level/type, where a +/× toggle adds to / removes from My Books. The window is
 * rendered *inside* this section (as children) so it never covers the My Books
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
        <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
          {folders.map((f) => {
            const isActive = activeKey === f.key;
            const base =
              "group flex flex-col items-center justify-center rounded-2xl border-2 bg-white transition-all hover:-translate-y-0.5 hover:border-lingo-green hover:shadow-[0_4px_0_0] hover:shadow-lingo-border active:translate-y-0";
            const activeCls = isActive
              ? "border-lingo-green shadow-[0_4px_0_0] shadow-lingo-border"
              : "border-lingo-border";

            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onOpenKey(activeKey === f.key ? null : f.key)}
                aria-expanded={isActive}
                className={`${base} ${activeCls} p-2.5`}
              >
                {f.isType ? (
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm ${f.bg}`}
                  >
                    {f.Icon ? <f.Icon className="h-6 w-6 stroke-[2.25]" /> : null}
                  </span>
                ) : (
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-base font-black text-white shadow-sm ${f.bg} ${f.border}`}
                  >
                    {f.label}
                  </span>
                )}
                <span className="mt-1.5 text-center text-[11px] font-bold leading-tight text-lingo-text">
                  {f.label}
                </span>
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
