/**
 * China Standards of English (CSE) 1-9 helpers.
 *
 * Kept dependency-free on purpose: `lib/words.ts` pulls in the DB driver, so
 * client components (the word tooltip) must import the label helpers from
 * here instead of from `lib/words.ts`.
 *
 * CSE 1 is intentionally unused - its words were folded into CSE 2 (小学),
 * so the scale that users see starts at 2.
 */

/** Lowest CSE level that exists. */
export const MIN_CSE_LEVEL = 2;

/**
 * Fixed CEFR -> CSE fallback. Used to derive a CSE bucket from a word's
 * CEFR level (e.g. when the dictionary no longer carries a per-word
 * `cse_level` field, or for words added after the last JSON refresh).
 * Mirrors scripts/rebuild-cse-levels-v2.py:
 *   A1 -> 2, A2 -> 2, B1 -> 4, B2 -> 6, C1 -> 8, C2 -> 9
 */
const CEFR_TO_CSE_TABLE: Record<string, string> = {
  A1: "2",
  A2: "2",
  B1: "4",
  B2: "6",
  C1: "8",
  C2: "9",
};

export function cefrToCse(cefr: string): string {
  const upper = (cefr || "").toUpperCase().trim();
  return CEFR_TO_CSE_TABLE[upper] ?? String(MIN_CSE_LEVEL);
}
