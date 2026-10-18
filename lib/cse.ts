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

/** Highest CSE level that exists. */
export const MAX_CSE_LEVEL = 9;

/**
 * Fixed CEFR -> CSE fallback. The dictionary carries the authoritative
 * `cse_level`, so this is only used for words that bypass the dictionary
 * (AI lookups, words added after the latest JSON refresh, …).
 * Mirrors scripts/rebuild-cse-levels-v2.py:
 *
 *   A1 -> CSE 2   (小学 - CSE 1 is unused, CSE 2 is the floor)
 *   A2 -> CSE 2   (小学)
 *   B1 -> CSE 3   (初中 / 中考)
 *   B2 -> CSE 4   (高中 / 高考)
 *   C1 -> CSE 5   (CET-4 范围)
 *   C2 -> CSE 6   (CET-6 范围)
 *
 * CSE 7/8/9 (专八 / 雅思 7 / 雅思 8) are never reached by the CEFR fallback -
 * they only come from the explicit exam wordlists in scripts/data/cse/.
 */
const CEFR_TO_CSE_TABLE: Record<string, string> = {
  A1: "2",
  A2: "2",
  B1: "3",
  B2: "4",
  C1: "5",
  C2: "6",
};

export function cefrToCse(cefr: string): string {
  const upper = (cefr || "").toUpperCase().trim();
  return CEFR_TO_CSE_TABLE[upper] ?? String(MIN_CSE_LEVEL);
}

/**
 * Human-readable label for each CSE bucket, so the word tooltip can show
 * "CSE 4 高中" instead of a bare number. There is deliberately no "1" entry.
 */
export const CSE_BUCKET_LABELS: Record<string, string> = {
  "2": "小学",
  "3": "初中",
  "4": "高中",
  "5": "CET-4",
  "6": "CET-6",
  "7": "专八",
  "8": "雅思 7",
  "9": "雅思 8",
};

export function cseBucketLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return CSE_BUCKET_LABELS[level] ?? null;
}

/** False for levels that should never be rendered (currently only "1"). */
export function isDisplayableCse(level: string | null | undefined): boolean {
  if (!level) return false;
  const n = Number(level);
  return Number.isInteger(n) && n >= MIN_CSE_LEVEL && n <= MAX_CSE_LEVEL;
}
