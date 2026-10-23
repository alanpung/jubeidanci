"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import { CourseLevelIcon } from "@/components/library/course-level-icon";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";
import {
  AddRemoveButton,
  VipCornerBadge,
  VisibilityToggle,
} from "@/components/library/book-parts";

interface PrivateShelfProps {
  /** The viewer's own courses that are not public yet. */
  courses: CourseListItem[];
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
export function PrivateShelf({ courses }: PrivateShelfProps) {
  if (courses.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-lingo-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
          <Lock className="h-3 w-3" /> VIP
        </span>
        <span className="h-px flex-1 bg-lingo-border" />
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-bold text-lingo-text">VIP Courses</h2>
        <span className="rounded-full bg-lingo-gray px-2 py-0.5 text-xs font-bold text-lingo-text-light">
          {courses.length}
        </span>
        <span className="text-xs text-lingo-text-light">
          Only you can see these.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-8 min-[480px]:grid-cols-5 lg:grid-cols-6">
        {courses.map((c) => (
          <PrivateBook key={c.id} course={c} />
        ))}
      </div>
    </section>
  );
}

/** A VIP course as a book: the symbol with its cornered lock mark, the title
 *  beneath, the circular add control on the top-right, and the owner's
 *  public/VIP toggle on the bottom-left. */
function PrivateBook({ course }: { course: CourseListItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const isAdded = !!course.isInLibrary;

  function run(fn: () => Promise<{ success: boolean; error?: string }>, label: string) {
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.success) alert(res.error);
        else router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : `Failed to ${label}`);
      } finally {
        setBusy(false);
      }
    });
  }

  const borrow = () => run(() => addCourseToLibrary(course.id), "add to library");
  const unborrow = () =>
    run(() => removeCourseFromLibrary(course.id), "remove from library");

  return (
    <div className="group flex flex-col items-center">
      <div className="relative">
        <Link
          href={`/library/${course.id}`}
          className="inline-block transition-transform hover:-translate-y-0.5"
          title={`${course.title} · ${course.level} · ${course.unitCount} units · VIP`}
        >
          <CourseLevelIcon
            level={course.level}
            title={course.title}
            courseId={course.id}
            size="lg"
          />
        </Link>

        {/* Every course on this shelf is private, so the corner lock is always
            on — no separate "🔒 VIP" label needed under the title. */}
        <VipCornerBadge />

        {/* Top-right: add (+) / remove (×) for My Books */}
        <AddRemoveButton
          isAdded={isAdded}
          pending={busy || pending}
          onAdd={borrow}
          onRemove={unborrow}
          placement="corner"
        />

        {/* Bottom-left: owner-only public/VIP toggle */}
        <VisibilityToggle course={course} className="absolute -bottom-2 -left-2" />
      </div>

      <p className="mt-2.5 line-clamp-2 min-h-[2rem] w-full px-1 text-center text-xs font-semibold leading-tight text-lingo-text">
        {course.title}
      </p>
    </div>
  );
}
