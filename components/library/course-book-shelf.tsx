"use client";

import {
  useState,
  useTransition,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Lock } from "lucide-react";
import type { CourseListItem, StandaloneUnitInfo } from "@/lib/content/types";
import {
  CourseCover,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";
import { normalizeQuestionType } from "@/lib/content/question-types";
import { deleteCourse, deleteUnit } from "@/lib/actions/units";
import {
  LibraryFolders,
  STANDALONE_KEY,
  type GroupBy,
} from "@/components/library/library-folders";
import { levelRank } from "@/components/library/library-deck";
import {
  VisibilityBadge,
  CoverEditButton,
  UnitMenuButton,
} from "@/components/library/book-parts";

/** Returns true when the viewport is at least `query` wide. Used to decide
 *  where the folder's browse window sits: overlaying the folders on small
 *  screens (mobile), and dropping below them on large desktops. */
function useIsLargeViewport(query = "(min-width: 768px)") {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

interface BrowseEntry {
  id: string;
  kind: "course" | "unit";
  title: string;
  level: string | null;
  /** Exercise-type id deciding the cover's colour + symbol. */
  typeId: string | null;
  /** Distinct SRS words the entry teaches — shown on the cover. */
  srsWordCount?: number;
  /** The course behind this entry, when there is one (owner toggle). */
  course?: CourseListItem;
  ownsIt: boolean;
  isOwner: boolean;
  /** Whether the viewer may open (navigate into) this entry. Public → all;
   *  private/VIP → owner + the owner's VIP students; hidden → owner only (and
   *  hidden entries are never listed for non-owners in the first place). */
  canOpen: boolean;
  visibility: string | null;
  href: string;
  /** Destroy the entry for good (owner/admin only, irreversible). */
  onDeleteForever?: () => void;
}

interface CourseBookShelfProps {
  /** Full catalog: every non-hidden course (public + private/VIP alike). */
  courses: CourseListItem[];
  /** Every non-hidden standalone unit (public + private/VIP alike). */
  units: StandaloneUnitInfo[];
  isAdmin: boolean;
  /** Owner ids for which the viewer is a VIP — grants access to the owner's
   *  private/VIP content without owning it. */
  vipOwnerIds?: string[];
}

export function CourseBookShelf({
  courses,
  units,
  isAdmin,
  vipOwnerIds = [],
}: CourseBookShelfProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingUnitId, setPendingUnitId] = useState<string | null>(null);
  // Entries the owner destroyed during this session — so the folder updates
  // instantly instead of waiting for the router.refresh().
  const [removedCourseIds, setRemovedCourseIds] = useState<Set<string>>(
    new Set(),
  );
  const [removedUnitIds, setRemovedUnitIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Large desktop → window drops below the folder grid. Small/mobile → window
  // overlays the folders. Keyed off the viewport, not the admin flag, so the
  // owner gets the same responsive behaviour as a student.
  const isLargeViewport = useIsLargeViewport();

  function handleGroupBy(g: GroupBy) {
    setGroupBy(g);
    setActiveKey(null);
  }

  // Visibility governs who may *see* an entry (everyone, for non-hidden) — the
  // viewer's permission to *open* it is what we compute here.
  const canOpenCourse = (c: CourseListItem) =>
    isAdmin ||
    !!c.isOwner ||
    c.visibility === "public" ||
    (c.createdBy != null && vipOwnerIds.includes(c.createdBy));

  const canOpenUnit = (u: StandaloneUnitInfo) =>
    isAdmin ||
    u.isOwner ||
    u.visibility === "public" ||
    (u.createdBy != null && vipOwnerIds.includes(u.createdBy));

  // The owner's own deletions leave the folder right away; everyone else only
  // ever sees what is still in the catalog.
  const visibleCourses = courses.filter((c) => !removedCourseIds.has(c.id));
  const visibleUnits = units.filter((u) => !removedUnitIds.has(u.id));

  const courseEntries: BrowseEntry[] = visibleCourses.map((c) => ({
    id: c.id,
    kind: "course",
    title: c.title,
    level: c.level,
    typeId: normalizeQuestionType(`${c.title} ${c.id}`)?.id ?? null,
    srsWordCount: c.srsWordCount,
    course: c,
    ownsIt: !!c.isOwner,
    isOwner: !!c.isOwner || isAdmin,
    canOpen: canOpenCourse(c),
    visibility: c.visibility ?? null,
    href: `/library/${c.id}`,
    onDeleteForever: () => destroyCourse(c),
  }));

  // Standalone units always wear the "mix" symbol.
  const unitEntries: BrowseEntry[] = visibleUnits.map((u) => ({
    id: u.id,
    kind: "unit",
    title: u.title,
    level: u.level,
    typeId: "mix",
    srsWordCount: u.srsWordCount,
    ownsIt: !!u.isOwner,
    isOwner: !!u.isOwner,
    canOpen: canOpenUnit(u),
    visibility: u.visibility,
    href: `/unit/${u.id}`,
    onDeleteForever: () => destroyUnit(u.id, u.title),
  }));

  const typeLabelOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  // The window deliberately lists *every* entry of this folder.
  const openEntries: BrowseEntry[] =
    activeKey === STANDALONE_KEY
      ? unitEntries
      : groupBy === "level"
        ? courseEntries.filter(
            (e) => (e.level || "").toUpperCase() === activeKey,
          )
        : courseEntries.filter((e) => typeLabelOf(e.course!) === activeKey);

  // Sort the window's entries by CEFR level (A1 → C2), then by title. Without
  // this the grid keeps the raw catalog order, which is title-ordered from the
  // DB — so a "Translation" folder could read A1, B1, B2, C1, C2, A2 with A2
  // stranded at the end. Level order is the spine of every library surface,
  // so it wins; title is only the tie-breaker inside one level.
  const sortedOpenEntries = [...openEntries].sort((a, b) => {
    const byLevel = levelRank(a.level) - levelRank(b.level);
    if (byLevel !== 0) return byLevel;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });

  /** Delete a course FOR GOOD (owner/admin only). */
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
      {/* One unified "My Books" section: every non-hidden course/unit, grouped
          by exercise Type (default) or CEFR Level. Tapping a folder opens the
          browse window — overlaying the folders on small screens and sitting
          below them on large desktops. */}
      <LibraryFolders
        groupBy={groupBy}
        onGroupBy={handleGroupBy}
        activeKey={activeKey}
        onOpenKey={(key) => setActiveKey((cur) => (cur === key ? null : key))}
        standaloneCount={units.length}
        showTitle
        title="My Books"
        isLargeViewport={isLargeViewport}
      >
        {activeKey && (
          <TypeBrowserWindow
            title={activeKey === STANDALONE_KEY ? "Standalone Units" : activeKey}
            entries={sortedOpenEntries}
            pendingId={pendingId}
            pendingUnitId={pendingUnitId}
            onClose={() => setActiveKey(null)}
          />
        )}
      </LibraryFolders>
    </div>
  );
}

/** How many card slots the browse window reserves.
 *
 *  The Library's own folder grid shows EIGHT tiles (seven exercise-type
 *  folders + Standalone Units), so the window that replaces it is sized to
 *  hold the same eight slots. Fewer entries leave empty slots — invisible,
 *  but part of the window, so tapping one closes the popup. More entries
 *  simply grow the window with the content. */
const WINDOW_SLOTS = 8;

/** The browser window opened from a Library folder.
 *
 *  Small/mobile viewport: opening a folder REPLACES the folder grid with this
 *  window (set by the parent). Large desktop: it sits BELOW the folders. Either
 *  way there is no overlay and no inner scrollbar — the window is as tall as
 *  its content and simply grows into the page. The header (title + count + ×)
 *  shows which folder is open; × or Escape or a click on empty space closes it.
 *
 *  Every entry is a cover — the same filled tile used on the shelf — so the
 *  window reads as a tray of the same objects the folders represent. */
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Empty slots pad the grid out to WINDOW_SLOTS. They are rendered as
  // invisible copies of a real cover so the reserved rows are exactly as tall
  // as the cards above them — no measuring, no resize listeners, and the
  // window keeps the same footprint as the eight-tile folder grid it replaced.
  const ghostCount = Math.max(0, WINDOW_SLOTS - entries.length);
  const ghostProps = entries[entries.length - 1];

  return (
    <div
      className="relative z-30 flex w-full flex-col overflow-hidden rounded-2xl border-2 border-lingo-border bg-lingo-bg shadow-2xl"
      role="dialog"
      aria-modal="false"
      aria-label={`${title} courses`}
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

      <div className="flex-1 p-3 sm:px-5 sm:py-4">
        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-lingo-text-light">
            No {title.toLowerCase()} yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-4">
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

            {/* Reserved empty slots — invisible, but they belong to the
                window, so a tap on one closes the popup. */}
            {ghostCount > 0 && ghostProps
              ? Array.from({ length: ghostCount }, (_, i) => (
                  <div
                    key={`ghost-${i}`}
                    aria-hidden="true"
                    className="pointer-events-none opacity-0"
                  >
                    <CourseCover
                      level={ghostProps.level}
                      questionType={ghostProps.typeId}
                      title={ghostProps.title}
                      courseId={ghostProps.id}
                      name={ghostProps.title}
                    />
                  </div>
                ))
              : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** One cover inside the browse window.
 *
 *  A course/unit can only be opened once the viewer has permission. Public
 *  entries open for everyone; private/VIP entries open only for the owner and
 *  the owner's VIP students (everyone else sees a lock). The owner also gets
 *  the rename / visibility / delete controls. */
function BrowseCover({ entry, pending }: { entry: BrowseEntry; pending: boolean }) {
  const cover = (
    <CourseCover
      level={entry.level}
      questionType={entry.typeId}
      title={entry.title}
      courseId={entry.id}
      name={entry.title}
      srsWordCount={entry.srsWordCount}
    />
  );
  return (
    <div
      className="group relative flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full">
        {entry.canOpen ? (
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
          <VisibilityBadge visibility={entry.visibility} />
        </div>

        {/* Lock — the viewer may see this entry but not open it (private/VIP
            and they are not a VIP of the owner). It sits in the LOWER-RIGHT
            corner, because the upper-right now carries the CEFR level badge. */}
        {!entry.canOpen ? (
          <div className="absolute right-1.5 bottom-1.5 z-20">
            <span
              title="VIP only"
              aria-label="VIP only"
              className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-lingo-text/80 text-white shadow-sm"
            >
              <Lock className="h-2.5 w-2.5 stroke-[2.5]" />
            </span>
          </div>
        ) : null}

        {/* Owner-only controls. The UPPER-RIGHT corner belongs to the CEFR
            level badge, so the owner gets a single control in the lower-left:
            one menu with rename + visibility + delete. A standalone unit has
            no title to rename, so its corner is the unit menu. */}
        {entry.course && entry.isOwner ? (
          <div className="absolute left-1.5 bottom-1.5 z-20">
            <CoverEditButton
              course={entry.course}
              onDeleteForever={entry.onDeleteForever}
              deletePending={pending}
            />
          </div>
        ) : entry.kind === "unit" && entry.isOwner ? (
          <div className="absolute right-1.5 bottom-1.5 z-20">
            <UnitMenuButton
              unitId={entry.id}
              unitTitle={entry.title}
              pending={pending}
              onDeleteForever={entry.onDeleteForever}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
