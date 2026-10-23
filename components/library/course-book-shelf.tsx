"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, MoreHorizontal, Globe, Lock, Pencil, Trash2, FolderOpen } from "lucide-react";
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
import { AddRemoveSwitch } from "@/components/library/add-remove-switch";

/** A student may keep at most this many courses on the top ("My Books")
 *  shelf. Four per row on phones = two rows; all eight on one row on desktop. */
const MY_BOOKS_CAP = 8;

/** Book grid geometry for the top shelf. */
const BOOK_GRID = "grid grid-cols-4 gap-x-3 gap-y-8 lg:grid-cols-8";

/** Book grid geometry inside the type window. On phones only two columns fit
 *  comfortably; grid columns are equal width by default and each book centres
 *  itself inside its column, so the two columns get identical space. */
const WINDOW_BOOK_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-8 min-[480px]:grid-cols-4 lg:grid-cols-8";

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
        <div className="mb-6 flex items-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">My Books</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {borrowed.length}/{MY_BOOKS_CAP}
          </span>
        </div>

        {borrowed.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            Your shelf is empty. Open a folder under{" "}
            <span className="font-black">Library</span> below and tap{" "}
            <span className="font-black text-lingo-green">Add</span> on any book
            to put it here.
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
          one opens the small browser window (no page navigation). The window
          is rendered *inside* the Library section so it never covers the My
          Books shelf above it. */}
      <LibraryFolders
        onOpenType={(label) =>
          setOpenType((cur) => (cur === label ? null : label))
        }
        activeType={openType}
      >
        {openType && (
          <TypeBrowserWindow
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
      </LibraryFolders>
    </div>
  );
}

/** The small browser window opened from a Library folder. It sits inside the
 *  Library section — directly under the folder grid — so the My Books shelf
 *  above stays visible and usable while it is open. Lists every course of the
 *  chosen exercise type at the same size as the shelf books, each with a +/×
 *  toggle so the reader can add to or remove from My Books without leaving
 *  the library page. */
function TypeBrowserWindow({
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
  // Escape closes the window. The page scroll stays live on purpose — the
  // window no longer floats over the page, so locking the body would only
  // trap the reader.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border-2 border-lingo-border bg-lingo-card shadow-lg"
      role="dialog"
      aria-modal="false"
      aria-label={`${typeLabel} courses`}
    >
      <div className="flex items-center gap-3 border-b-2 border-lingo-border px-4 py-3 sm:px-5">
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

      {/* pt-5: the add/remove control now lives at the bottom of each book, so
          the first row only needs a little breathing room below this header. */}
      <div className="max-h-[70vh] overflow-y-auto px-4 pb-6 pt-5 sm:px-5">
        {courses.length === 0 ? (
          <p className="py-10 text-center text-sm text-lingo-text-light">
            No {typeLabel.toLowerCase()} courses yet.
          </p>
        ) : (
          <div className={WINDOW_BOOK_GRID}>
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

        {/* Owner controls live at the bottom-left of the symbol; the add/remove
            control moved to a toggle switch at the bottom of the book (see
            AddRemoveSwitch below) so it never crowds the cover or this menu. */}

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
                <div className="absolute bottom-7 left-0 z-40 w-44 overflow-hidden rounded-xl border-2 border-lingo-border bg-white text-sm shadow-lg">
                  <button
                    type="button"
                    onClick={toggleVisibility}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
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
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                  <Link
                    href={`/library/${course.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-lingo-text hover:bg-lingo-gray/30"
                  >
                    <FolderOpen className="h-4 w-4" /> Manage
                  </Link>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 border-t border-lingo-border px-3 py-2.5 text-left font-bold text-red-500 hover:bg-red-50"
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

      {/* Add / remove control — a bottom toggle switch so it never overlaps the
          cover or the owner menu. Green = Add, red = Remove. */}
      <div className="mt-2 w-full px-1">
        <AddRemoveSwitch
          isAdded={isBorrowed}
          pending={pending}
          onToggle={isBorrowed ? onRemove : onBorrow}
        />
      </div>
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