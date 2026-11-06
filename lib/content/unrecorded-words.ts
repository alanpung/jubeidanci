/**
 * Owner-only triage list: the SRS words used by course content that the bundled
 * English dictionary does NOT know about.
 *
 * "Not recorded" (未收录) mirrors the Course Stat report's last column exactly:
 * a word is unrecorded when neither the word itself nor any of its morphemes
 * resolves to a dictionary entry (see `levelForWord`, which already handles
 * irregular inflections, whole-form overrides and token-level lemmatisation).
 *
 * Unlike the report — which only counts — this module keeps the provenance of
 * every unrecorded word: which courses and units use it, and how often. That
 * is what the owner needs in order to decide what to do with them.
 *
 * The scan reads the committed `content/*.md` unit files directly (the source
 * of truth for `srsWords`) so it always reflects what will ship.
 */

import { readdirSync, readFileSync } from "fs";
import path from "path";

import { parseUnitMarkdown } from "./unit-parser";
import { buildDictionary, levelForWord } from "./course-srs-report";

const CONTENT_DIR = path.join(process.cwd(), "content");

/** Where an unrecorded word comes from. */
export interface UnrecordedSource {
  /** The course that uses the word, e.g. "a1-listening-course". */
  courseId: string;
  /** The unit file that uses the word, e.g. "a1-listening-unit-2". */
  unitId: string;
  /** The unit's display title. */
  unitTitle: string;
  /** How many times the word appears as an srsWord in this unit. */
  count: number;
}

/** One unrecorded word plus its provenance. */
export interface UnrecordedWord {
  /** The word as written in the content, normalised to lower case. */
  word: string;
  /** Every course/unit that references the word. */
  sources: UnrecordedSource[];
  /** Total number of times the word appears across all content. */
  occurrences: number;
}

/**
 * True when the word (or one of its morphemes) is missing from the bundled
 * dictionary. Mirrors `levelForWord` — a null level means "not recorded".
 */
export function isUnrecorded(word: string, dict: Map<string, string>): boolean {
  const norm = word.toLowerCase().trim();
  if (!norm) return true;
  return levelForWord(norm, dict) === null;
}

let _cache: { key: number; words: UnrecordedWord[] } | null = null;

/**
 * Collect every unrecorded SRS word across all course content, de-duplicated
 * globally (the same word used in five courses is ONE row, listing five
 * sources).
 *
 * Cached in module scope: the scan parses every unit markdown, which is far
 * too slow to repeat per request. The cache is keyed on the newest mtime of
 * the content directory, so editing any unit invalidates it.
 */
export function getUnrecordedWords(): UnrecordedWord[] {
  const now = Date.now();
  if (_cache && now - _cache.key < 60_000) return _cache.words;

  const dict = buildDictionary();
  const files = readdirSync(CONTENT_DIR).filter(
    (f) => /[^.]+\.md$/.test(f) && f.includes("unit"),
  );

  /** word -> aggregated row */
  const rows = new Map<string, UnrecordedWord>();

  for (const f of files) {
    const src = readFileSync(path.join(CONTENT_DIR, f), "utf8");

    const cidMatch = src.match(/^courseId:\s*"([^"]+)"/m) ?? src.match(/^courseId:\s*(\S+)/m);
    const titleMatch =
      src.match(/^unitTitle:\s*"([^"]*)"/m) ?? src.match(/^unitTitle:\s*(.*)$/m);
    const courseId = cidMatch ? cidMatch[1] : f.replace(/\.md$/, "");
    const unitId = f.replace(/\.md$/, "");
    const unitTitle = titleMatch ? titleMatch[1].trim().replace(/^"|"$/g, "") : unitId;

    let doc;
    try {
      doc = parseUnitMarkdown(src);
    } catch {
      continue;
    }

    // Per-unit tally, so a word repeated inside one unit is reported once for
    // that unit (with the raw occurrence count kept for context).
    const perUnit = new Map<string, number>();
    for (const lesson of doc.lessons) {
      for (const ex of lesson.exercises) {
        const sw = (ex as { srsWords?: string | string[] }).srsWords;
        if (!sw) continue;
        const words = Array.isArray(sw) ? sw : [sw];
        for (const w of words) {
          const norm = String(w).toLowerCase().trim();
          if (!norm) continue;
          if (!isUnrecorded(norm, dict)) continue;
          perUnit.set(norm, (perUnit.get(norm) ?? 0) + 1);
        }
      }
    }

    for (const [word, count] of perUnit) {
      let row = rows.get(word);
      if (!row) {
        row = { word, sources: [], occurrences: 0 };
        rows.set(word, row);
      }
      row.sources.push({ courseId, unitId, unitTitle, count });
      row.occurrences += count;
    }
  }

  // Most-used first — the owner wants to fix the words that matter most.
  const words = Array.from(rows.values()).sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length;
    return a.word.localeCompare(b.word);
  });

  _cache = { key: now, words };
  return words;
}

/**
 * The total number of globally de-duplicated unrecorded words — the same
 * figure the Course Stat footer reports as "各课程之和（同词跨课程重复计）"
 * for the 未收录 column, but de-duplicated across courses.
 */
export function getUnrecordedWordCount(): number {
  return getUnrecordedWords().length;
}
