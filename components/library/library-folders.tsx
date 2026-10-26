"use client";

import type { ComponentType, ReactNode } from "react";
import { Shuffle } from "lucide-react";
import {
  CourseCover,
  QUESTION_TYPE_LEGEND,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";

/** Key of the always-present folder that holds the units the AI tutor made. */
export const STANDALONE_KEY = "standalone-units";

/** The "mix" visual — the symbol every standalone unit wears. */
const STANDALONE_VISUAL = {
  bg: "bg-gradient-to-br from-fuchsia-500 to-purple-600",
  border: "border-fuchsia-300/70",
  Icon: Shuffle,
};

/** One folder tile. A type folder carries a `typeId` (the exercise type that
 *  decides its colour + symbol); a level folder carries its CEFR code, which
 *  is both the key and the glyph drawn inside the cover. */
interface FolderItem {
  key: string;
  label: string;
  typeId?: string;
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
 * Below either grid sits the "Standalone Units" folder: the units the AI tutor
 * created. They belong to no course, so they belong to no CEFR level and no
 * exercise type — hence their own folder, always visible in both groupings.
 *
 * Tapping a folder does NOT navigate — it opens the browser window
 * (`TypeBrowserWindow` in course-book-shelf) listing every course of that
 * level/type, where a +/× toggle adds to / removes from My Favorite.
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
  /** How many standalone units the folder holds. */
  standaloneCount: number;
  /** The browser window, rendered inside the Library section. */
  children?: ReactNode;
}

export function LibraryFolders({
  groupBy,
  onGroupBy,
  activeKey,
  onOpenKey,
  standaloneCount,
  children,
}: LibraryFoldersProps) {
  const typeFolders: FolderItem[] = FOLDER_ORDER.map((id) => {
    const found = QUESTION_TYPE_LEGEND.find((f) => f.id === id);
    const visual = resolveCourseQuestionType(undefined, undefined, id);
    const label = found?.label ?? visual?.label ?? id;
    const Icon = found?.Icon ?? visual?.Icon;
    return { key: label, label, typeId: id, Icon, isType: true };
  }).filter((f) => f.Icon);

  const levelFolders: FolderItem[] = LEVEL_ORDER.map((lvl) => ({
    key: lvl,
    label: lvl,
    isType: false,
  }));

  const folders = groupBy === "type" ? typeFolders : levelFolders;

  // Tidy rows for both groupings: 6 CEFR levels sit 3-up on phones and 6-up
  // from `min-[480px]`; the 8 exercise types stay 4-up so neither grouping
  // leaves a ragged half-row.
  const gridClass =
    groupBy === "type"
      ? "grid grid-cols-4 gap-2.5"
      : "grid grid-cols-3 gap-2.5 min-[480px]:grid-cols-6";

  const standaloneActive = activeKey === STANDALONE_KEY;

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
                  isActive ? "" : "hover:-translate-y-0.5"
                }`}
              >
                {/* The cover IS the button — the whole tile is the colour, so
                    there is no white card and no white padding around it. */}
                <span
                  className={`block w-full transition-transform ${
                    isActive ? "scale-[1.04]" : "group-hover:scale-[1.04]"
                  }`}
                >
                  <CourseCover
                    level={f.isType ? null : f.label}
                    questionType={f.isType ? f.typeId : null}
                    glyph={
                      f.isType ? (
                        f.Icon ? (
                          <f.Icon className="h-7 w-7 stroke-[2.25]" />
                        ) : null
                      ) : (
                        <span className="text-lg font-black">{f.label}</span>
                      )
                    }
                    showLevel={false}
                    className={
                      isActive
                        ? "ring-2 ring-lingo-green ring-offset-2 ring-offset-lingo-bg"
                        : ""
                    }
                  />
                </span>
                {/* Level folders already spell the code inside the cover, so only
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

        {/* Standalone units — the AI tutor's own units. Always listed, because
            they belong to no CEFR level and no exercise type. */}
        <button
          type="button"
          onClick={() => onOpenKey(standaloneActive ? null : STANDALONE_KEY)}
          aria-expanded={standaloneActive}
          className={`group mt-3 flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left shadow-sm transition-all active:translate-y-0 ${
            STANDALONE_VISUAL.bg
          } ${STANDALONE_VISUAL.border} ${
            standaloneActive
              ? "ring-2 ring-lingo-green ring-offset-2 ring-offset-lingo-bg"
              : ""
          }`}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <STANDALONE_VISUAL.Icon className="h-6 w-6 text-white stroke-[2.25]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-white">
              Standalone Units
            </span>
            <span className="block text-[11px] font-semibold text-white/80">
              {standaloneCount} {standaloneCount === 1 ? "unit" : "units"} made
              with the AI tutor
            </span>
          </span>
        </button>

        {/* The browser window. On phones it layers over the folders above; from
            `lg` up it settles underneath them. */}
        {children}
      </div>
    </section>
  );
}
