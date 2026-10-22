"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Globe, Pencil, FolderOpen, Lock } from "lucide-react";
import type { CourseListItem, StandaloneUnitInfo } from "@/lib/content/types";
import { CourseLevelIcon } from "@/components/library/course-level-icon";
import { makeCoursePublic } from "@/lib/actions/units";
import { StandaloneUnitCard } from "@/components/library/standalone-units";
import {
  DeckShelf,
  DeckStack,
  groupByLevel,
} from "@/components/library/library-deck";

interface PrivateShelfProps {
  /** The viewer's own courses that are not public yet. */
  courses: CourseListItem[];
  /** The viewer's own standalone units that are not public yet. */
  units: StandaloneUnitInfo[];
  isAdmin?: boolean;
}

/**
 * The bottom shelf of /library: everything the viewer owns that is still
 * private.
 *
 * Private courses and units used to be mixed straight into the "Public Books"
 * shelf and the standalone list, which meant a draft looked exactly like
 * published content and was easy to lose in a long grid. Grouping them here
 * keeps one obvious place to find work-in-progress — and the shelves above
 * drop them, so nothing is listed twice.
 */
export function PrivateShelf({ courses, units, isAdmin }: PrivateShelfProps) {
  if (courses.length === 0 && units.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-lingo-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
          <Lock className="h-3 w-3" /> Private
        </span>
        <span className="h-px flex-1 bg-lingo-border" />
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-bold text-lingo-text">
          Private Courses &amp; Units
        </h2>
        <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
          {courses.length + units.length}
        </span>
        <span className="text-xs text-lingo-text-light">
          Only you can see these.
        </span>
      </div>

      {courses.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-bold text-lingo-text">Courses</h3>
            <span className="text-xs font-bold text-lingo-text-light">
              {courses.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
            {courses.map((c) => (
              <PrivateBook key={c.id} course={c} />
            ))}
          </div>
        </div>
      )}

      {units.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-bold text-lingo-text">Units</h3>
            <span className="text-xs font-bold text-lingo-text-light">
              {units.length}
            </span>
          </div>
          <div className="min-w-0">
            {groupByLevel(units, (u) => u.level).map(({ level, items }) => (
              <DeckShelf key={level ?? "other"} level={level} count={items.length}>
                {items.map((u) => (
                  <DeckStack key={u.id}>
                    <StandaloneUnitCard unit={u} isAdmin={isAdmin} />
                  </DeckStack>
                ))}
              </DeckShelf>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** A private course as a book, minus the borrow button — you already own it.
 *  The corner menu carries the same owner controls the public shelf offers. */
function PrivateBook({ course }: { course: CourseListItem }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function makePublic() {
    const ok = window.confirm(
      "Make this course public?\n\nOnce public it becomes read-only for non-admins and all users can access it.",
    );
    if (!ok) return;
    setMenuOpen(false);
    startTransition(async () => {
      const res = await makeCoursePublic(course.id);
      if (!res.success) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="group flex flex-col items-center">
      <div className="relative">
        <Link
          href={`/library/${course.id}`}
          className="inline-block transition-transform hover:-translate-y-0.5"
          title={`${course.title} · ${course.level} · ${course.unitCount} units · private`}
        >
          <CourseLevelIcon
            level={course.level}
            title={course.title}
            courseId={course.id}
            size="lg"
          />
        </Link>

        <div className="absolute -bottom-2 -left-2">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={pending}
            title="Course options"
            aria-label="Course options"
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-lingo-border bg-white text-lingo-text shadow-sm transition-colors hover:bg-lingo-gray/40 disabled:opacity-50"
          >
            {pending ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div className="absolute bottom-7 left-0 z-40 w-40 overflow-hidden rounded-lg border-2 border-lingo-border bg-white text-sm shadow-lg">
                <button
                  type="button"
                  onClick={makePublic}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
                >
                  <Globe className="h-4 w-4" /> Make Public
                </button>
                <Link
                  href={`/library/edit-course/${course.id}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
                <Link
                  href={`/library/${course.id}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
                >
                  <FolderOpen className="h-4 w-4" /> Manage
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 min-h-[2rem] w-full px-1 text-center text-xs font-semibold leading-tight text-lingo-text">
        {course.title}
      </p>
      <span className="mt-1 rounded-full bg-lingo-gray px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-lingo-text-light">
        🔒 Private
      </span>
    </div>
  );
}
