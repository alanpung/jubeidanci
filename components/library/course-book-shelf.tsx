"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import type { CourseListItem, StandaloneUnitInfo } from "@/lib/content/types";
import {
  CourseCover,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";
import { normalizeQuestionType } from "@/lib/content/question-types";
import {
  addCourseToLibrary,
  removeCourseFromLibrary,
  addUnitToLibrary,
  removeUnitFromLibrary,
} from "@/lib/actions/library";
import {
  LibraryFolders,
  STANDALONE_KEY,
  type GroupBy,
} from "@/components/library/library-folders";
import {
  AddRemoveButton,
  VisibilityToggle,
} from "@/components/library/book-parts";

/** A student may keep at most this many courses on the top ("My Favorite")
 *  shelf. */
const MY_FAVORITE_CAP = 8;

/** My Favorite grid geometry — 2-up on phones, 4-up from `min-[480px]`, the
 *  same rhythm the browse window uses, so a book is exactly as wide as the
 *  cover you tapped in the folder. */
const BOOK_GRID = "grid grid-cols-2 gap-3 min-[480px]:grid-cols-4";

/** One tile in the browse window.
 *
 *  A course and a standalone unit are drawn identically here — both are a
 *  cover — so the two kinds share one grid and the student never has to
 *  learn two different layouts. */
interface BrowseEntry {
  id: string;
  kind: "course" | "unit";
  title: string;
  level: string | null;
  /** Exercise-type id deciding the cover's colour + symbol. */
  typeId: string | null;
  /** The course behind this entry, when there is one (owner toggle). */
  course?: CourseListItem;
  isOwner: boolean;
  isInLibrary: boolean;
  /** Whether the +/× control is meaningful for this entry. */
  showToggle: boolean;
  href: string;
  meta: string;
  onAdd: () => void;
  onRemove: () => void;
}

interface CourseBookShelfProps {
  /** Full catalog: public courses + the viewer's own. */
  courses: CourseListItem[];
  /** Units the AI tutor made — they live in their own Library folder. */
  units: StandaloneUnitInfo[];
  isAdmin: boolean;
}

export function CourseBookShelf({ courses, units, isAdmin }: CourseBookShelfProps) {
  const router = useRouter();
  const [borrowedIds, setBorrowedIds] = useState<Set<string>>(
    () => new Set(courses.filter((c) => c.isInLibrary).map((c) => c.id)),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingUnitId, setPendingUnitId] = useState<string | null>(null);
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
  const borrowed = courses
    .filter((c) => borrowedIds.has(c.id))
    .slice(0, MY_FAVORITE_CAP);

  // Exercise type lives in the cover, not in a column, so derive it the same
  // way CourseCover does — otherwise the folder and the cover could disagree
  // about what a book is.
  const typeLabelOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  const courseEntries: BrowseEntry[] = courses.map((c) => ({
    id: c.id,
    kind: "course",
    title: c.title,
    level: c.level,
    typeId: normalizeQuestionType(`${c.title} ${c.id}`)?.id ?? null,
    course: c,
    isOwner: !!c.isOwner || isAdmin,
    isInLibrary: borrowedIds.has(c.id),
    showToggle: true,
    href: `/library/${c.id}`,
    meta: `${c.unitCount} ${c.unitCount === 1 ? "unit" : "units"}`,
    onAdd: () => borrow(c),
    onRemove: () => unborrow(c),
  }));

  // Standalone units always wear the "mix" symbol: they mix exercise types
  // by nature and the AI tutor never gives them a single type of their own.
  const unitEntries: BrowseEntry[] = units.map((u) => ({
    id: u.id,
    kind: "unit",
    title: u.title,
    level: u.level,
    typeId: "mix",
    isOwner: !!u.isOwner,
    isInLibrary: !!u.isInLibrary,
    // Your own unit is already yours — there is nothing to add to a shelf.
    showToggle: !u.isOwner,
    href: `/unit/${u.id}`,
    meta: `${u.lessonCount} ${u.lessonCount === 1 ? "lesson" : "lessons"}`,
    onAdd: () => addUnit(u.id),
    onRemove: () => removeUnit(u.id),
  }));

  // The window deliberately lists *every* entry of this folder — including the
  // ones already on the shelf — so the +/× toggle is what adds or removes.
  const openEntries: BrowseEntry[] =
    activeKey === STANDALONE_KEY
      ? unitEntries
      : groupBy === "level"
        ? courseEntries.filter(
            (e) => (e.level || "").toUpperCase() === activeKey,
          )
        : courseEntries.filter((e) => typeLabelOf(e.course!) === activeKey);

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

  function addUnit(unitId: string) {
    setPendingUnitId(unitId);
    startTransition(async () => {
      try {
        const res = await addUnitToLibrary(unitId);
        if (res.success) router.refresh();
        else alert(res.error);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to add unit");
      } finally {
        setPendingUnitId(null);
      }
    });
  }

  function removeUnit(unitId: string) {
    setPendingUnitId(unitId);
    startTransition(async () => {
      try {
        const res = await removeUnitFromLibrary(unitId);
        if (res.success) router.refresh();
        else alert(res.error);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to remove unit");
      } finally {
        setPendingUnitId(null);
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
          page navigation). On phones the window takes over the whole screen;
          from lg up it sits underneath the folders. */}
      <LibraryFolders
        groupBy={groupBy}
        onGroupBy={handleGroupBy}
        activeKey={activeKey}
        onOpenKey={(key) => setActiveKey((cur) => (cur === key ? null : key))}
        standaloneCount={units.length}
      >
        {activeKey && (
          <TypeBrowserWindow
            title={activeKey === STANDALONE_KEY ? "Standalone Units" : activeKey}
            entries={openEntries}
            pendingId={pendingId}
            pendingUnitId={pendingUnitId}
            onClose={() => setActiveKey(null)}
          />
        )}
      </LibraryFolders>
    </div>
  );
}

/** The browser window opened from a Library folder.
 *
 *  On phones it takes over the *whole* screen — a fixed, full-height panel —
 *  so a folder shows its covers straight away instead of a sliver behind a
 *  scrollbar. From `lg` up it drops back into normal flow underneath the
 *  folders, as a bordered panel. */
function TypeBrowserWindow({
  title,
  entries,
  pendingId,
  pendingUnitId,
  onClose,
}: {
  title: string;
  entries: BrowseEntry[];
  pendingId: string | null;
  pendingUnitId: string | null;
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
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-lingo-card lg:static lg:inset-auto lg:z-auto lg:mt-4 lg:rounded-2xl lg:border-2 lg:border-lingo-border lg:shadow-lg"
      role="dialog"
      aria-modal="false"
      aria-label={`${title} courses`}
    >
      <div className="flex shrink-0 items-center gap-3 border-b-2 border-lingo-border px-3 py-2.5 sm:px-5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-black text-lingo-text sm:text-base">
          {title}
        </h2>
        <span className="shrink-0 rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
          {entries.length}
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
        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-lingo-text-light">
            No {title.toLowerCase()} yet.
          </p>
        ) : (
          /* Two columns on a phone = three full rows of covers fill the
             screen without a scrollbar; wider screens fit four. */
          <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
            {entries.map((e) => (
              <BrowseCover
                key={`${e.kind}-${e.id}`}
                entry={e}
                pending={
                  e.kind === "course"
                    ? pendingId === e.id
                    : pendingUnitId === e.id
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One cover inside the browse window: the cover, the title under it, and the
 *  controls that float over the cover's top corners. */
function BrowseCover({ entry, pending }: { entry: BrowseEntry; pending: boolean }) {
  return (
    <div className="group relative flex flex-col">
      <div className="relative">
        <Link
          href={entry.href}
          title={entry.title}
          aria-label={`Open ${entry.title}`}
          className="block"
        >
          <CourseCover
            level={entry.level}
            questionType={entry.typeId}
            title={entry.title}
            courseId={entry.id}
          />
        </Link>

        {entry.course && entry.isOwner ? (
          <div className="absolute -left-1.5 -top-1.5 z-20">
            <VisibilityToggle course={entry.course} className="h-6 w-6" />
          </div>
        ) : null}

        {entry.showToggle ? (
          <div className="absolute -right-1.5 -top-1.5 z-20">
            <AddRemoveButton
              isAdded={entry.isInLibrary}
              pending={pending}
              onAdd={entry.onAdd}
              onRemove={entry.onRemove}
            />
          </div>
        ) : null}
      </div>

      <p className="mt-1.5 line-clamp-2 text-center text-[11px] font-bold leading-tight text-lingo-text">
        {entry.title}
      </p>
      <p className="text-center text-[10px] font-semibold text-lingo-text-light">
        {entry.meta}
      </p>
    </div>
  );
}

/** A single book on the My Favorite shelf.
 *
 *  The cover is the tile: a big, fully coloured button with the symbol on it
 *  and the title underneath. There is no white card wrapping it, so the grid
 *  reads as a shelf of books rather than a row of small pictures in big
 *  white boxes. The whole tile opens the course for study (stretched-link: a
 *  transparent <Link> fills the tile); the round × in the top-right corner
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

      {/* The cover — same size and shape as the folder icons above it. */}
      <div className="w-full transition-transform group-hover:-translate-y-0.5">
        <CourseCover
          level={course.level}
          title={course.title}
          courseId={course.id}
        />
      </div>

      <p className="pointer-events-none mt-1.5 w-full line-clamp-2 text-center text-[11px] font-bold leading-tight text-lingo-text">
        {course.title}
      </p>

      {/* Take it off the shelf — × in the top-right corner, above the stretched
          link so removing a book never navigates into it. */}
      <div className="absolute -right-1.5 -top-1.5 z-20">
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
