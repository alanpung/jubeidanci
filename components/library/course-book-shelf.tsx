"use client";

import { useState, useTransition, useEffect } from "react";
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
import { LibraryFolders } from "@/components/library/library-folders";

/** A student may keep at most this many courses on the top ("My Books")
 *  shelf. Four per row on phones = two rows; all eight on one row on desktop. */
const MY_BOOKS_CAP = 8;

/** Book grid geometry. Both the shelf and the type modal use this so a book
 *  looks identical in either place: 4 per row on mobile, 8 on desktop. */
const BOOK_GRID = "grid grid-cols-4 gap-x-3 gap-y-8 lg:grid-cols-8";

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
  // Which Library folder is open, by exercise-type label. null = closed.
  const [openType, setOpenType] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Cap the shelf at MY_BOOKS_CAP so the top row never overflows its grid.
  const borrowed = courses.filter((c) => borrowedIds.has(c.id)).slice(0, MY_BOOKS_CAP);

  // Exercise type lives in the book symbol, not in a column, so derive it the
  // same way CourseLevelIcon does — otherwise the folder and the cover could
  // disagree about what a book is.
  const typeOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  // The modal deliberately lists *every* course of this type — including ones
  // already on the shelf — so the +/× toggle is what adds or removes.
  const typeCourses = openType
    ? courses.filter((c) => typeOf(c) === openType)
    : [];

  function borrow(course: CourseListItem) {
    if (borrowedIds.size >= MY_BOOKS_CAP) {
      alert(`You can keep at most ${MY_BOOKS_CAP} books on your shelf. Remove one first.`);
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

      {/* My Books — the reader's own picks, capped at MY_BOOKS_CAP */}
      <section>
        {/* mb-8 (not mb-4): the +/× button sits 24px above each book, so the
            first row needs clearance or it collides with this heading. */}
        <div className="mb-8 flex items-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">My Books</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {borrowed.length}/{MY_BOOKS_CAP}
          </span>
        </div>

        {borrowed.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            Your shelf is empty. Open a folder under{" "}
            <span className="font-black">Library</span> below and tap the{" "}
            <span className="font-black">+</span> on any book to add it here.
          </p>
        ) : (
          // gap-y-8: the +/× button floats 24px above each book, so rows need
          // more than the old 20px or the next row's button lands on the
          // previous row's title.
          <div className={BOOK_GRID}>
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

      {/* Library — eight exercise-type folders, right below My Books. Tapping
          one opens the small browser window (no page navigation). */}
      <LibraryFolders onOpenType={setOpenType} />

      {openType && (
        <TypeBrowserModal
          typeLabel={openType}
          courses={typeCourses}
          isAdmin={isAdmin}
          borrowedIds={borrowedIds}
          pendingId={pendingId}
          onBorrow={borrow}
          onRemove={unborrow}
          onClose={() => setOpenType(null)}
        />
      )}
    </div>
  );
}

/** The small pop-up window opened from a Library folder. Lists every course of
 *  the chosen exercise type at the same size as the shelf books, each with a
 *  +/× toggle so the reader can add to or remove from My Books without leaving
 *  the library page. */
function TypeBrowserModal({
  typeLabel,
  courses,
  isAdmin,
  borrowedIds,
  pendingId,
  onBorrow,
  onRemove,
  onClose,
}: {
  typeLabel: string;
  courses: CourseListItem[];
  isAdmin: boolean;
  borrowedIds: Set<string>;
  pendingId: string | null;
  onBorrow: (c: CourseListItem) => void;
  onRemove: (c: CourseListItem) => void;
  onClose: () => void;
}) {
  // Escape closes; the body scroll is locked so the page behind does not move
  // while the window is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${typeLabel} courses`}
    >
      {/* Click-away backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div className="relative flex max-h-full w-full max-w-4xl flex-col rounded-2xl border-2 border-lingo-border bg-lingo-card shadow-xl">
        <div className="flex items-center gap-3 border-b-2 border-lingo-border px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-black text-lingo-text">
            {typeLabel}
          </h2>
          <span className="shrink-0 rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {courses.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-lingo-border bg-white text-lingo-text transition-colors hover:bg-lingo-gray/40"
          >
            <X className="h-4 w-4 stroke-[3]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {courses.length === 0 ? (
            <p className="py-10 text-center text-sm text-lingo-text-light">
              No {typeLabel.toLowerCase()} courses yet.
            </p>
          ) : (
            <div className={BOOK_GRID}>
              {courses.map((c) => (
                <CourseBook
                  key={c.id}
                  course={c}
                  isAdmin={isAdmin}
                  isBorrowed={borrowedIds.has(c.id)}
                  pending={pendingId === c.id}
                  onBorrow={() => onBorrow(c)}
                  onRemove={() => onRemove(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
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
                        <Lock className="h-4 w-4" /> Make VIP
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
      {!isPublic && (
        <span className="mt-1 rounded-full bg-lingo-gray px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-lingo-text-light">
          🔒 VIP
        </span>
      )}
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