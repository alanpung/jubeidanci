"use client";

import type { ReactNode } from "react";
import { Folder } from "lucide-react";
import {
  QUESTION_TYPE_LEGEND,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";

/**
 * The "Library" section of /library: eight folders, one per exercise type.
 *
 * Tapping a folder does not navigate — it opens the small browser window
 * (`TypeBrowserWindow` in course-book-shelf) listing every course of that type,
 * where a +/× toggle adds to / removes from My Books. The window is rendered
 * *inside* this section (as children, right below the folder grid) so it never
 * covers the My Books shelf above it.
 *
 * Eight concrete types are shown (Mixed Practice is intentionally omitted) in
 * the order the owner requested — Flashcard first, Translation second.
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

interface LibraryFoldersProps {
  /** Called with the exercise-type label of the tapped folder. */
  onOpenType: (typeLabel: string) => void;
  /** Label of the folder currently open, if any — shown as active. */
  activeType?: string | null;
  /** The browser window, rendered inside the Library section. */
  children?: ReactNode;
}

export function LibraryFolders({
  onOpenType,
  activeType,
  children,
}: LibraryFoldersProps) {
  const folders = FOLDER_ORDER.map((id) => {
    const found = QUESTION_TYPE_LEGEND.find((f) => f.id === id);
    // Fall back to the resolver so the label always matches what the shelf
    // derives for a course (otherwise the folder and the books it lists could
    // disagree about a folder's name).
    const visual = resolveCourseQuestionType(undefined, undefined, id);
    const label = found?.label ?? visual?.label ?? id;
    const Icon = found?.Icon ?? visual?.Icon;
    const bg = found?.bg ?? visual?.bg ?? "bg-lingo-gray";
    return { id, label, Icon, bg };
  }).filter((f) => f.Icon);

  return (
    <section className="mt-10">
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-lingo-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
          <Folder className="h-3 w-3" /> Library
        </span>
        <span className="h-px flex-1 bg-lingo-border" />
      </div>

      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-base font-bold text-lingo-text">Browse by Type</h2>
        <span className="text-xs text-lingo-text-light">
          Open a folder to add or remove books.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
        {folders.map(({ id, label, Icon, bg }) => {
          const isActive = activeType === label;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpenType(label)}
              aria-expanded={isActive}
              className={`group flex flex-col items-center rounded-2xl border-2 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-lingo-green hover:shadow-[0_4px_0_0] hover:shadow-lingo-border active:translate-y-0 ${
                isActive
                  ? "border-lingo-green shadow-[0_4px_0_0] shadow-lingo-border"
                  : "border-lingo-border"
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm ${bg}`}
              >
                {Icon ? <Icon className="h-6 w-6 stroke-[2.25]" /> : null}
              </span>
              <span className="mt-2 text-center text-xs font-bold leading-tight text-lingo-text">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* The browser window lives here, inside the Library section — the My
          Books shelf above stays fully visible and clickable. */}
      {children}
    </section>
  );
}
