import Link from "next/link";
import type { CourseListItem } from "@/lib/content/types";
import { getLanguageName } from "@/lib/languages";
import { CourseLibraryButton } from "@/components/course/course-library-button";
import { CourseLevelIcon, getCourseLevelStyle } from "@/components/library/course-level-icon";

interface CourseCardProps {
  course: CourseListItem;
}

export function CourseCard({ course }: CourseCardProps) {
  const levelStyle = getCourseLevelStyle(course.level);

  return (
    <Link
      href={`/units/${course.id}`}
      prefetch={true}
      className="block rounded-2xl border-2 border-lingo-border bg-lingo-card p-5 transition-transform hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <CourseLevelIcon level={course.level} />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-lingo-text truncate">{course.title}</h3>
            <p className="mt-0.5 text-sm text-lingo-text-light">
              {getLanguageName(course.sourceLanguage)} →{" "}
              {getLanguageName(course.targetLanguage)}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {course.isOwner ? (
            <span className="inline-block rounded-xl border-2 border-lingo-gray bg-lingo-gray/50 px-2.5 py-1 text-xs font-bold text-lingo-text-light">
              Your Course
            </span>
          ) : (
            <CourseLibraryButton
              courseId={course.id}
              initialIsInLibrary={course.isInLibrary ?? false}
            />
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${levelStyle.pill}`}>
          {course.level}
        </span>
        <span className="text-xs text-lingo-text-light">
          {course.unitCount} {course.unitCount === 1 ? "unit" : "units"} · {course.lessonCount}{" "}
          {course.lessonCount === 1 ? "lesson" : "lessons"}
        </span>
      </div>
    </Link>
  );
}
