"use client";

import { useState, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Globe, Crown, EyeOff, Pencil, Check } from "lucide-react";
import type { CourseListItem } from "@/lib/content/types";
import { makeCoursePublic, makeCoursePrivate, makeCourseHidden } from "@/lib/actions/units";

/** A small gold VIP crown pinned to a cover. Shown for every non-public course
 *  so at a glance a reader can tell which books are private/VIP. */
export function VipCrownBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="VIP course — only you can see this"
      aria-label="VIP course"
      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm ${className}`}
    >
      <Crown className="h-3 w-3 fill-white stroke-[2]" />
    </span>
  );
}

/** Public / private(VIP) / hidden indicator for the UPPER-LEFT corner of a
 *  cover. A globe marks a public course; the crown marks a private or hidden
 *  one. Purely decorative — the owner changes state with CoverEditButton. */
export function VisibilityBadge({
  visibility,
  className = "",
}: {
  visibility?: string | null;
  className?: string;
}) {
  if (visibility === "public") {
    return (
      <span
        title="Public course"
        aria-label="Public course"
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-sky-500 text-white shadow-sm ${className}`}
      >
        <Globe className="h-3 w-3" />
      </span>
    );
  }
  return <VipCrownBadge className={className} />;
}

type VisState = "public" | "private" | "hidden";

function stateOf(v: string | null | undefined): VisState {
  if (v === "public") return "public";
  if (v === "hidden") return "hidden";
  return "private";
}

const OPTIONS: {
  state: VisState;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
}[] = [
  {
    state: "public",
    label: "Public",
    hint: "Everyone can see & add it",
    Icon: Globe,
    tone: "text-sky-500",
  },
  {
    state: "private",
    label: "VIP",
    hint: "Private — only you",
    Icon: Crown,
    tone: "text-amber-500",
  },
  {
    state: "hidden",
    label: "Hide",
    hint: "Hidden — only you",
    Icon: EyeOff,
    tone: "text-lingo-text",
  },
];

/** Owner-only edit control for the LOWER-LEFT corner of a cover. Tap to open a
 *  small menu to switch the course to public / VIP(private) / hidden ("hidden"
 *  means only the owner — and admins — can see it). The menu is a portal so it
 *  is never clipped by the browse window's scroll box. */
export function CoverEditButton({
  course,
  className = "",
}: {
  course: CourseListItem;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const current = stateOf(course.visibility);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left });
    setOpen(true);
  }

  function choose(state: VisState) {
    setOpen(false);
    if (
      state === "public" &&
      !window.confirm(
        "Make this course public? Once public every user can add it to My Favorite.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res =
        state === "public"
          ? await makeCoursePublic(course.id)
          : state === "private"
            ? await makeCoursePrivate(course.id)
            : await makeCourseHidden(course.id);
      if (!res.success) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Edit visibility"
        aria-label="Edit visibility"
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-lingo-border bg-white text-lingo-text shadow-sm transition-colors hover:bg-lingo-gray/40 disabled:opacity-50 ${className}`}
      >
        <Pencil className="h-3 w-3 stroke-[2.5]" />
      </button>
      {open && pos
        ? createPortal(
            <div
              className="fixed z-[100]"
              style={{ top: pos.top, left: pos.left }}
            >
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div className="w-44 rounded-xl border-2 border-lingo-border bg-white p-1 shadow-2xl">
                {OPTIONS.map((o) => {
                  const Icon = o.Icon;
                  const active = o.state === current;
                  return (
                    <button
                      key={o.state}
                      type="button"
                      onClick={() => choose(o.state)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        active ? "bg-lingo-gray/60" : "hover:bg-lingo-gray/40"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${o.tone}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-black leading-tight text-lingo-text">
                          {o.label}
                        </span>
                        <span className="block text-[10px] font-semibold leading-tight text-lingo-text-light">
                          {o.hint}
                        </span>
                      </span>
                      {active ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-lingo-green" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
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
