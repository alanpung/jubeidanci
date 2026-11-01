"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { updateCourseTitle, createManualUnit } from "@/lib/actions/units";
import { QUESTION_TYPES, type QuestionType } from "@/lib/content/question-types";

interface CourseDetailActionsProps {
  courseId: string;
  courseTitle: string;
  /** The course's own languages/level, used as defaults for a new unit. */
  sourceLanguage: string;
  targetLanguage: string;
  level: string;
}

/**
 * Owner controls for a course's detail page: rename the course and add a new
 * unit to it. Rendered only for the owner/admin — students just see the unit
 * list.
 */
export function CourseDetailActions({
  courseId,
  courseTitle,
  sourceLanguage,
  targetLanguage,
  level,
}: CourseDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Rename ──
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(courseTitle);
  const [titleError, setTitleError] = useState<string | null>(null);

  // ── Add unit ──
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [unitTitle, setUnitTitle] = useState("");
  const [unitQuestionType, setUnitQuestionType] = useState<QuestionType>(
    "multiple-choice"
  );
  const [unitError, setUnitError] = useState<string | null>(null);

  function handleSaveTitle(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleError("Title cannot be empty");
      return;
    }
    setTitleError(null);
    startTransition(async () => {
      const res = await updateCourseTitle(courseId, trimmed);
      if (res.success) {
        setIsEditingTitle(false);
        router.refresh();
      } else {
        setTitleError(res.error);
      }
    });
  }

  function handleCreateUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitTitle.trim()) {
      setUnitError("Please enter a unit title");
      return;
    }
    setUnitError(null);
    startTransition(async () => {
      const res = await createManualUnit({
        title: unitTitle.trim(),
        targetLanguage,
        sourceLanguage,
        level,
        courseId,
        questionType: unitQuestionType,
      });
      if (res.success) {
        setIsAddingUnit(false);
        setUnitTitle("");
        router.refresh();
      } else {
        setUnitError(res.error);
      }
    });
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      {isEditingTitle ? (
        <form onSubmit={handleSaveTitle} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            disabled={isPending}
            placeholder="Course title"
            aria-label="Course title"
            className="min-w-0 flex-1 rounded-xl border-2 border-lingo-blue bg-white px-3 py-2 text-sm font-bold text-lingo-text focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-lingo-green px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-lingo-green/90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setTitleDraft(courseTitle);
              setTitleError(null);
              setIsEditingTitle(false);
            }}
            disabled={isPending}
            className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-lingo-text transition-colors hover:bg-lingo-gray/40 disabled:opacity-50"
          >
            Cancel
          </button>
          {titleError && (
            <p className="w-full text-xs font-bold text-lingo-red">{titleError}</p>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsEditingTitle(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-lingo-border bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-lingo-text transition-colors hover:bg-lingo-gray/40"
          >
            <Pencil className="h-3.5 w-3.5 stroke-[2.5]" />
            Edit Title
          </button>
          <button
            type="button"
            onClick={() => setIsAddingUnit((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-lingo-blue px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-lingo-blue/90"
          >
            <Plus className="h-3.5 w-3.5 stroke-[3]" />
            Add Unit
          </button>
        </div>
      )}

      {isAddingUnit && (
        <form
          onSubmit={handleCreateUnit}
          className="rounded-2xl border-2 border-lingo-blue bg-white p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-lingo-text">New unit</h3>
            <button
              type="button"
              onClick={() => {
                setIsAddingUnit(false);
                setUnitError(null);
              }}
              disabled={isPending}
              aria-label="Close"
              className="rounded-lg p-1 text-lingo-text-light transition-colors hover:bg-lingo-gray/50 disabled:opacity-50"
            >
              <X className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>

          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-lingo-text-light">
            Unit title
          </label>
          <input
            type="text"
            value={unitTitle}
            onChange={(e) => setUnitTitle(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Animals"
            className="mb-3 w-full rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-bold text-lingo-text focus:border-lingo-blue focus:outline-none"
          />

          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-lingo-text-light">
            Exercise type
          </label>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Object.values(QUESTION_TYPES)
              // `free-text` has no starter block in createManualUnit, so it
              // would silently fall back to multiple-choice.
              .filter((t) => t.id !== "free-text")
              .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setUnitQuestionType(t.id as QuestionType)}
                disabled={isPending}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  unitQuestionType === t.id
                    ? "bg-lingo-blue text-white"
                    : "bg-lingo-gray/40 text-lingo-text hover:bg-lingo-gray/60"
                }`}
              >
                {t.icon} {t.nameEn}
              </button>
            ))}
          </div>

          {unitError && (
            <p className="mb-2 text-xs font-bold text-lingo-red">{unitError}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-lingo-green px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-lingo-green/90 disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create Unit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingUnit(false);
                setUnitError(null);
              }}
              disabled={isPending}
              className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-lingo-text transition-colors hover:bg-lingo-gray/40 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
