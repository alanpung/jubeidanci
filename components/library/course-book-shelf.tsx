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
  VisibilityBadge,
  CoverEditButton,
} from "@/components/library/book-parts";

/** A student may keep at most this many courses on the top ("My Books")
 *  shelf. The grid matches the Library folders exactly (2-up on phones, 4-up
 *  from `min-[480px]`), so the cap of eight fills exactly two tidy rows. */
const MY_BOOKS_CAP = 8;

/** Shared grid geometry for *every* cover on the page — My Books, the
 *  Library folders, and the browse window all use these exact classes, so a
 *  folder tile and the book cover you tap inside it are the same width. */
const COVER_GRID = "grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-4";

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
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Switching grouping mode closes any open folder.
  function handleGroupBy(g: GroupBy) {
    setGroupBy(g);
    setActiveKey(null);
  }

  // Cap the shelf at MY_BOOKS_CAP so the top row never overflows its grid.
  const borrowed = courses
    .filter((c) => borrowedIds.has(c.id))
    .slice(0, MY_BOOKS_CAP);

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
    if (borrowedIds.size >= MY_BOOKS_CAP) {
      alert(`You can keep at most ${MY_BOOKS_CAP} books. Remove one first.`);
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
      {/* My Books — the reader's own picks, capped at MY_BOOKS_CAP */}
      <section>
        <div className="mb-4 flex items-center justify-center gap-2">
          <h2 className="text-base font-bold text-lingo-text">My Books</h2>
          <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
            {borrowed.length}/{MY_BOOKS_CAP}
          </span>
        </div>

        {borrowed.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-lingo-border bg-white p-4 text-center text-sm text-lingo-text-light">
            No books yet. Open a folder under{" "}
            <span className="font-black">Library</span> below and tap the{" "}
            <span className="font-black text-lingo-blue">+</span> on any book
            to add it here.
          </p>
        ) : (
          <div className={COVER_GRID}>
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

      {/* Library — folders grouped by exercise Type (default) or CEFR Level,
          right below My Books. Tapping one opens the small browser window (no
          page navigation) that overlays the folders from the top. */}
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
 *  It always layers *over* the folder grid (absolute, exactly the grid's own
 *  box) so the reader browses in place of the folders instead of pushing them
 *  off-screen or dropping below them. Every entry is a cover — the same filled
 *  tile used on My Books — so the window reads as a tray of the same objects
 *  the folders represent. */
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
      className="absolute inset-0 z-30 flex flex-col overflow-hidden rounded-2xl border-2 border-lingo-border bg-lingo-bg shadow-2xl"
      role="dialog"
      aria-modal="false"
      aria-label={`${title} courses`}
      // Clicking the window's empty area (header, gaps, padding) closes it.
      // Individual covers/controls stop this from bubbling (see BrowseCover).
      onClick={onClose}
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
          <div className={COVER_GRID}>
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

/** One cover inside the browse window: the cover and the controls that float
 *  over the cover's corners.
 *
 *  It is the *same* tile as a My Books book — no caption under the cover, so
 *  the "N units"/"N lessons" wording is gone to match My Books. The only
 *  difference is the top-right control: a + (not yet in My Library) or × (in
 *  it). The owner also gets the public/private/hide switch at the bottom-left. */
function BrowseCover({ entry, pending }: { entry: BrowseEntry; pending: boolean }) {
  // A course/unit can only be opened once it is on My Books — until then the
  // cover is inert (no navigation) and the only action is the +/× toggle.
  const canOpen = entry.isInLibrary;
  const cover = (
    <CourseCover
      level={entry.level}
      questionType={entry.typeId}
      title={entry.title}
      courseId={entry.id}
      name={entry.title}
    />
  );
  return (
    <div
      className="group relative flex flex-col"
      // Swallow clicks on the cover tile so they never bubble up to the
      // window's onClick (which closes it). The toggle/edit handle their own
      // clicks; the inert cover simply does nothing.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full">
        {canOpen ? (
          <Link
            href={entry.href}
            title={entry.title}
            aria-label={`Open ${entry.title}`}
            className="block"
          >
            {cover}
          </Link>
        ) : (
          cover
        )}

        {/* Public / VIP indicator — INSIDE the cover, upper-left. */}
        <div className="absolute left-1.5 top-1.5 z-20">
          <VisibilityBadge
            visibility={entry.course ? entry.course.visibility : "public"}
          />
        </div>

        {/* + to add to My Library, or × to remove — INSIDE the cover, top-right. */}
        {entry.showToggle ? (
          <div className="absolute right-1.5 top-1.5 z-20">
            <AddRemoveButton
              isAdded={entry.isInLibrary}
              pending={pending}
              onAdd={entry.onAdd}
              onRemove={entry.onRemove}
            />
          </div>
        ) : null}

        {/* Owner-only edit (public / VIP / hide) — INSIDE the cover, lower-left. */}
        {entry.course && entry.isOwner ? (
          <div className="absolute left-1.5 bottom-1.5 z-20">
            <CoverEditButton course={entry.course} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A single book on the My Books shelf.
 *
 *  Deliberately the SAME vertical tile as a Library folder — same grid, same
 *  filled cover, same `mt-1.5 text-[11px]` title — so a My Books card is
 *  exactly as wide as the folder it sits above and the two grids stay aligned.
 *  The whole tile opens the course for study (stretched-link: a transparent
 *  <Link> fills the tile); the round × in the top-right corner sits above that
 *  overlay in z-order and keeps its own click, so removing a book never
 *  navigates into it. A non-public book wears the VIP crown; the owner also
 *  gets the public/private/hide switch at the bottom-left. */
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
        className="absolute inset-0 z-10 rounded-2xl"
      />

      <div className="relative w-full">
        <CourseCover
          level={course.level}
          title={course.title}
          courseId={course.id}
          name={course.title}
        />

        {/* Public / VIP indicator — INSIDE the cover, upper-left. */}
        <div className="absolute left-1.5 top-1.5 z-20">
          <VisibilityBadge visibility={course.visibility} />
        </div>

        {/* Take it off the shelf — × INSIDE the cover, top-right, above the
            stretched link so removing a book never navigates into it. */}
        <div className="absolute right-1.5 top-1.5 z-20">
          <AddRemoveButton
            isAdded={isBorrowed}
            pending={pending}
            onAdd={onBorrow}
            onRemove={onRemove}
          />
        </div>

        {/* Owner-only edit (public / VIP / hide) — INSIDE the cover, lower-left. */}
        {course.isOwner ? (
          <div className="absolute left-1.5 bottom-1.5 z-20">
            <CoverEditButton course={course} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
