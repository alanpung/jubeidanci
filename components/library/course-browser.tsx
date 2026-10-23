"use client";

import { useState } from "react";
import type { CourseListItem } from "@/lib/content/types";
import { getLanguageName } from "@/lib/languages";
import { CourseCard } from "@/components/library/course-card";
import { resolveCourseQuestionType } from "@/components/library/course-level-icon";

interface CourseBrowserProps {
  courses: CourseListItem[];
  filters: {
    sourceLanguages: string[];
    targetLanguages: string[];
    levels: string[];
  };
  initialSourceLanguage?: string | null;
  initialTargetLanguage?: string | null;
  initialType?: string | null;
}

export function CourseBrowser({ courses, filters, initialSourceLanguage, initialTargetLanguage, initialType }: CourseBrowserProps) {
  const [sourceLanguage, setSourceLanguage] = useState(initialSourceLanguage ?? "");
  const [targetLanguage, setTargetLanguage] = useState(initialTargetLanguage ?? "");
  const [level, setLevel] = useState("");
  const [type, setType] = useState(initialType ?? "");

  // The exercise type lives in the book symbol, not on the course row, so it is
  // derived the same way CourseLevelIcon does — otherwise the filter and the
  // cover would disagree about what a course is.
  const typeOf = (c: CourseListItem) =>
    resolveCourseQuestionType(c.title, c.id)?.label ?? "Other";

  const typeOptions = [
    ...new Set(courses.map(typeOf)),
  ].sort();

  const filtered = courses.filter((c) => {
    if (sourceLanguage && c.sourceLanguage !== sourceLanguage) return false;
    if (targetLanguage && c.targetLanguage !== targetLanguage) return false;
    if (level && c.level !== level) return false;
    if (type && typeOf(c) !== type) return false;
    return true;
  });

  const hasFilters =
    filters.sourceLanguages.length > 1 ||
    filters.targetLanguages.length > 1 ||
    filters.levels.length > 1;

  const showTypeFilter = typeOptions.length > 1 || Boolean(type);

  return (
    <section>
      {(hasFilters || showTypeFilter) && (
        <div className="mb-4 flex min-w-0 flex-wrap gap-2">
          {filters.sourceLanguages.length > 1 && (
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="max-w-full min-w-0 rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-2 text-sm font-bold text-lingo-text"
            >
              <option value="">All source languages</option>
              {filters.sourceLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {getLanguageName(lang)}
                </option>
              ))}
            </select>
          )}
          {filters.targetLanguages.length > 1 && (
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="max-w-full min-w-0 rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-2 text-sm font-bold text-lingo-text"
            >
              <option value="">All target languages</option>
              {filters.targetLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {getLanguageName(lang)}
                </option>
              ))}
            </select>
          )}
          {filters.levels.length > 1 && (
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="max-w-full min-w-0 rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-2 text-sm font-bold text-lingo-text"
            >
              <option value="">All levels</option>
              {filters.levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {showTypeFilter && (
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="max-w-full min-w-0 rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-2 text-sm font-bold text-lingo-text"
            >
              <option value="">All types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-lingo-text-light">
          No courses match your filters.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </section>
  );
}
