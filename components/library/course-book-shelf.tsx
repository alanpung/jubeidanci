"use client";

import {
  useState,
  useTransition,
  useEffect,
  useRef,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, GripVertical } from "lucide-react";
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
import { deleteCourse, deleteUnit } from "@/lib/actions/units";
import { saveMyBooksOrder } from "@/lib/actions/preferences";
import {
  LibraryFolders,
  STANDALONE_KEY,
  type GroupBy,
} from "@/components/library/library-folders";
import {
  AddRemoveButton,
  VisibilityBadge,
  CoverEditButton,
  EditTitleButton,
  UnitMenuButton,
} from "@/components/library/book-parts";

/** A *student* may keep at most this many courses on the top ("My Books")
 *  shelf. The grid matches the Library folders exactly (2-up on phones, 4-up
 *  from `min-[480px]`), so the cap of eight fills exactly two tidy rows.
 *  The cap is intentionally STUDENT-ONLY: the site owner / admin
 *  (e.g. alan.pung@gmail.com) is exempt and sees every enrolled course on
 *  their shelf — they are never truncated to eight. */
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
  /** The viewer CREATED this entry — so it is automatically theirs: no +/×
   *  toggle, no shelf cap. */
  ownsIt: boolean;
  /** The viewer may manage this entry (creator, or the site owner). */
  isOwner: boolean;
  isInLibrary: boolean;
  /** Whether the +/× control is meaningful for this entry. */
  showToggle: boolean;
  href: string;
  onAdd: () => void;
  onRemove: () => void;
  /** Destroy the entry for good (owner/admin only, irreversible). */
  onDeleteForever?: () => void;
}

interface CourseBookShelfProps {
  /** Full catalog: public courses + the viewer's own. */
  courses: CourseListItem[];
  /** Units the AI tutor made — they live in their own Library folder. */
  units: StandaloneUnitInfo[];
  isAdmin: boolean;
  /** The reader's saved "My Books" order: course ids, first id first. Empty
   *  (or absent) simply means "no order saved yet" — the shelf then shows
   *  the catalog order until they drag something. */
  bookOrder?: string[];
}

export function CourseBookShelf({
  courses,
  units,
  isAdmin,
  bookOrder = [],
}: CourseBookShelfProps) {
  const router = useRouter();
  const [borrowedIds, setBorrowedIds] = useState<Set<string>>(
    () => new Set(courses.filter((c) => c.isInLibrary).map((c) => c.id)),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingUnitId, setPendingUnitId] = useState<string | null>(null);
  // Entries the viewer took out of their library (or deleted) during this
  // session. The owner's Library lists the WHOLE catalog, so without this the
  // removal would be invisible — the cover would simply stay put.
  const [removedCourseIds, setRemovedCourseIds] = useState<Set<string>>(
    new Set(),
  );
  const [removedUnitIds, setRemovedUnitIds] = useState<Set<string>>(new Set());
  // Which Library folder is open, by level or exercise-type label. null = closed.
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Switching grouping mode closes any open folder.
  function handleGroupBy(g: GroupBy) {
    setGroupBy(g);
    setActiveKey(null);
  }

  // The owner's own books are already theirs — they are always on the shelf
  // and never take a slot from the 8-book cap (which only limits books the
  // owner *chooses* to keep). Everyone else's shelf is capped as before.
  const ownedIds = new Set(
    courses.filter((c) => c.isOwner).map((c) => c.id),
  );
  const borrowedOwn = courses.filter(
    (c) => ownedIds.has(c.id) && !removedCourseIds.has(c.id),
  );
  // Students are truncated to MY_BOOKS_CAP; the owner/admin sees every
  // enrolled course (no cap).
  const borrowedOther = courses
    .filter(
      (c) =>
        !ownedIds.has(c.id) &&
        borrowedIds.has(c.id) &&
        !removedCourseIds.has(c.id),
    )
    .slice(0, isAdmin ? courses.length : MY_BOOKS_CAP);
  const borrowed = [...borrowedOwn, ...borrowedOther];

  // ── "My Books" ordering — drag a book to sort the shelf ──
  // The order lives in two places: whatever the reader dragged to (kept in
  // state so a reorder is instant and survives the router.refresh() that
  // add/remove triggers) and, behind that, the order the server sent.
  const [shelfOrder, setShelfOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const orderSource = shelfOrder ?? bookOrder;
  // A book the reader has never sorted falls to the end in catalog order, so
  // a newly added book can never vanish while waiting to be placed.
  const rankOf = (id: string) => {
    const i = orderSource.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const orderedBorrowed = [...borrowed].sort(
    (a, b) => rankOf(a.id) - rankOf(b.id),
  );

  // The shelf's current order mirrored into a ref, so the drag listeners —
  // attached once per drag — always read the newest order rather than a stale
  // snapshot taken at the render that started the drag.
  const idsRef = useRef<string[]>([]);
  idsRef.current = orderedBorrowed.map((c) => c.id);

  // Live boxes of the shelf tiles, used to work out which book the pointer is
  // over. A grid has no single axis, so a hit-test — not a row/column sum —
  // is what makes reordering work in a 2-up or 4-up layout, on a phone just
  // as much as on a desktop.
  const itemEls = useRef(new Map<string, HTMLElement>());
  const registerItem = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemEls.current.set(id, el);
    else itemEls.current.delete(id);
  }, []);

  function hitTest(x: number, y: number): string | null {
    for (const [id, el] of itemEls.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }

  function startDrag(e: ReactPointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    // Capture the pointer so the drag keeps tracking after the finger leaves
    // the small grip. Without this the reorder dies instantly on touch.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragId(id);
  }

  // The drag is tracked on the WINDOW, not on the grip. Reordering moves the
  // tiles around in the DOM, and the browser drops an element's pointer
  // capture the moment that element is moved — listening on the grip alone
  // made the drag die after the very first swap. The window outlives every
  // reshuffle, so the drag keeps following the finger all the way.
  useEffect(() => {
    if (!dragId) return;
    // Assigned after the guard so its type is already `string` — TypeScript
    // drops the narrowing inside the hoisted listeners below otherwise.
    const dragging = dragId;

    function onMove(e: PointerEvent) {
      // Only act when the pointer is genuinely inside another tile: the swap
      // then settles the moment the dragged book takes the slot, instead of
      // oscillating back and forth between neighbours.
      const targetId = hitTest(e.clientX, e.clientY);
      if (!targetId || targetId === dragging) return;
      const ids = [...idsRef.current];
      const from = ids.indexOf(dragging);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      // Refresh the ref too, so a second swap in the same gesture (before
      // React re-renders) starts from the order we just produced.
      idsRef.current = ids;
      setShelfOrder(ids);
    }

    function onUp() {
      setDragId(null);
      const ids = idsRef.current;
      // One write per drag, not one per swap: the order is saved when the
      // reader lets go.
      startTransition(async () => {
        const res = await saveMyBooksOrder(ids);
        if (!res.success) {
          // Almost always the `my_books_order` column has not been migrated
          // in yet. The shelf still shows the new order — it just will not
          // survive a reload until then.
          console.warn("Could not save shelf order:", res.error);
        }
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragId]);

  // Exercise type lives in the cover, not in a column, so derive it the same
  // way CourseCover does — otherwise the folder and the cover could disagree
  // about what a book is.
  const typeLabelOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  // The owner's "My Books" is the whole catalog: every course is already
  // theirs, so it is openable and needs no +/× toggle. Students keep the
  // enrolled/owned logic (borrowed or created → in My Books, else a toggle).
  const isOwnerView = isAdmin;

  // The owner's Library IS their shelf, so an entry they took out has to
  // leave the folder too. A student still sees it in the folder — that is
  // the catalog they add books back from.
  const visibleCourses = isOwnerView
    ? courses.filter((c) => !removedCourseIds.has(c.id))
    : courses;
  const visibleUnits = isOwnerView
    ? units.filter((u) => !removedUnitIds.has(u.id))
    : units;

  const courseEntries: BrowseEntry[] = visibleCourses.map((c) => ({
    id: c.id,
    kind: "course",
    title: c.title,
    level: c.level,
    typeId: normalizeQuestionType(`${c.title} ${c.id}`)?.id ?? null,
    course: c,
    ownsIt: !!c.isOwner,
    isOwner: !!c.isOwner || isAdmin,
    // Owner view: every course is already in My Books — cover openable, no +.
    // A student-created-or-enrolled course is already theirs too.
    isInLibrary: isOwnerView ? true : (borrowedIds.has(c.id) || !!c.isOwner),
    showToggle: isOwnerView ? false : true,
    href: `/library/${c.id}`,
    onAdd: () => borrow(c),
    onRemove: () => unborrow(c),
    onDeleteForever: () => destroyCourse(c),
  }));

  // Standalone units always wear the "mix" symbol: they mix exercise types
  // by nature and the AI tutor never gives them a single type of their own.
  const unitEntries: BrowseEntry[] = visibleUnits.map((u) => ({
    id: u.id,
    kind: "unit",
    title: u.title,
    level: u.level,
    typeId: "mix",
    ownsIt: !!u.isOwner,
    isOwner: !!u.isOwner,
    // Owner view: every unit is already in My Books — openable, no +. A
    // student's own unit is already theirs too; otherwise the toggle applies.
    isInLibrary: isOwnerView ? true : (!!u.isInLibrary || !!u.isOwner),
    showToggle: isOwnerView ? false : !u.isOwner,
    href: `/unit/${u.id}`,
    onAdd: () => addUnit(u.id),
    onRemove: () => removeUnit(u.id),
    onDeleteForever: () => destroyUnit(u.id, u.title),
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
    // The 8-book cap is student-only. The owner/admin (and anyone viewing a
    // course they created) is exempt, so the shelf cap can never apply to them.
    if (!isAdmin && !course.isOwner && borrowedIds.size >= MY_BOOKS_CAP) {
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
          // Remember it so the owner's own Library drops the cover right away
          // instead of leaving it sitting in the folder.
          setRemovedCourseIds((s) => new Set(s).add(course.id));
          // Keep the saved shelf order from carrying ids that are no longer
          // on the shelf.
          setShelfOrder((prev) =>
            prev ? prev.filter((id) => id !== course.id) : prev,
          );
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
        if (res.success) {
          setRemovedUnitIds((s) => new Set(s).add(unitId));
          router.refresh();
        } else alert(res.error);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to remove unit");
      } finally {
        setPendingUnitId(null);
      }
    });
  }

  /** Delete a course FOR GOOD (owner/admin only).
   *
   *  This is the hard one: the course leaves the library for everyone, not
   *  just the viewer. The markdown under content/ stays the source of truth,
   *  so a later seed can bring the course back. */
  function destroyCourse(course: CourseListItem) {
    if (
      !window.confirm(
        `Delete "${course.title}" permanently?\n\nThis removes the course from the library for everyone. Its units stay, but become standalone units. This cannot be undone.`,
      )
    ) {
      return;
    }
    setPendingId(course.id);
    startTransition(async () => {
      try {
        const res = await deleteCourse(course.id);
        if (res.success) {
          setRemovedCourseIds((s) => new Set(s).add(course.id));
          setShelfOrder((prev) =>
            prev ? prev.filter((id) => id !== course.id) : prev,
          );
          router.refresh();
        } else alert(res.error);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete course");
      } finally {
        setPendingId(null);
      }
    });
  }

  /** Delete a standalone unit FOR GOOD (owner/admin only). */
  function destroyUnit(unitId: string, unitTitle: string) {
    if (
      !window.confirm(
        `Delete "${unitTitle}" permanently?\n\nThis removes the unit from the library for everyone. This cannot be undone.`,
      )
    ) {
      return;
    }
    setPendingUnitId(unitId);
    startTransition(async () => {
      try {
        const res = await deleteUnit(unitId);
        if (res.success) {
          setRemovedUnitIds((s) => new Set(s).add(unitId));
          router.refresh();
        } else alert(res.error);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete unit");
      } finally {
        setPendingUnitId(null);
      }
    });
  }

  return (
    <div>
      {/* My Books — the reader's own picks, capped at MY_BOOKS_CAP.
          The owner sees no "My Books" heading: every course and unit they
          create is assigned to them automatically and already counted under
          "My Words" on the Progress page, so a second shelf of their own
          material would just repeat it. */}
      {!isAdmin && (
        <section>
          <div className="mb-4 flex items-center justify-center gap-2">
            <h2 className="text-base font-bold text-lingo-text">My Books</h2>
            <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
              {borrowedOwn.length > 0
                ? borrowed.length
                : `${borrowed.length}/${MY_BOOKS_CAP}`}
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
            <div className={`${COVER_GRID} select-none`}>
              {orderedBorrowed.map((c) => (
                <CourseBook
                  key={c.id}
                  course={c}
                  isBorrowed
                  pending={pendingId === c.id}
                  onBorrow={() => borrow(c)}
                  onRemove={() => unborrow(c)}
                  onDeleteForever={() => destroyCourse(c)}
                  registerRef={(el) => registerItem(c.id, el)}
                  isDragging={dragId === c.id}
                  onDragStart={(e) => startDrag(e, c.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Folders grouped by exercise Type (default) or CEFR Level. Students
          see a "Library" title above the grid; the owner sees a single
          "My Books" section holding every course — already enrolled, no +/×,
          no 8-book cap. Tapping a folder opens the browser window:
          overlaying the folders for students, dropping below them for the
          owner. */}
      <LibraryFolders
        groupBy={groupBy}
        onGroupBy={handleGroupBy}
        activeKey={activeKey}
        onOpenKey={(key) => setActiveKey((cur) => (cur === key ? null : key))}
        standaloneCount={units.length}
        showTitle
        title={isAdmin ? "My Books" : "Library"}
        isAdmin={isAdmin}
      >
        {activeKey && (
          <TypeBrowserWindow
            title={activeKey === STANDALONE_KEY ? "Standalone Units" : activeKey}
            entries={openEntries}
            pendingId={pendingId}
            pendingUnitId={pendingUnitId}
            onClose={() => setActiveKey(null)}
            inline={isAdmin}
          />
        )}
      </LibraryFolders>
    </div>
  );
}

/** The browser window opened from a Library folder.
 *
 *  Student: it layers *over* the folder grid (absolute, exactly the grid's
 *  own box) so the reader browses in place of the folders instead of pushing
 *  them off-screen or dropping below them.
 *  Owner:   it is a normal block that sits BELOW the folders — the owner has
 *  room underneath and still wants to see which folder is open.
 *
 *  Every entry is a cover — the same filled tile used on My Books — so the
 *  window reads as a tray of the same objects the folders represent. */
function TypeBrowserWindow({
  title,
  entries,
  pendingId,
  pendingUnitId,
  onClose,
  inline = false,
}: {
  title: string;
  entries: BrowseEntry[];
  pendingId: string | null;
  pendingUnitId: string | null;
  onClose: () => void;
  /** Owner mode: render in normal flow below the folders. */
  inline?: boolean;
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
      className={`flex flex-col overflow-hidden rounded-2xl border-2 border-lingo-border bg-lingo-bg shadow-2xl ${
        inline ? "relative z-30 max-h-[70vh]" : "absolute inset-0 z-30"
      }`}
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

        {/* The viewer's own book: the ×/+ "My Books" toggle is pointless
            (it is already theirs and the shelf cap does not apply), so the
            top-right corner becomes the rename control instead — and that
            menu also carries the "remove from library" / "delete" rows.
            Everyone else keeps the +/× toggle. */}
        {entry.course && entry.ownsIt ? (
          <div className="absolute right-1.5 top-1.5 z-20">
            <EditTitleButton
              course={entry.course}
              onRemoveFromLibrary={entry.onRemove}
              onDeleteForever={entry.onDeleteForever}
            />
          </div>
        ) : entry.kind === "unit" && entry.isOwner ? (
          /* A standalone unit has no title to rename, so its corner carries
             the library actions on their own. */
          <div className="absolute right-1.5 top-1.5 z-20">
            <UnitMenuButton
              unitId={entry.id}
              unitTitle={entry.title}
              pending={pending}
              onRemoveFromLibrary={entry.onRemove}
              onDeleteForever={entry.onDeleteForever}
            />
          </div>
        ) : entry.showToggle ? (
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
  onDeleteForever,
  registerRef,
  isDragging = false,
  onDragStart,
}: {
  course: CourseListItem;
  isBorrowed: boolean;
  pending: boolean;
  onBorrow: () => void;
  onRemove: () => void;
  onDeleteForever?: () => void;
  /** Hands the tile's element back to the shelf so drags can be hit-tested. */
  registerRef?: (el: HTMLElement | null) => void;
  isDragging?: boolean;
  onDragStart?: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      ref={registerRef}
      className={`group relative flex flex-col items-center ${
        isDragging ? "z-30 scale-[1.04] opacity-90" : ""
      }`}
    >
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
            stretched link so removing a book never navigates into it.
            A book you created is already yours, so it gets the rename
            control instead of the shelf toggle. */}
        {course.isOwner ? (
          <div className="absolute right-1.5 top-1.5 z-20">
            <EditTitleButton
              course={course}
              onRemoveFromLibrary={onRemove}
              onDeleteForever={onDeleteForever}
            />
          </div>
        ) : (
          <div className="absolute right-1.5 top-1.5 z-20">
            <AddRemoveButton
              isAdded={isBorrowed}
              pending={pending}
              onAdd={onBorrow}
              onRemove={onRemove}
            />
          </div>
        )}

        {/* Owner-only edit (public / VIP / hide) — INSIDE the cover, lower-left. */}
        {course.isOwner ? (
          <div className="absolute left-1.5 bottom-1.5 z-20">
            <CoverEditButton course={course} />
          </div>
        ) : null}

        {/* Drag to reorder — INSIDE the cover, lower-right. Only this grip
            starts a drag, so swiping across the cover still scrolls the page
            and tapping it still opens the book. */}
        {onDragStart ? (
          <button
            type="button"
            aria-label={`Reorder ${course.title}`}
            title="Drag to reorder"
            onPointerDown={onDragStart}
            onClick={(e) => e.preventDefault()}
            // Let the drag own the gesture instead of the browser scrolling
            // the page. Scoped to the grip, so the rest of the cover — and
            // therefore page scrolling on a phone — is untouched.
            style={{ touchAction: "none" }}
            className={`absolute bottom-1.5 right-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-lingo-border bg-white/90 text-lingo-text shadow-sm transition-colors hover:bg-lingo-gray/40 ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            <GripVertical className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
