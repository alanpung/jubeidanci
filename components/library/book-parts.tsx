"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Crown } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import { makeCoursePublic, makeCoursePrivate } from "@/lib/actions/units";

/** A small VIP crown pinned to the upper-left corner of a course symbol.
 *
 *  Replaces the old lock glyph with a warmer, more "premium" mark: a gold
 *  crown on a dark circle, which reads as VIP at a glance without the
 *  "locked/forbidden" feeling a padlock carries. VIP used to be a separate
 *  grey pill *under* the title, which pushed the whole grid down and read like
 *  a second label — cornering it on the symbol keeps the mark attached to the
 *  book it describes and leaves the title row clean. */
export function VipCornerBadge() {
  return (
    <span
      title="VIP course — only you can see this"
      aria-label="VIP course"
      className="absolute -left-1.5 -top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm"
    >
      <Crown className="h-3 w-3 fill-white stroke-[2]" />
    </span>
  );
}

/** Owner-only public/VIP toggle, anchored to the LEFT of the course symbol.
 *
 *  This replaces the old "…" menu (Make Public / Make VIP / Edit markdown /
 *  Delete). The owner edits content through the AI agent, so the menu was
 *  mostly dead weight — one direct switch does the only job that matters here.
 *  Non-owners never see it. */
export function VisibilityToggle({
  course,
  className = "",
}: {
  course: CourseListItem;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isPublic = course.visibility === "public";

  function toggle() {
    // Going public is one-way for other users, so make the owner confirm.
    if (!isPublic) {
      const ok = window.confirm(
        "Make this course public?\n\nOnce public it becomes read-only for non-admins and every user can add it to My Favorite.",
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = isPublic
        ? await makeCoursePrivate(course.id)
        : await makeCoursePublic(course.id);
      if (!res.success) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        isPublic
          ? "Public — tap to make VIP (private)"
          : "VIP (private) — tap to make public"
      }
      aria-label={isPublic ? "Make VIP (private)" : "Make public"}
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition-colors disabled:opacity-50 ${
        isPublic
          ? "border-sky-300 bg-white text-sky-500 hover:bg-sky-50"
          : "border-lingo-text bg-lingo-text text-white hover:bg-lingo-text/85"
      } ${className}`}
    >
      {pending ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : isPublic ? (
        <Globe className="h-3.5 w-3.5" />
      ) : (
        <Crown className="h-3 w-3 fill-white stroke-[2]" />
      )}
    </button>
  );
}

/** The circular add (+) / remove (×) control.
 *
 *  Always sits inline in a flex slot — on the right of a Library browse row,
 *  or in the bottom-right corner of a My Favorite card — so the tap target is a
 *  full-size button instead of a tiny glyph floating off the symbol. */
export function AddRemoveButton({
  isAdded,
  pending,
  onAdd,
  onRemove,
  className = "",
}: {
  isAdded: boolean;
  pending: boolean;
  onAdd: () => void;
  onRemove: () => void;
  className?: string;
}) {
  const base =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-all active:scale-95 disabled:opacity-50";
  const tone = isAdded
    ? "border-red-300 bg-white text-red-500 hover:bg-red-50"
    : "border-lingo-blue bg-lingo-blue text-white hover:bg-lingo-blue/90";

  return (
    <button
      type="button"
      onClick={isAdded ? onRemove : onAdd}
      disabled={pending}
      title={isAdded ? "Remove from My Favorite" : "Add to My Favorite"}
      aria-label={isAdded ? "Remove from My Favorite" : "Add to My Favorite"}
      className={`${base} ${tone} ${className}`}
    >
      {pending ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : isAdded ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
          <path
            d="M5 5l14 14M19 5L5 19"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </button>
  );
}