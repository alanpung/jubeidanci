import fs from "fs";
import path from "path";
import { parseUnitMarkdown } from "./unit-parser";
import { parseCourseMarkdown } from "./course-parser";
import type { CourseVisibility, ParsedUnit, ParsedCourse, UnitLesson } from "./types";

export { parseUnitMarkdown } from "./unit-parser";
export { parseCourseMarkdown } from "./course-parser";

const CONTENT_DIR = path.join(process.cwd(), "content");

// Cached result of loadContentDir() — see that function for why.
let contentDirCache: {
  ts: number;
  value: { courses: LoadedCourse[]; units: LoadedUnit[] };
  /** Signature of the content directory at scan time (file names + mtimes). */
  signature: string;
} | null = null;
// 24h. The content directory is bundled at build time and only changes on
// deploy (which gives every instance a fresh module cache anyway), so there is
// no reason to re-scan and re-parse every markdown file every 60s. A periodic
// re-scan is a synchronous, event-loop-blocking parse that used to land in the
// middle of live traffic and defeat every timeout we had (the request then hung
// until the parse finished). Cache it for a day; an explicit invalidateCache()
// still forces a refresh when needed.
const CONTENT_DIR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Convenience helpers (used by read paths that store markdown in DB)
// ---------------------------------------------------------------------------

const parsedLessonsCache = new Map<string, { lessons: UnitLesson[]; parseError: boolean }>();
// Cap raised from 200: libraries with many units used to evict the cache on
// every sync and re-parse all markdown each time, which is pure CPU waste.
const PARSED_LESSONS_CACHE_CAP = 2000;

/** Parse raw unit markdown into UnitLesson[]. */
export function getUnitLessons(markdown: string): UnitLesson[] {
  return getUnitLessonsSafe(markdown).lessons;
}

/** Safe version that never throws — returns parseError flag instead (cached by markdown content). */
export function getUnitLessonsSafe(markdown: string): {
  lessons: UnitLesson[];
  parseError: boolean;
} {
  if (!markdown) return { lessons: [], parseError: false };
  const cached = parsedLessonsCache.get(markdown);
  if (cached) return cached;

  try {
    const res = { lessons: parseUnitMarkdown(markdown).lessons, parseError: false };
    if (parsedLessonsCache.size > PARSED_LESSONS_CACHE_CAP) parsedLessonsCache.clear();
    parsedLessonsCache.set(markdown, res);
    return res;
  } catch {
    const res = { lessons: [], parseError: true };
    parsedLessonsCache.set(markdown, res);
    return res;
  }
}

/** Ultra-fast lesson count estimation without parsing exercise AST */
export function getUnitLessonCountFast(markdown: string): number {
  if (!markdown) return 0;
  const matches = markdown.match(/lessonTitle\s*:/g);
  if (matches && matches.length > 0) return matches.length;
  const headings = markdown.match(/^##\s+/gm);
  if (headings && headings.length > 0) return headings.length;
  return getUnitLessonsSafe(markdown).lessons.length;
}

// ---------------------------------------------------------------------------
// Content directory scanner
// ---------------------------------------------------------------------------

export interface LoadedCourse {
  id: string;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
  level: string;
  description: string;
  /** From course frontmatter; "public" when omitted. */
  visibility: CourseVisibility;
}

export interface LoadedUnit {
  parsed: ParsedUnit;
  markdown: string;
}

/**
 * Cheap fingerprint of the content directory: the file names plus their
 * mtimes and sizes.
 *
 * `readdirSync` + `statSync` on ~250 files is orders of magnitude cheaper than
 * re-reading and re-parsing every markdown file, so this can run on every
 * request. It lets the cache notice that the directory changed (a deploy, a
 * `git pull`, a new unit file landing) and re-scan immediately, instead of
 * serving a stale file list for up to 24 hours.
 */
function contentDirSignature(): string {
  try {
    if (!fs.existsSync(CONTENT_DIR)) return "";
    return fs
      .readdirSync(CONTENT_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => {
        try {
          const st = fs.statSync(path.join(CONTENT_DIR, f));
          return `${f}:${st.mtimeMs}:${st.size}`;
        } catch {
          return `${f}:missing`;
        }
      })
      .join("|");
  } catch {
    return "";
  }
}

/**
 * Scan content directory. Files ending in `-course.md` are courses, everything
 * else is treated as a unit.
 *
 * Course ID is derived from filename: `testing-course.md` → `testing`.
 */
export function loadContentDir(): { courses: LoadedCourse[]; units: LoadedUnit[] } {
  // The content directory is bundled at build time and only changes on deploy,
  // but a warm serverless instance reuses this module across many invocations.
  // Cache the scan for a short window so syncUserCourseWordsToSrs (which only
  // needs filesystem units as a fallback for enrolled courses) doesn't re-read
  // and re-parse every .md on disk on every refresh — that disk scan was a
  // meaningful slice of the sync's wall-clock time.
  const now = Date.now();
  if (contentDirCache && now - contentDirCache.ts < CONTENT_DIR_CACHE_TTL_MS) {
    // Even inside the TTL, a changed directory must invalidate the cache.
    // Without this a warm instance that picked up new content/*.md files
    // (deploy, git pull) kept serving the OLD file list, so the seeder never
    // discovered the new units and the corresponding folder stayed empty.
    const signature = contentDirSignature();
    if (signature === contentDirCache.signature) {
      return contentDirCache.value;
    }
  }

  const value: { courses: LoadedCourse[]; units: LoadedUnit[] } = (() => {
    if (!fs.existsSync(CONTENT_DIR)) return { courses: [], units: [] };

    const entries = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md")).sort();
    const courses: LoadedCourse[] = [];
    const units: LoadedUnit[] = [];

    for (const entry of entries) {
      const fullPath = path.join(CONTENT_DIR, entry);
      if (!fs.statSync(fullPath).isFile()) continue;

      const raw = fs.readFileSync(fullPath, "utf-8");

      if (entry.endsWith("-course.md")) {
        try {
          const parsed = parseCourseMarkdown(raw);
          const id = parsed.id ?? entry.replace(/-course\.md$/, "");
          courses.push({
            id,
            title: parsed.courseTitle,
            sourceLanguage: parsed.sourceLanguage,
            targetLanguage: parsed.targetLanguage,
            level: parsed.level,
            description: parsed.description,
            visibility: parsed.visibility,
          });
        } catch {
          // skip malformed
        }
      } else {
        try {
          const parsed = parseUnitMarkdown(raw);
          units.push({ parsed, markdown: raw });
        } catch {
          // skip malformed
        }
      }
    }

    return { courses, units };
  })();

  contentDirCache = { ts: now, value, signature: contentDirSignature() };
  return value;
}

/**
 * Force the next `loadContentDir()` call to re-scan the filesystem instead of
 * returning the cached scan.
 *
 * Callers that add/remove content files at runtime (e.g. the content seeder,
 * which must pick up newly committed `content/*.md` units on a warm server)
 * call this so the seeder never scans a stale file list.
 *
 * Note: the cache now also invalidates ITSELF whenever the content
 * directory's signature changes (file added, removed or modified), so this is
 * a belt-and-braces shortcut rather than the only way out of a stale scan.
 */
export function invalidateContentDirCache() {
  contentDirCache = null;
}
