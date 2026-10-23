"use client";

import { Plus, Minus } from "lucide-react";

interface AddRemoveSwitchProps {
  /** True when the course is already on the reader's My Books shelf. The
   *  switch colour follows the action it will perform: green when it will
   *  *add*, red when it will *remove*. */
  isAdded: boolean;
  pending?: boolean;
  onToggle: () => void;
}

/**
 * The add / remove control for a book, rendered as a bottom toggle switch so it
 * never crowds the book symbol or the owner menu.
 *
 * Colour = the action:
 *   - not on shelf  → green pill labelled "Add"   (tap to add)
 *   - on the shelf  → red   pill labelled "Remove" (tap to remove)
 */
export function AddRemoveSwitch({
  isAdded,
  pending,
  onToggle,
}: AddRemoveSwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      role="switch"
      aria-checked={isAdded}
      aria-label={isAdded ? "Remove from My Books" : "Add to My Books"}
      title={isAdded ? "Remove from My Books" : "Add to My Books"}
      className={`flex w-full items-center justify-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-bold shadow-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
        isAdded
          ? "border-lingo-red bg-lingo-red text-white hover:bg-lingo-red-dark"
          : "border-lingo-green bg-lingo-green text-white hover:bg-lingo-green-dark"
      }`}
    >
      {pending ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : isAdded ? (
        <>
          <Minus className="h-3.5 w-3.5 stroke-[3]" />
          Remove
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5 stroke-[3]" />
          Add
        </>
      )}
    </button>
  );
}
