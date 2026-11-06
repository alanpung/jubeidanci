/**
 * Lightweight SRS-word counting for the library UI.
 *
 * Counts the DISTINCT `srsWords` a unit (or a whole course) contributes. A word
 * used by fifty exercises inside the same course counts once — the same
 * de-duplication rule the owner-only Course Stat report uses
 * (`lib/content/course-srs-report.ts`), so the numbers on a book cover and in
 * the report always agree.
 *
 * Deliberately does NOT touch `words/english_merged.json`: the UI only needs a
 * count, not CEFR buckets, and loading that 8MB dictionary on every library
 * render would be far too expensive. Parsing the unit markdown is the only
 * work here, and `getUnitLessonsSafe` already caches it.
 */

import { getUnitLessonsSafe } from "./loader";
import type { UnitLesson } from "./types";

/** Normalise one srsWord entry to the form we count by. */
function normalizeWord(w: unknown): string {
  return String(w ?? "").toLowerCase().trim();
}

/**
 * Collect the distinct srsWords of a parsed unit's lessons.
 *
 * `srsWords` is `string | string[]` on every exercise type except `free-text`,
 * where it is optional — hence the `if (!sw) continue`.
 */
export function getLessonsSrsWordSet(lessons: UnitLesson[]): Set<string> {
  const words = new Set<string>();
  for (const lesson of lessons ?? []) {
    for (const ex of lesson.exercises ?? []) {
      const sw = (ex as { srsWords?: string | string[] }).srsWords;
      if (!sw) continue;
      const list = Array.isArray(sw) ? sw : [sw];
      for (const w of list) {
        const norm = normalizeWord(w);
        if (norm) words.add(norm);
      }
    }
  }
  return words;
}

/** Distinct srsWords contributed by one unit's markdown. */
export function countUnitSrsWords(markdown: string): number {
  if (!markdown) return 0;
  const { lessons } = getUnitLessonsSafe(markdown);
  return getLessonsSrsWordSet(lessons).size;
}

/**
 * Distinct srsWords across a whole course, de-duplicated ACROSS its units.
 *
 * The same word taught in two units of one course counts once; the same word
 * appearing in two different courses is counted in each (courses are counted
 * independently, which is why the report keeps a separate global-unique row).
 */
export function countCourseSrsWords(markdowns: string[]): number {
  const words = new Set<string>();
  for (const md of markdowns) {
    if (!md) continue;
    const { lessons } = getUnitLessonsSafe(md);
    for (const w of getLessonsSrsWordSet(lessons)) words.add(w);
  }
  return words.size;
}
