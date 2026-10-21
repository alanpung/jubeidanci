"use client";

import type { ReactNode } from "react";
import { getCourseLevelStyle } from "@/components/library/course-level-icon";

/** Canonical CEFR ordering used to sort every library surface. */
export const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type LevelKey = (typeof LEVEL_ORDER)[number];

export function normalizeLevel(level?: string | null): LevelKey | null {
  const key = (level || "").toUpperCase().trim();
  return (LEVEL_ORDER as readonly string[]).includes(key)
    ? (key as LevelKey)
    : null;
}

/** Sort rank for a CEFR level. Unlevelled items sink to the bottom. */
export function levelRank(level?: string | null): number {
  const key = normalizeLevel(level);
  return key ? LEVEL_ORDER.indexOf(key) : LEVEL_ORDER.length;
}

/**
 * Group arbitrary library items into CEFR buckets (A1 first) so courses and
 * standalone units can share one shelf/ordering rule. Buckets with no items are
 * dropped so we never render an empty shelf. Items with a missing/unknown
 * level are never discarded — they land in a trailing "Other" shelf, because
 * silently hiding a learner's content is far worse than an unsorted shelf.
 */
export function groupByLevel<T>(
  items: T[],
  getLevel: (item: T) => string | null | undefined,
): { level: LevelKey | null; items: T[] }[] {
  const buckets = new Map<LevelKey, T[]>();
  const unlevelled: T[] = [];

  for (const item of items) {
    const level = normalizeLevel(getLevel(item));
    if (!level) {
      unlevelled.push(item);
      continue;
    }
    const bucket = buckets.get(level);
    if (bucket) bucket.push(item);
    else buckets.set(level, [item]);
  }

  const shelves = LEVEL_ORDER.filter((level) => buckets.has(level)).map((level) => ({
    level: level as LevelKey | null,
    items: buckets.get(level)!,
  }));

  if (unlevelled.length > 0) {
    shelves.push({ level: null, items: unlevelled });
  }

  return shelves;
}

/**
 * Renders its children as the top card of a stacked deck — two card edges peek
 * out from behind the top edge, which reads as "a deck of flashcards" rather
 * than a plain list row. Purely decorative; all content stays in `children`.
 */
export function DeckStack({ children }: { children: ReactNode }) {
  return (
    <div className="relative pt-2">
      {/* Back-most card */}
      <div
        aria-hidden="true"
        className="absolute inset-x-2 top-0 h-2.5 rounded-t-lg border-2 border-b-0 border-lingo-border bg-lingo-gray/40"
      />
      {/* Middle card */}
      <div
        aria-hidden="true"
        className="absolute inset-x-1 top-0.5 h-2.5 rounded-t-lg border-2 border-b-0 border-lingo-border bg-lingo-gray/70"
      />
      {/* Top card — the real, interactive content */}
      <div className="relative">{children}</div>
    </div>
  );
}

/** A labelled shelf that groups every card sharing one CEFR level. */
export function DeckShelf({
  level,
  count,
  children,
}: {
  level: LevelKey | null;
  count: number;
  children: ReactNode;
}) {
  const style = getCourseLevelStyle(level);

  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-2.5 flex items-center gap-2">
        {/* Level tab styled like a card index tab */}
        <span
          className={`flex h-7 items-center rounded-lg px-2.5 text-xs font-black text-white shadow-sm ${style.bg}`}
        >
          {level ?? "Other"}
        </span>
        <span className="h-px flex-1 bg-lingo-border" />
        <span className="text-[11px] font-bold text-lingo-text-light">
          {count} {count === 1 ? "deck" : "decks"}
        </span>
      </div>
      <div className="grid min-w-0 gap-3.5">{children}</div>
    </section>
  );
}