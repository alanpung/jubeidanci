import matter from "gray-matter";
import type { CourseVisibility, ParsedCourse } from "./types";

/** Only these three values have meaning to the access-control layer. */
function normalizeVisibility(value: unknown): CourseVisibility {
  return value === "private" || value === "hidden" ? value : "public";
}

/**
 * Parse a course markdown file.
 *
 * Format:
 * ```
 * ---
 * courseTitle: "German Testing"
 * description: "A test course for German exercises"
 * sourceLanguage: "en"
 * targetLanguage: "de"
 * level: "B1"
 * visibility: "public"        # optional; defaults to "public"
 * ---
 * ```
 *
 * The course ID is derived from the filename (e.g. `testing-course.md` → `testing`).
 * Units reference the course via `courseId` in their own frontmatter.
 */
export function parseCourseMarkdown(raw: string): ParsedCourse {
  const { data: fm } = matter(raw);

  if (!fm.courseTitle) {
    throw new Error("Course markdown must have a courseTitle in frontmatter");
  }

  return {
    id: fm.id ?? null,
    courseTitle: fm.courseTitle,
    description: fm.description ?? "",
    sourceLanguage: fm.sourceLanguage ?? "en",
    targetLanguage: fm.targetLanguage ?? "en",
    level: fm.level ?? "A1",
    visibility: normalizeVisibility(fm.visibility),
  };
}
