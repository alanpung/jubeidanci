"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, MoreHorizontal, Globe, Lock, Pencil, Trash2, FolderOpen } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import {
  CourseLevelIcon,
  QUESTION_TYPE_LEGEND,
  LEVEL_LEGEND,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";
import { makeCoursePublic, makeCoursePrivate, deleteCourse } from "@/lib/actions/units";
import { CreateCourseForm } from "@/components/library/create-course-form";

/** A student may keep at most this many courses "checked out" to the top
 *  (My Books) area — i.e. two rows of five. */
const BORROW_CAP = 10;

interface CourseBookShelfProps {
  /** Full catalog: public courses + the viewer's own. */
  courses: CourseListItem[];
  isAdmin: boolean;
}

export function CourseBookShelf({ courses, isAdmin }: CourseBookShelfProps) {
  const router = useRouter();
  const [borrowedIds, setBorrowedIds] = useState<Set<string>>(
    () => new Set(courses.filter((c) => c.isInLibrary).map((c) => c.id)),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [levelFilter, setLevelFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [, startTransition] = useTransition();

  // Only the books we actually show on the top shelf are hidden below. Slicing
  // first and filtering by that same set matters: if someone somehow has more
  // than BORROW_CAP saved, the overflow must still be listed underneath rather
  // than vanishing (it would be unreachable — no + on top, absent below).
  const borrowed = courses.filter((c) => borrowedIds.has(c.id)).slice(0, BORROW_CAP);
  const shownIds = new Set(borrowed.map((c) => c.id));
  const unfilteredCatalog = courses.filter((c) => !shownIds.has(c.id));

  // Exercise type lives in the book symbol, not in a column, so derive it the
  // same way CourseLevelIcon does — otherwise the filter and the cover could
  // disagree about what a book is.
  const typeOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  const catalog = unfilteredCatalog.filter((c) => {
    if (levelFilter && (c.level ?? "").toUpperCase() !== levelFilter) return false;
    if (typeFilter && typeOf(c) !== typeFilter) return false;
    return true;
  });

  // Only offer options that actually exist in the catalog.
  const levelOptions = [
    ...new Set(
      unfilteredCatalog
        .map((c) => (c.level ?? "").toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  const typeOptions = [
    ...new Set(unfilteredCatalog.map(typeOf)),
  ].sort();
  const hasFilters = Boolean(levelFilter || typeFilter);

  function borrow(course: CourseListItem) {
    if (borrowedIds.size >= BORROW_CAP) {
      alert(`You can keep at most ${BORROW_CAP} books on your shelf. Remove one first.`);
      return;
    }
    setPendingId(course.id);
    startTransition(async () => {
      try {
        const res = await addCourseToLibrary(course.id);
        if (res.success) {
          setBorrowedIds((s) => new Set(s).add(course.id));
        } else {
          alert(res.error);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to add to library");
      } finally {
        setPendingId(null);
        router.refresh();
      }
    });
  }

  function unborrow(course: CourseListItem) {
    setPendingId(course.id);
    startTransition(async () => {
      try {
        const res = await removeCourseFromLibrary(course.id);
        if (res.success) {
          setBorrowedIds((s) => {
            const next = new Set(s);
            next.delete(course.id);
            return next;
          });
        } else {
          alert(res.error);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to remove from library");
      } finally {
        setPendingId(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      {isAdmin && (
        <div className="mb-6">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-xl border-2 border-lingo-border bg-white px-3 py-1.5 text-xs font-bold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border transition-all hover:border-lingo-green hover:bg-lingo-green/5 active:translate-y-[1px] active:shadow-none"
          >
            + New Course
          </button>
          {showCreate && (
            <div className="mt-3">
              <CreateCourseForm onClose={() => setShowCreate(false)} />
            </div>
          )}
        </div>
      )}

      {/* Upper portion: My Books (borrowed, capped at BORROW_CAP) */}
      <section>
        {/* mb-8 (not mb-4): the +/× button sits 24px above each book, so the
            first row needs clearance or it collides with this heading. */}
        <div className="mb-8 flex items-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">My Books</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {borrowed.length}/{BORROW_CAP}
          </span>
        </div>

        {borrowed.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            Your shelf is empty. Tap the <span className="font-black">+</span> on any book below to
            add it here for practice.
          </p>
        ) : (
          // gap-y-8: the +/× button floats 24px above each book, so rows need
          // more than the old 20px or the next row's button lands on the
          // previous row's title.
          <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
            {borrowed.map((c) => (
              <CourseBook
                key={c.id}
                course={c}
                isAdmin={isAdmin}
                isBorrowed
                pending={pendingId === c.id}
                onBorrow={() => borrow(c)}
                onRemove={() => unborrow(c)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Thin dividing line between borrowed books and the public catalog */}
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-lingo-border" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
          Public Books
        </span>
        <span className="h-px flex-1 bg-lingo-border" />
      </div>

      {/* Lower portion: everything not yet on the top shelf */}
      <section>
        {/* mb-8 (not mb-3): the +/× button floats 24px above the first row of
            books, so the filter row needs clearance underneath it. */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">Browse All Courses</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {catalog.length}
          </span>

          {/* Filters: CEFR level + the exercise type shown on each cover */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              aria-label="Filter by level"
              className="rounded-lg border-2 border-lingo-border bg-white px-2 py-1 text-xs font-bold text-lingo-text"
            >
              <option value="">Level: All</option>
              {levelOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by exercise type"
              className="rounded-lg border-2 border-lingo-border bg-white px-2 py-1 text-xs font-bold text-lingo-text"
            >
              <option value="">Type: All</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setLevelFilter("");
                  setTypeFilter("");
                }}
                className="rounded-lg px-2 py-1 text-xs font-bold text-lingo-blue hover:bg-lingo-blue/10"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {catalog.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            {hasFilters
              ? "No course matches those filters. Try clearing them."
              : "Every available book is already on your shelf."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
            {catalog.map((c) => (
              <CourseBook
                key={c.id}
                course={c}
                isAdmin={isAdmin}
                isBorrowed={false}
                pending={pendingId === c.id}
                onBorrow={() => borrow(c)}
                onRemove={() => unborrow(c)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A single book: just the symbol (with its level badge), the title beneath it,
 *  and the owner's controls tucked into the symbol's corners. Deliberately no
 *  card/rectangle around it — the symbol is the whole visual. */
function CourseBook({
  course,
  isAdmin,
  isBorrowed,
  pending,
  onBorrow,
  onRemove,
}: {
  course: CourseListItem;
  isAdmin: boolean;
  isBorrowed: boolean;
  pending: boolean;
  onBorrow: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionPending, startTransition] = useTransition();
  const isOwner = !!course.isOwner || isAdmin;
  const isPublic = course.visibility === "public";

  function toggleVisibility() {
    const action = isPublic ? makeCoursePrivate : makeCoursePublic;
    const label = isPublic ? "private" : "public";
    if (!isPublic) {
      const ok = window.confirm(
        "Make this course public?\n\nOnce public it becomes read-only for non-admins and all users can access it.",
      );
      if (!ok) return;
    }
    setMenuOpen(false);
    startTransition(async () => {
      const res = await action(course.id);
      if (!res.success) alert(res.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    const ok = window.confirm(
      "Delete this course?\n\nIts units become standalone units. This cannot be undone.",
    );
    if (!ok) return;
    setMenuOpen(false);
    startTransition(async () => {
      const res = await deleteCourse(course.id);
      if (!res.success) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="group flex flex-col items-center">
      {/* Symbol zone */}
      <div className="relative">
        <Link
          href={`/library/${course.id}`}
          className="inline-block transition-transform hover:-translate-y-0.5"
          title={`${course.title} · ${course.level} · ${course.unitCount} units`}
        >
          <CourseLevelIcon
            level={course.level}
            title={course.title}
            courseId={course.id}
            size="lg"
          />
        </Link>

        {/* Top-right corner of the symbol: borrow (+) / return (x).
            Offset well clear of the square so the button never overlaps the
            book itself — the link owns the symbol, this button owns only
            itself, and neither can steal the other's tap. */}
        <button
          type="button"
          onClick={isBorrowed ? onRemove : onBorrow}
          disabled={pending}
          title={isBorrowed ? "Remove from My Books" : "Add to My Books"}
          aria-label={isBorrowed ? "Remove from My Books" : "Add to My Books"}
          className={`absolute -right-6 -top-6 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm transition-all disabled:opacity-50 ${
            isBorrowed
              ? "border-red-300 bg-white text-red-500 hover:bg-red-50"
              : "border-lingo-blue bg-lingo-blue text-white hover:bg-lingo-blue/90 active:scale-95"
          }`}
        >
          {pending ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : isBorrowed ? (
            <X className="h-3.5 w-3.5 stroke-[3]" />
          ) : (
            <Plus className="h-3.5 w-3.5 stroke-[3]" />
          )}
        </button>

        {/* Bottom-left of the symbol: owner controls */}
        {isOwner && (
          <div className="absolute -bottom-2 -left-2">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={actionPending}
              title="Course options"
              aria-label="Course options"
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-lingo-border bg-white text-lingo-text shadow-sm transition-colors hover:bg-lingo-gray/40 disabled:opacity-50"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {menuOpen && (
              <>
                {/* Click-away backdrop */}
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute bottom-7 left-0 z-40 w-40 overflow-hidden rounded-lg border-2 border-lingo-border bg-white text-sm shadow-lg">
                  <button
                    type="button"
                    onClick={toggleVisibility}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
                  >
                    {isPublic ? (
                      <>
                        <Lock className="h-4 w-4" /> Make Private
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4" /> Make Public
                      </>
                    )}
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
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 border-t border-lingo-border px-3 py-2 text-left font-bold text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Title beneath the symbol */}
      <p className="mt-2.5 line-clamp-2 min-h-[2rem] w-full px-1 text-center text-xs font-semibold leading-tight text-lingo-text">
        {course.title}
      </p>
    </div>
  );
}

/** Right-side legend explaining each book symbol and CEFR level colour. */
export function LibraryLegend() {
  return (
    <div className="rounded-2xl border-2 border-lingo-border bg-white p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
        Book type
      </p>
      <ul className="space-y-1.5">
        {QUESTION_TYPE_LEGEND.map(({ id, label, Icon, bg }) => (
          <li key={id} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${bg}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-medium text-lingo-text">{label}</span>
          </li>
        ))}
      </ul>

      <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
        Difficulty (CEFR)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {LEVEL_LEGEND.map(({ level, bg }) => (
          <span
            key={level}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black text-white ${bg}`}
          >
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}