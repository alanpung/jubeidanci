"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HoverableText } from "@/components/word/hoverable-text";
import { updateCourseTitle } from "@/lib/actions/units";

interface CourseTitleHeaderProps {
  courseId: string;
  initialTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  canEdit: boolean;
  creatorName?: string | null;
}

export function CourseTitleHeader({
  courseId,
  initialTitle,
  sourceLanguage,
  targetLanguage,
  canEdit,
  creatorName,
}: CourseTitleHeaderProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title cannot be empty");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await updateCourseTitle(courseId, trimmed);
      if (res.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleCancel() {
    setTitle(initialTitle);
    setIsEditing(false);
    setError(null);
  }

  return (
    <div className="mb-6 text-center">
      {isEditing ? (
        <form onSubmit={handleSave} className="mx-auto max-w-md space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
              className="flex-1 rounded-xl border-2 border-lingo-blue px-3 py-1.5 text-lg font-bold text-lingo-text focus:outline-none"
              placeholder="Enter course title"
              autoFocus
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl border-2 border-lingo-green bg-lingo-green px-3 py-1.5 text-sm font-bold text-white transition-all hover:bg-lingo-green/90 active:translate-y-[1px] disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="rounded-xl border-2 border-lingo-border bg-white px-3 py-1.5 text-sm font-bold text-lingo-text hover:bg-lingo-gray/40 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs font-bold text-red-500">{error}</p>}
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black text-lingo-text">
              <HoverableText text={title} language={targetLanguage} />
            </h1>
            {canEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-lingo-border bg-white px-2 py-1 text-xs font-bold text-lingo-text-light hover:border-lingo-blue hover:text-lingo-blue hover:bg-lingo-blue/5 transition-colors"
                title="Edit course title"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
                <span>Edit Title</span>
              </button>
            )}
          </div>
          {creatorName && (
            <p className="text-xs font-semibold text-lingo-text-light">
              by {creatorName}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
