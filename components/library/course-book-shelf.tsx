"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import {
  CourseLevelIcon,
  QUESTION_TYPE_LEGEND,
  LEVEL_LEGEND,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";
import { CreateCourseForm } from "@/components/library/create-course-form";
import { LibraryFolders } from "@/components/library/library-folders";
import {
  AddRemoveButton,
  VipCornerBadge,
  VisibilityToggle,
} from "@/components/library/book-parts";

/** A student may keep at most this many courses on the top ("My Books")
 *  shelf. Four per row on phones = two rows; all eight on one row on desktop. */
const MY_BOOKS_CAP = 8;

/** Book grid geometry for the top shelf. */
const BOOK_GRID = "grid grid-cols-4 gap-x-3 gap-y-8 lg:grid-cols-8";

/** Browse-window row geometry. The window layers OVER the folder grid on
 *  phones, so it reuses the folder's own 2-up rhythm with equal-width columns. */
const WINDOW_BOOK_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-3 min-[480px]:grid-cols-3 lg:grid-cols-4";

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
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">My Books</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {borrowed.length}/{MY_BOOKS_CAP}
          </span>
        </div>

        {borrowed.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            Your shelf is empty. Open a folder under{" "}
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

      {/* Library — eight exercise-type folders, right below My Books. Tapping
          one opens the small browser window (no page navigation). On phones the
          window layers over the folders; from lg up it sits underneath them. */}
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

/** The browser window opened from a Library folder.
 *
 *  On phones it layers *over* the folder grid (absolute, exactly the grid's
 *  own box) so the reader browses in place of the folders instead of pushing
 *  them off-screen. From `lg` up it drops back into normal flow underneath.
 *
 *  Entries are browse-only rows: the symbol is deliberately NOT a link. A
 *  course in the Library catalogue is for browsing and add/remove — only the
 *  copies on My Books open for study. */
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
      aria-label={`${typeLabel} courses`}
    >
      <div className="flex shrink-0 items-center gap-3 border-b-2 border-lingo-border px-3 py-2.5 sm:px-5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-black text-lingo-text sm:text-base">
          {typeLabel}
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
            No {typeLabel.toLowerCase()} courses yet.
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
  const isPublic = course.visibility === "public";

  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-lingo-border bg-white p-2 shadow-sm">
      <div className="relative shrink-0">
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
        {!isPublic && <VipCornerBadge />}
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

/** A single book on the My Books shelf.
 *
 *  Deliberately styled like a Library folder tile — same border, radius,
 *  padding and shadow — so the shelf reads as "the folders you picked", and
 *  the only difference is the × on the right taking a book back off the shelf.
 *  There is no public/VIP toggle here: the owner manages visibility from the
 *  Library browse window, where every course is listed. */
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
  const isPublic = course.visibility === "public";

  return (
    <div className="group relative flex flex-col items-center rounded-2xl border-2 border-lingo-border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-lingo-green hover:shadow-[0_4px_0_0] hover:shadow-lingo-border">
      {/* Symbol zone. The link owns the symbol and the title; the × owns only
          itself, so neither can steal the other's tap. */}
      <div className="relative">
        <Link
          href={`/library/${course.id}`}
          className="inline-block transition-transform group-hover:-translate-y-0.5"
          title={`${course.title} · ${course.level} · ${course.unitCount} units`}
        >
          <CourseLevelIcon
            level={course.level}
            title={course.title}
            courseId={course.id}
            size="md"
          />
        </Link>

        {/* Small VIP lock, upper-left corner of the symbol. */}
        {!isPublic && <VipCornerBadge />}
      </div>

      {/* Title beneath the symbol */}
      <p className="mt-2 line-clamp-2 min-h-[2rem] w-full px-4 text-center text-xs font-bold leading-tight text-lingo-text">
        {course.title}
      </p>

      {/* Take it off the shelf — × on the right, mirroring the folder tile's
          right-hand control in the browse window. */}
      <div className="absolute bottom-2 right-2">
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