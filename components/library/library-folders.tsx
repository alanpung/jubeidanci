"use client";

import type { ComponentType, ReactNode } from "react";
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
 *   - "By Type"   → eight exercise-type folders (Flashcards, Translation, …)  [DEFAULT]
 *   - "By Level"  → six CEFR folders (A1–C2)
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
  /** Show the section heading. The owner keeps it (relabelled "My Books"). */
  showTitle?: boolean;
  /** Heading text. Defaults to "Library"; the owner passes "My Books" so the
   *  folder area reads as their single unified bookshelf. */
  title?: string;
  /** Owner mode: the browser window drops BELOW the folder grid instead of
   *  covering it. The owner has plenty of room underneath and still wants to
   *  see which folder they are browsing. */
  isAdmin?: boolean;
}

export function LibraryFolders({
  groupBy,
  onGroupBy,
  activeKey,
  onOpenKey,
  children,
  showTitle = true,
  title = "Library",
  isAdmin = false,
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
    <section className={showTitle ? "mt-8" : "mt-2"}>
      {/* The grouping toggle sits on the LEFT and the section title follows
          it. When the title is hidden (owner) the toggle simply leads the
          row. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Two-button grouping toggle. Default = By Type. */}
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

        {showTitle && (
          <h2 className="text-base font-bold text-lingo-text">{title}</h2>
        )}
      </div>

      {/* relative: the browser window is absolutely positioned over this box
          (covering the folders from the top) for students. The owner renders
          it below the grid instead, so it is a plain block there. */}
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

        {/* The browser window.
            Student: rendered inside this relative box, so its absolute
            inset-0 covers the folder grid exactly (it replaces the folders
            rather than pushing them down).
            Owner:    rendered after this box, in normal flow, so it drops
            BELOW the folders instead of hiding them. */}
        {!isAdmin && children}
      </div>

      {isAdmin && <div className="mt-4">{children}</div>}
    </section>
  );
}
