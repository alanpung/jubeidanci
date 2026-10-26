"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import {
  CourseLevelIcon,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";
import { LibraryFolders, type GroupBy } from "@/components/library/library-folders";
import {
  AddRemoveButton,
  VisibilityToggle,
} from "@/components/library/book-parts";

/** A student may keep at most this many courses on the top ("My Favorite")
 *  shelf. The grid matches the Library folders exactly (2-up on phones, 4-up
 *  from `min-[480px]`), so the cap of eight fills exactly two tidy rows. */
const MY_FAVORITE_CAP = 8;

/** My Favorite grid geometry — deliberately the *same* classes as the Library
 *  folder grid, so a book tile is exactly as wide as the folder it came from. */
const BOOK_GRID = "grid grid-cols-2 gap-2 min-[480px]:grid-cols-4";

/** Browse-window row geometry. The window layers OVER the folder grid on
 *  phones, so it reuses the folder grid's own 2-up / 4-up rhythm with the same
 *  gap — every entry lines up with the folder tile above it. */
const WINDOW_BOOK_GRID = "grid grid-cols-2 gap-2 min-[480px]:grid-cols-4";

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
  // Which Library folder is open, by level or exercise-type label. null = closed.
  const [groupBy, setGroupBy] = useState<GroupBy>("level");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Switching grouping mode closes any open folder.
  function handleGroupBy(g: GroupBy) {
    setGroupBy(g);
    setActiveKey(null);
  }

  // Cap the shelf at MY_FAVORITE_CAP so the top row never overflows its grid.
  const borrowed = courses.filter((c) => borrowedIds.has(c.id)).slice(0, MY_FAVORITE_CAP);

  // Exercise type lives in the book symbol, not in a column, so derive it the
  // same way CourseLevelIcon does — otherwise the folder and the cover could
  // disagree about what a book is.
  const typeOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  // The window deliberately lists *every* course of this level/type —
  // including ones already on the shelf — so the +/× toggle is what adds or
  // removes.
  const openCourses = activeKey
    ? groupBy === "level"
      ? courses.filter((c) => (c.level || "").toUpperCase() === activeKey)
      : courses.filter((c) => typeOf(c) === activeKey)
    : [];

  function borrow(course: CourseListItem) {
    if (borrowedIds.size >= MY_FAVORITE_CAP) {
      alert(`You can keep at most ${MY_FAVORITE_CAP} favorites. Remove one first.`);
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
      {/* My Favorite — the reader's own picks, capped at MY_FAVORITE_CAP */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">My Favorite</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {borrowed.length}/{MY_FAVORITE_CAP}
          </span>
        </div>

        {borrowed.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            No favorites yet. Open a folder under{" "}
            <span className="font-black">Library</span> below and tap the{" "}
            <span className="font-black text-lingo-blue">+</span> on any book
            to add it here.
          </p>
        ) : (
          <div className={BOOK_GRID}>
            {borrowed.map((c) => (
              <CourseBook
                key={c.id}
                course={c}
                isBorrowed
                pending={pendingId === c.id}
                onBorrow={() => borrow(c)}
                onRemove={() => unborrow(c)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Library — folders grouped by CEFR Level (default) or exercise Type,
          right below My Favorite. Tapping one opens the small browser window (no
          page navigation). On phones the window layers over the folders; from
          lg up it sits underneath them. */}
      <LibraryFolders
        groupBy={groupBy}
        onGroupBy={handleGroupBy}
        activeKey={activeKey}
        onOpenKey={(key) => setActiveKey((cur) => (cur === key ? null : key))}
      >
        {activeKey && (
          <TypeBrowserWindow
            title={activeKey}
            courses={openCourses}
            isAdmin={isAdmin}
            borrowedIds={borrowedIds}
            pendingId={pendingId}
            onBorrow={borrow}
            onRemove={unborrow}
            onClose={() => setActiveKey(null)}
          />
        )}
      </LibraryFolders>
    </div>
  );
}

/** The browser window opened from a Library folder.
 *
 *  On phones it layers *over* the folder grid (absolute, exactly the grid's
 *  own box) so the reader browses in place of the folders instead of pushing
 *  them off-screen. From `lg` up it drops back into normal flow underneath.
 *
 *  Entries are browse-only rows: the symbol is deliberately NOT a link. A
 *  course in the Library catalogue is for browsing and add/remove — only the
 *  copies on My Favorite open for study. */
function TypeBrowserWindow({
  title,
  courses,
  isAdmin,
  borrowedIds,
  pendingId,
  onBorrow,
  onRemove,
  onClose,
}: {
  // Holds the folder's key: a CEFR level ("B1") when grouped by level, or an
  // exercise-type label ("Translation") when grouped by type.
  title: string;
  courses: CourseListItem[];
  isAdmin: boolean;
  borrowedIds: Set<string>;
  pendingId: string | null;
  onBorrow: (c: CourseListItem) => void;
  onRemove: (c: CourseListItem) => void;
  onClose: () => void;
}) {
  // Escape closes the window. The page scroll stays live on purpose — the
  // window is a bounded panel, and locking the body would only trap the
  // reader on a phone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col overflow-hidden rounded-2xl border-2 border-lingo-border bg-lingo-card shadow-2xl lg:static lg:inset-auto lg:mt-4 lg:shadow-lg"
      role="dialog"
      aria-modal="false"
      aria-label={`${title} courses`}
    >
      <div className="flex shrink-0 items-center gap-3 border-b-2 border-lingo-border px-3 py-2.5 sm:px-5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-black text-lingo-text sm:text-base">
          {title}
        </h2>
        <span className="shrink-0 rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
          {courses.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-lingo-border bg-white text-lingo-text transition-colors hover:bg-lingo-gray/40"
        >
          <X className="h-4 w-4 stroke-[3]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:px-5 sm:py-4">
        {courses.length === 0 ? (
          <p className="py-10 text-center text-sm text-lingo-text-light">
            No {title.toLowerCase()} courses yet.
          </p>
        ) : (
          <div className={WINDOW_BOOK_GRID}>
            {courses.map((c) => (
              <BrowseRow
                key={c.id}
                course={c}
                isOwner={!!c.isOwner || isAdmin}
                isAdded={borrowedIds.has(c.id)}
                pending={pendingId === c.id}
                onAdd={() => onBorrow(c)}
                onRemove={() => onRemove(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One browse-only row inside the window: symbol + title, and the circular
 *  add/remove control pinned to the right edge. Nothing here navigates — the
 *  symbol matches the folder icon's size so the panel reads as a tray of the
 *  same objects the folders represent. */
function BrowseRow({
  course,
  isOwner,
  isAdded,
  pending,
  onAdd,
  onRemove,
}: {
  course: CourseListItem;
  isOwner: boolean;
  isAdded: boolean;
  pending: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 border-lingo-border bg-white p-3 pl-2.5 shadow-sm">
      <div className="relative -ml-1 shrink-0">
        <div
          title={`${course.title} · ${course.level} · ${course.unitCount} units`}
          className="cursor-default"
        >
          <CourseLevelIcon
            level={course.level}
            title={course.title}
            courseId={course.id}
            size="md"
          />
        </div>
      </div>

      <p className="min-w-0 flex-1 text-xs font-semibold leading-tight text-lingo-text">
        {course.title}
      </p>

      {isOwner && (
        <VisibilityToggle course={course} className="h-6 w-6" />
      )}
      <AddRemoveButton
        isAdded={isAdded}
        pending={pending}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    </div>
  );
}

/** A single book on the My Favorite shelf.
 *
 *  No white card frame: the course symbol IS the tile, sitting directly on the
 *  page background, with the title underneath. A white wrapper around a 48px
 *  icon was mostly empty space, so the grid read as a row of small pictures in
 *  big white boxes. The whole tile opens the course for study (stretched-link:
 *  a transparent <Link> fills the tile); the round × in the top-right corner
 *  sits above that overlay in z-order and keeps its own click, so removing a
 *  book never navigates into it. */
function CourseBook({
  course,
  isBorrowed,
  pending,
  onBorrow,
  onRemove,
}: {
  course: CourseListItem;
  isBorrowed: boolean;
  pending: boolean;
  onBorrow: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex flex-col items-center">
      {/* Stretched link: the entire tile opens the course for study. */}
      <Link
        href={`/library/${course.id}`}
        title={`${course.title} · ${course.level} · ${course.unitCount} units`}
        aria-label={`Open ${course.title}`}
        className="absolute inset-0 z-10"
      />

      {/* Symbol zone — same size as the folder icon. */}
      <div className="relative">
        <div className="transition-transform group-hover:-translate-y-0.5">
          <CourseLevelIcon
            level={course.level}
            title={course.title}
            courseId={course.id}
            size="md"
          />
        </div>
      </div>

      <p className="pointer-events-none mt-1.5 w-full line-clamp-2 text-center text-[11px] font-bold leading-tight text-lingo-text">
        {course.title}
      </p>

      {/* Take it off the shelf — × in the top-right corner, above the stretched
          link so removing a book never navigates into it. */}
      <div className="absolute right-0 top-0 z-20">
        <AddRemoveButton
          isAdded={isBorrowed}
          pending={pending}
          onAdd={onBorrow}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
