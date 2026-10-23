import Link from "next/link";
import { getSession } from "@/lib/auth-server";
import { listCoursesWithLessonCounts } from "@/lib/db/queries/courses";
import type { CourseListItem } from "@/lib/content/types";
import { isAdminEmail } from "@/lib/ai/models";
import { getTargetLanguage } from "@/lib/actions/preferences";
import {
  CourseBookShelf,
} from "@/components/library/course-book-shelf";
import { LearnHeader } from "@/components/library/learn-header";
import { withTimeout } from "@/lib/db/timeout";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const session = await getSession();

  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  let allCourses: CourseListItem[] = [];
  let targetLang: string | null = null;

  if (userId) {
    // Every one of these is bounded: postgres.js queues a query forever when
    // the pool is saturated, so an unbounded wait here is exactly what made
    // /library hang instead of merely being slow. Rendering the shelf with a
    // missing slice beats never rendering it at all.
    const results = await Promise.allSettled([
      withTimeout(
        "library:listCoursesWithLessonCounts",
        listCoursesWithLessonCounts(undefined, userId, false),
        10000,
        [] as CourseListItem[],
      ),
      withTimeout<string | null>(
        "library:getTargetLanguage",
        getTargetLanguage(userId),
        5000,
        null,
      ),
    ]);

    if (results[0].status === "fulfilled") {
      allCourses = results[0].value;
    } else {
      console.error("LearnPage: listCoursesWithLessonCounts failed:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      targetLang = results[1].value;
    } else {
      console.error("LearnPage: getTargetLanguage failed:", results[1].reason);
    }
  }

  const isEmptyLibrary = allCourses.length === 0 && !isAdmin;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-lingo-text">My Library</h1>
      </div>
      <LearnHeader
        targetLanguage={targetLang ?? undefined}
        isAdmin={isAdmin}
      />
      {isEmptyLibrary ? (
        <div className="rounded-2xl border-2 border-dashed border-lingo-border bg-white p-8 text-center shadow-sm">
          <div className="text-4xl mb-3">📚</div>
          <h2 className="text-lg font-black text-lingo-text mb-1">
            Your library is empty
          </h2>
          <p className="text-sm text-lingo-text-light mb-5">
            Browse public courses to start practicing!
          </p>
          <Link
            href="/library/browse"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-lingo-green bg-lingo-green px-5 py-2.5 text-sm font-black text-white shadow-[0_2px_0_0] shadow-green-700 transition-all hover:bg-lingo-green/90 active:translate-y-[1px]"
          >
            <span>🔍</span> Browse Courses
          </Link>
        </div>
      ) : (
        <CourseBookShelf courses={allCourses} isAdmin={isAdmin} />
      )}
    </div>
  );
}
