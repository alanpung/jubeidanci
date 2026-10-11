"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CourseManagementInfo, AvailableUnitForCourse } from "@/lib/content/types";
import { QuestionTypeBadge } from "@/components/units/question-type-badge";
import {
  fetchCourseManagementData,
  addUnitToCourse,
  removeUnitFromCourse,
  updateCourseTitle,
} from "@/lib/actions/units";

interface CourseManagerProps {
  courseId: string;
  isAdmin?: boolean;
}

export function CourseManager({ courseId, isAdmin }: CourseManagerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseData, setCourseData] = useState<CourseManagementInfo | null>(null);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnitForCourse[]>([]);
  const [isPending, startTransition] = useTransition();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCourseManagementData(courseId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setCourseData(result.course);
        setTitleInput(result.course.title);
        setAvailableUnits(result.availableUnits);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  function handleSaveCourseTitle(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = titleInput.trim();
    if (!trimmed) {
      setTitleError("Title cannot be empty");
      return;
    }
    setTitleError(null);
    startTransition(async () => {
      const res = await updateCourseTitle(courseId, trimmed);
      if (res.success) {
        setEditingTitle(false);
        if (courseData) {
          setCourseData({ ...courseData, title: trimmed });
        }
        router.refresh();
      } else {
        setTitleError(res.error);
      }
    });
  }

  function handleAddUnit(unitId: string) {
    startTransition(async () => {
      const result = await addUnitToCourse(unitId, courseId);
      if (result.success) {
        // Refresh data
        const refreshed = await fetchCourseManagementData(courseId);
        if (refreshed.success) {
          setCourseData(refreshed.course);
          setAvailableUnits(refreshed.availableUnits);
        }
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  function handleRemoveUnit(unitId: string) {
    startTransition(async () => {
      const result = await removeUnitFromCourse(unitId);
      if (result.success) {
        // Refresh data
        const refreshed = await fetchCourseManagementData(courseId);
        if (refreshed.success) {
          setCourseData(refreshed.course);
          setAvailableUnits(refreshed.availableUnits);
        }
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-lingo-text-light">
        Loading...
      </div>
    );
  }

  if (error || !courseData) {
    return (
      <div className="p-4 text-center text-sm text-lingo-red">
        {error ?? "Failed to load course data"}
      </div>
    );
  }

  const isLocked = courseData.visibility === "public" && !isAdmin;

  return (
    <div className="p-4 space-y-4">
      {isLocked && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-sm font-medium text-amber-700">
            This course is public and can no longer be edited. Only admins can
            make changes.
          </p>
        </div>
      )}

      {/* Course Title Edit */}
      {!isLocked && (
        <div className="rounded-xl border border-lingo-border bg-lingo-bg p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-lingo-text-light">
              Course Title
            </span>
            {!editingTitle && (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="text-xs font-bold text-lingo-blue hover:underline"
              >
                Edit Title
              </button>
            )}
          </div>
          {editingTitle ? (
            <form onSubmit={handleSaveCourseTitle} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  disabled={isPending}
                  className="flex-1 rounded-lg border-2 border-lingo-blue bg-white px-2.5 py-1 text-sm font-bold text-lingo-text focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg border-2 border-lingo-green bg-lingo-green px-3 py-1 text-xs font-bold text-white hover:bg-lingo-green/90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(courseData.title);
                    setEditingTitle(false);
                    setTitleError(null);
                  }}
                  disabled={isPending}
                  className="rounded-lg border border-lingo-border bg-white px-3 py-1 text-xs font-bold text-lingo-text hover:bg-lingo-gray/40 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              {titleError && (
                <p className="text-xs font-bold text-red-500">{titleError}</p>
              )}
            </form>
          ) : (
            <p className="text-sm font-bold text-lingo-text">{courseData.title}</p>
          )}
        </div>
      )}

      {/* Current units in course */}
      <div>
        <h4 className="text-sm font-bold text-lingo-text-light uppercase tracking-wide mb-2">
          Units in this course ({courseData.units.length})
        </h4>
        {courseData.units.length === 0 ? (
          <p className="text-sm text-lingo-text-light py-2">
            No units yet. Add units from your standalone units below.
          </p>
        ) : (
          <div className="space-y-2">
            {courseData.units.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-lingo-border bg-lingo-bg px-3 py-2"
              >
                <span className="text-lg">{u.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-lingo-text truncate">
                      {u.title}
                    </p>
                    {u.questionType && (
                      <QuestionTypeBadge questionType={u.questionType} size="xs" />
                    )}
                  </div>
                  <p className="text-xs text-lingo-text-light">
                    {u.lessonCount} {u.lessonCount === 1 ? "lesson" : "lessons"}
                  </p>
                </div>
                {!isLocked && (
                  <button
                    onClick={() => handleRemoveUnit(u.id)}
                    disabled={isPending}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available units to add */}
      {!isLocked && availableUnits.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-lingo-text-light uppercase tracking-wide mb-2">
            Add from your units
          </h4>
          <div className="space-y-2">
            {availableUnits.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-dashed border-lingo-border bg-white px-3 py-2"
              >
                <span className="text-lg">{u.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-lingo-text truncate">
                      {u.title}
                    </p>
                    {u.questionType && (
                      <QuestionTypeBadge questionType={u.questionType} size="xs" />
                    )}
                  </div>
                  <p className="text-xs text-lingo-text-light">
                    {u.lessonCount} {u.lessonCount === 1 ? "lesson" : "lessons"}
                  </p>
                </div>
                <button
                  onClick={() => handleAddUnit(u.id)}
                  disabled={isPending}
                  className="shrink-0 rounded-lg border-2 border-lingo-blue bg-lingo-blue px-2 py-1 text-xs font-bold text-white transition-all hover:bg-lingo-blue/90 disabled:opacity-50"
                >
                  {isPending ? "..." : "+ Add"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLocked && availableUnits.length === 0 && courseData.units.length > 0 && (
        <p className="text-xs text-lingo-text-light text-center py-2">
          No standalone units available to add. Create a new unit first.
        </p>
      )}
    </div>
  );
}
