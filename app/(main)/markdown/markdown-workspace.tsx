"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import {
  fetchCourseMarkdownForEdit,
  listEditableCourses,
} from "@/lib/actions/course";
import {
  QUESTION_TYPE_LEGEND,
  getCourseLevelStyle,
} from "@/components/library/course-level-icon";
import { CourseMarkdownEditor } from "@/components/library/course-markdown-editor";

/** CEFR levels, in canonical order — the two filters are always these. */
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

interface EditableCourse {
  id: string;
  title: string;
  level: string;
  questionTypeId: string | null;
}

type UnitEntry = {
  id: string;
  title: string;
  icon: string | null;
  markdown: string;
  lessonCount: number;
};

/**
 * Owner-only markdown workspace, living at /markdown.
 *
 * The course to edit is chosen with exactly two filters — CEFR level and
 * exercise (question) type — because that is how the owner thinks about the
 * catalogue: "the B1 flashcards". Both filters narrow the same list, and the
 * chosen course's raw markdown is then loaded on demand (not bundled with the
 * page) and handed to the shared course editor, which already knows how to
 * save through `updateUnitMarkdown`.
 */
export function MarkdownWorkspace() {
  const [courses, setCourses] = useState<EditableCourse[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [level, setLevel] = useState<string>("all");
  const [typeId, setTypeId] = useState<string>("all");

  const [selectedId, setSelectedId] = useState<string>("");
  const [loaded, setLoaded] = useState<{
    courseId: string;
    title: string;
    units: UnitEntry[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCourse, startLoad] = useTransition();

  // Course list: owner-only, so fetch it once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listEditableCourses();
        if (cancelled) return;
        if (!res.success) {
          setListError(res.error);
        } else {
          setCourses(res.courses);
          // Preselect the first course so the page is never a dead end.
          if (res.courses.length > 0) setSelectedId(res.courses[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only offer levels / types that at least one course actually has, so the
  // filters never lead to an empty list.
  const availableLevels = useMemo(
    () => LEVELS.filter((l) => courses.some((c) => c.level === l)),
    [courses]
  );
  const availableTypes = useMemo(
    () =>
      QUESTION_TYPE_LEGEND.filter((t) =>
        courses.some((c) => c.questionTypeId === t.id)
      ),
    [courses]
  );

  const filtered = useMemo(
    () =>
      courses.filter(
        (c) =>
          (level === "all" || c.level === level) &&
          (typeId === "all" || c.questionTypeId === typeId)
      ),
    [courses, level, typeId]
  );

  // Keep the selection valid: if the filters exclude the selected course, fall
  // back to the first visible one (or nothing at all).
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId !== "") setSelectedId("");
      return;
    }
    if (!filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // Load the selected course's markdown on demand.
  useEffect(() => {
    if (!selectedId) {
      setLoaded(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    startLoad(async () => {
      const res = await fetchCourseMarkdownForEdit(selectedId);
      if (cancelled) return;
      if (!res.success) {
        setLoaded(null);
        setLoadError(res.error);
        return;
      }
      setLoaded({
        courseId: res.courseId,
        title: res.title,
        units: res.units,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selected = courses.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-black text-lingo-text">
          <FileText className="h-6 w-6 stroke-[2.5]" />
          Markdown
        </h1>
        <p className="mt-1 text-sm text-lingo-text-light">
          Pick a course by level and question type, then view, edit and save its
          unit markdown.
        </p>
      </div>

      {listError && (
        <div className="rounded-xl border-2 border-lingo-red/30 bg-lingo-red/5 px-4 py-3">
          <p className="text-sm font-medium text-lingo-red">{listError}</p>
        </div>
      )}

      {/* ── The two filters + course picker ───────────────────────────── */}
      <div className="mb-5 rounded-2xl border-2 border-lingo-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-bold text-lingo-text-light">
            Level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-bold text-lingo-text focus:border-lingo-blue focus:outline-none"
            >
              <option value="all">All levels</option>
              {availableLevels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-bold text-lingo-text-light">
            Question type
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-bold text-lingo-text focus:border-lingo-blue focus:outline-none"
            >
              <option value="all">All types</option>
              {availableTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[14rem] flex-[2] flex-col gap-1 text-xs font-bold text-lingo-text-light">
            Course
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={listLoading || filtered.length === 0}
              className="rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-bold text-lingo-text focus:border-lingo-blue focus:outline-none disabled:opacity-50"
            >
              {filtered.length === 0 && (
                <option value="">No matching course</option>
              )}
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} 
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Filter result summary + a shortcut into the course itself. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-lingo-text-light">
          <span>
            {filtered.length} course{filtered.length === 1 ? "" : "s"}
            {level !== "all" ? ` at ${level}` : ""}
            {typeId !== "all"
              ? ` · ${
                  QUESTION_TYPE_LEGEND.find((t) => t.id === typeId)?.label ??
                  typeId
                }`
              : ""}
          </span>
          {selected && (
            <Link
              href={`/library/${selected.id}`}
              className="ml-auto rounded-lg border-2 border-lingo-border bg-white px-3 py-1 font-bold text-lingo-text transition-colors hover:border-lingo-blue hover:bg-lingo-blue/5"
            >
              View course →
            </Link>
          )}
        </div>
      </div>

      {/* ── Editor ────────────────────────────────────────────────────── */}
      {loadingCourse && (
        <div className="rounded-xl border-2 border-lingo-border bg-white px-4 py-6 text-center text-sm font-medium text-lingo-text-light">
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-lingo-text-light/40 border-t-lingo-blue" />
          Loading markdown…
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border-2 border-lingo-red/30 bg-lingo-red/5 px-4 py-3">
          <p className="text-sm font-medium text-lingo-red">{loadError}</p>
        </div>
      )}

      {!loadingCourse && !loadError && loaded && (
        <CourseMarkdownEditor
          key={loaded.courseId}
          courseId={loaded.courseId}
          courseTitle={loaded.title}
          units={loaded.units}
          hideBackLink
          levelLabel={selected?.level}
          levelColor={
            selected ? getCourseLevelStyle(selected.level).pill : undefined
          }
        />
      )}

      {!listLoading && !listError && courses.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-lingo-border bg-white p-8 text-center">
          <span className="mb-2 block text-3xl">📝</span>
          <p className="text-sm font-bold text-lingo-text">No courses yet</p>
          <p className="mt-1 text-xs text-lingo-text-light">
            Create a course first — then its units show up here.
          </p>
        </div>
      )}
    </div>
  );
}
