"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteUnit } from "@/lib/actions/units";

/**
 * Owner-only controls shown on a unit card in the course detail page: edit the
 * unit's title/content, and delete the unit. Replaces the old course-level
 * "Edit Title / Add Unit" bar — the unit title lives on the unit, not the
 * course, so the controls belong on each unit.
 */
export function UnitOwnerControls({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteUnit(unitId);
      if (res.success) {
        setConfirming(false);
        router.refresh();
      } else {
        // Surface the server's reason (e.g. ownership/visibility guard).
        window.alert(res.error);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/library/edit/${unitId}`}
        aria-label="Edit unit"
        title="Edit unit title & content"
        className="rounded-lg p-1.5 text-lingo-text-light transition-colors hover:bg-lingo-gray/50 hover:text-lingo-blue"
      >
        <Pencil className="h-4 w-4 stroke-[2.5]" />
      </Link>

      {confirming ? (
        <>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg bg-lingo-red px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-lingo-red/90 disabled:opacity-50"
          >
            {isPending ? "…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="rounded-lg border border-lingo-border px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-lingo-text transition-colors hover:bg-lingo-gray/40 disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Delete unit"
          title="Delete this unit"
          className="rounded-lg p-1.5 text-lingo-text-light transition-colors hover:bg-red-50 hover:text-lingo-red"
        >
          <Trash2 className="h-4 w-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}
