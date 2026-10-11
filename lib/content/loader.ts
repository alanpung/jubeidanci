import fs from "fs";
import path from "path";
import { parseUnitMarkdown } from "./unit-parser";
import { parseCourseMarkdown } from "./course-parser";
import type { ParsedUnit, ParsedCourse, UnitLesson } from "./types";

export { parseUnitMarkdown } from "./unit-parser";
export { parseCourseMarkdown } from "./course-parser";

const CONTENT_DIR = path.join(process.cwd(), "content");

// ---------------------------------------------------------------------------
// Convenience helpers (used by read paths that store markdown in DB)
// ---------------------------------------------------------------------------

const parsedLessonsCache = new Map<string, { lessons: UnitLesson[]; parseError: boolean }>();

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
    if (parsedLessonsCache.size > 200) parsedLessonsCache.clear();
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
}

export interface LoadedUnit {
  parsed: ParsedUnit;
  markdown: string;
}

/**
 * Scan content directory. Files ending in `-course.md` are courses, everything
 * else is treated as a unit.
 *
 * Course ID is derived from filename: `testing-course.md` → `testing`.
 */
export function loadContentDir(): { courses: LoadedCourse[]; units: LoadedUnit[] } {
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
}
