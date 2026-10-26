"use client";

import type { ComponentType, ReactNode } from "react";
import { Shuffle } from "lucide-react";
import {
  CourseCover,
  LEVEL_LABELS,
  QUESTION_TYPE_LEGEND,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";

/** Key of the always-present folder that holds the units the AI tutor made. */
export const STANDALONE_KEY = "standalone-units";

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
 * level/type, where a +/× toggle adds to / removes from My Books.
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

  // Every folder — CEFR level or exercise type — uses the *same* 2-up / 4-up
  // grid as the course covers, so a folder tile is exactly as wide as the book
  // cover you tap inside it. 6 levels pad to two rows of three on phones and
  // one row of four + a pair on desktop; 8 types fill two tidy rows.
  const gridClass = "grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-4";

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
                    there is no white card and no white padding around it. The
                    symbol sits left, the name to its right, inside the cover. */}
                <span
                  className={`block w-full transition-transform ${
                    isActive ? "scale-[1.04]" : "group-hover:scale-[1.04]"
                  }`}
                >
                  <CourseCover
                    level={f.isType ? null : f.label}
                    questionType={f.isType ? f.typeId : null}
                    levelAsSymbol={!f.isType}
                    glyph={
                      f.isType && f.Icon ? (
                        <f.Icon className="h-9 w-9 stroke-[2.25]" />
                      ) : undefined
                    }
                    name={f.isType ? f.label : LEVEL_LABELS[f.label]}
                    showLevel={false}
                    className={
                      isActive
                        ? "ring-2 ring-lingo-green ring-offset-2 ring-offset-lingo-bg"
                        : ""
                    }
                  />
                </span>
              </button>
            );
          })}

          {/* Standalone units — the AI tutor's own units. Always listed because
              they belong to no CEFR level and no exercise type. Same-size tile
              as every other folder, wearing the "mix" symbol; the title lives
              inside the cover, no description. */}
          <button
            type="button"
            onClick={() => onOpenKey(standaloneActive ? null : STANDALONE_KEY)}
            aria-expanded={standaloneActive}
            aria-label="Standalone Units"
            className={`group flex flex-col items-center gap-1.5 transition-transform active:translate-y-0 ${
              standaloneActive ? "" : "hover:-translate-y-0.5"
            }`}
          >
            <span
              className={`block w-full transition-transform ${
                standaloneActive ? "scale-[1.04]" : "group-hover:scale-[1.04]"
              }`}
            >
              <CourseCover
                questionType="mix"
                glyph={<Shuffle className="h-9 w-9 stroke-[2.25]" />}
                name="Standalone unit"
                showLevel={false}
                className={
                  standaloneActive
                    ? "ring-2 ring-lingo-green ring-offset-2 ring-offset-lingo-bg"
                    : ""
                }
              />
            </span>
          </button>
        </div>

        {/* The browser window. On phones it layers over the folders above; from
            `lg` up it settles underneath them. */}
        {children}
      </div>
    </section>
  );
}
