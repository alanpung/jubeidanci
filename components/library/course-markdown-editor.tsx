"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { updateUnitMarkdown } from "@/lib/actions/units";
import { getLessonLineRanges, lessonIndexAtChar } from "@/lib/content/lesson-lines";

interface UnitEntry {
  id: string;
  title: string;
  icon: string | null;
  markdown: string;
  lessonCount: number;
}

interface CourseMarkdownEditorProps {
  courseId: string;
  courseTitle: string;
  units: UnitEntry[];
  isAdmin?: boolean;
  /** Hide the "← Back" link — used when embedded in the /markdown workspace,
   *  where the filter panel above already provides navigation. */
  hideBackLink?: boolean;
  /** Optional level pill classes shown next to the course title. */
  levelColor?: string;
  /** Level text for that pill (e.g. "B1"). */
  levelLabel?: string;
}

export function CourseMarkdownEditor({
  courseId,
  courseTitle,
  units,
  isAdmin,
  hideBackLink = false,
  levelColor,
  levelLabel,
}: CourseMarkdownEditorProps) {
  const [activeUnitId, setActiveUnitId] = useState(units[0]?.id ?? "");
  const activeUnit = units.find((u) => u.id === activeUnitId) ?? units[0];

  const [markdown, setMarkdown] = useState(activeUnit?.markdown ?? "");
  const [selectedLesson, setSelectedLesson] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const ranges = useMemo(() => getLessonLineRanges(markdown), [markdown]);

  function handleUnitChange(nextId: string) {
    const next = units.find((u) => u.id === nextId);
    if (!next) return;
    setActiveUnitId(nextId);
    setMarkdown(next.markdown ?? "");
    setSelectedLesson(1);
    setError(null);
    setSavedMsg(null);
  }

  function jumpToLesson(n: number) {
    const r = ranges.find((x) => x.lessonIndex === n);
    const ta = textareaRef.current;
    if (!r || !ta) {
      setSelectedLesson(n);
      return;
    }
    ta.focus();
    ta.setSelectionRange(r.charStart, r.charEnd);
    // Approximate scroll: 21px per line, leave room for the toolbar.
    ta.scrollTop = Math.max(0, r.startLine * 21 - 80);
    setSelectedLesson(n);
  }

  async function handleSave() {
    if (!activeUnitId) return;
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const res = await updateUnitMarkdown(activeUnitId, markdown);
      if (res.success) {
        setSavedMsg(
          `Saved "${res.title}" — ${res.lessonCount} lessons, ${res.exerciseCount} questions.`,
        );
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const lessonNumbers = useMemo(() => {
    const max = activeUnit?.lessonCount ?? ranges.length;
    const count = Math.max(max, ranges.length);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [activeUnit, ranges.length]);

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {!hideBackLink && (
            <Link
              href={`/library/${courseId}`}
              className="shrink-0 text-sm font-bold text-lingo-text-light hover:text-lingo-text transition-colors"
            >
              &larr; Back
            </Link>
          )}
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold text-lingo-text">
            <span className="truncate">{courseTitle}</span>
            {levelLabel && levelColor && (
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black text-white ${levelColor}`}
              >
                {levelLabel}
              </span>
            )}
            <span className="shrink-0 rounded-md bg-lingo-gray px-1.5 py-0.5 text-[10px] font-black text-lingo-text-light">
              {units.length} units
            </span>
          </h1>
        </div>
      </div>

      <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-2">
        <p className="text-sm font-medium text-amber-700">
          Every unit and lesson in this course is editable. Pick a Unit #, then
          use the Lesson # filter to jump straight to any lesson across all{" "}
          {units.length} units.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-lingo-text-light">
          Unit #
          <select
            value={activeUnitId}
            onChange={(e) => handleUnitChange(e.target.value)}
            className="rounded-lg border-2 border-lingo-border bg-white px-3 py-2 text-sm font-medium text-lingo-text focus:border-lingo-blue focus:outline-none"
          >
            {units.map((u, idx) => {
              // Titles already carry their own "Unit N:" prefix (e.g.
              // "Unit 1: Everyday Essentials"), so re-prefixing "Unit N:" here
              // would print it twice. Strip the leading label before showing it.
              const strippedTitle =
                u.title.replace(/^\s*unit\s*\d+\s*:?\s*/i, "").trim() ||
                u.title;
              return (
                <option key={u.id} value={u.id}>
                  Unit {idx + 1}: {strippedTitle}
                </option>
              );
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold text-lingo-text-light">
          Lesson #
          <select
            value={selectedLesson}
            onChange={(e) => jumpToLesson(Number(e.target.value))}
            className="rounded-lg border-2 border-lingo-border bg-white px-3 py-2 text-sm font-medium text-lingo-text focus:border-lingo-blue focus:outline-none"
          >
            {lessonNumbers.map((n) => (
              <option key={n} value={n}>
                Lesson {n}
              </option>
            ))}
          </select>
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={() => jumpToLesson(selectedLesson)}
        >
          Jump to Lesson {selectedLesson}
        </Button>

        <span className="ml-auto text-xs font-medium text-lingo-gray-dark">
          {ranges.length} lesson blocks detected · {markdown.length} chars
        </span>
      </div>

      {/* Feedback */}
      {error && (
        <div className="rounded-xl border-2 border-lingo-red/30 bg-lingo-red/5 px-4 py-3">
          <p className="text-sm font-medium text-lingo-red">{error}</p>
        </div>
      )}
      {savedMsg && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-700">{savedMsg}</p>
        </div>
      )}

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={markdown}
        onChange={(e) => {
          setMarkdown(e.target.value);
          setSavedMsg(null);
        }}
        spellCheck={false}
        className="w-full flex-1 rounded-xl border-2 border-lingo-border bg-white px-4 py-3 font-mono text-sm text-lingo-text leading-relaxed placeholder:text-lingo-gray-dark focus:border-lingo-blue focus:outline-none transition-colors resize-none"
        style={{ minHeight: "calc(100vh - 320px)" }}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} loading={saving}>
            Save Unit
          </Button>
          {!hideBackLink && (
            <Link href={`/library/${courseId}`}>
              <Button variant="outline" disabled={saving}>
                Done
              </Button>
            </Link>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (activeUnit) setMarkdown(activeUnit.markdown ?? "");
            setSavedMsg(null);
          }}
          disabled={saving}
        >
          Reset Unit
        </Button>
      </div>
    </div>
  );
}
