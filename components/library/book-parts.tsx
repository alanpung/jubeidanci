"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Crown, EyeOff } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import { makeCoursePublic, makeCoursePrivate, makeCourseHidden } from "@/lib/actions/units";

/** A small gold VIP crown pinned to the top-left corner of a course cover.
 *
 *  Shown for every non-public course so at a glance a reader can tell which of
 *  their books are private/VIP. It is purely decorative — the owner's real
 *  control is the public/private/hide switch (VisibilityToggle). */
export function VipCrownBadge() {
  return (
    <span
      title="VIP course — only you can see this"
      aria-label="VIP course"
      className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm"
    >
      <Crown className="h-3 w-3 fill-white stroke-[2]" />
    </span>
  );
}

type VisState = "public" | "private" | "hidden";

/** Map the stored visibility (null counts as private) to one of three states. */
function stateOf(v: string | null | undefined): VisState {
  if (v === "public") return "public";
  if (v === "hidden") return "hidden";
  return "private";
}

const NEXT: Record<VisState, VisState> = {
  public: "private",
  private: "hidden",
  hidden: "public",
};

/** Owner-only public / private(VIP) / hidden switch, anchored to the
 *  bottom-left of the course cover. Tap to cycle:
 *    public → private(VIP) → hidden → public.
 *  "hidden" means only the owner (and admins) can see the course. Going public
 *  is one-way for other users, so the owner confirms first. Non-owners never
 *  see this control. */
export function VisibilityToggle({
  course,
  className = "",
}: {
  course: CourseListItem;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = stateOf(course.visibility);

  function cycle() {
    const next = NEXT[current];
    if (next === "public") {
      const ok = window.confirm(
        "Make this course public?\n\nOnce public it becomes read-only for non-admins and every user can add it to My Favorite.",
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res =
        next === "public"
          ? await makeCoursePublic(course.id)
          : next === "private"
            ? await makeCoursePrivate(course.id)
            : await makeCourseHidden(course.id);
      if (!res.success) alert(res.error);
      else router.refresh();
    });
  }

  const meta = {
    public: {
      Icon: Globe,
      title: "Public — tap to make private (VIP)",
      cls: "border-sky-300 bg-white text-sky-500 hover:bg-sky-50",
    },
    private: {
      Icon: Crown,
      title: "VIP (private) — tap to hide",
      cls: "border-amber-300 bg-white text-amber-500 hover:bg-amber-50",
    },
    hidden: {
      Icon: EyeOff,
      title: "Hidden — tap to make public",
      cls: "border-lingo-text bg-lingo-text text-white hover:bg-lingo-text/85",
    },
  }[current];

  const Icon = meta.Icon;

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={pending}
      title={meta.title}
      aria-label={meta.title}
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition-colors disabled:opacity-50 ${meta.cls} ${className}`}
    >
      {pending ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
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