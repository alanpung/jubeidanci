import Link from "next/link";
import { getSession } from "@/lib/auth-server";
import {
  getStandaloneUnits,
  listCoursesWithLessonCounts,
} from "@/lib/db/queries/courses";
import type {
  StandaloneUnitInfo,
  CourseListItem,
} from "@/lib/content/types";
import { isAdminEmail } from "@/lib/ai/models";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { StandaloneUnits } from "@/components/library/standalone-units";
import {
  CourseBookShelf,
  LibraryLegend,
} from "@/components/library/course-book-shelf";
import { LearnHeader } from "@/components/library/learn-header";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const session = await getSession();

  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  let standaloneUnits: StandaloneUnitInfo[] = [];
  let allCourses: CourseListItem[] = [];
  let targetLang: string | null = null;

  if (userId) {
    const results = await Promise.allSettled([
      getStandaloneUnits(userId),
      listCoursesWithLessonCounts(undefined, userId, false),
      getTargetLanguage(userId),
    ]);

    if (results[0].status === "fulfilled") {
      standaloneUnits = results[0].value;
    } else {
      console.error("LearnPage: getStandaloneUnits failed:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      allCourses = results[1].value;
    } else {
      console.error("LearnPage: listCoursesWithLessonCounts failed:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
      targetLang = results[2].value;
    } else {
      console.error("LearnPage: getTargetLanguage failed:", results[2].reason);
    }
  }

  const isEmptyLibrary =
    allCourses.length === 0 && standaloneUnits.length === 0 && !isAdmin;

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
            Browse public courses and standalone units to start practicing!
          </p>
          <Link
            href="/library/browse"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-lingo-green bg-lingo-green px-5 py-2.5 text-sm font-black text-white shadow-[0_2px_0_0] shadow-green-700 transition-all hover:bg-lingo-green/90 active:translate-y-[1px]"
          >
            <span>🔍</span> Browse Courses &amp; Units
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1">
            <CourseBookShelf courses={allCourses} isAdmin={isAdmin} />
            <StandaloneUnits units={standaloneUnits} isAdmin={isAdmin} />
          </div>
          <aside className="hidden shrink-0 lg:block lg:w-60">
            <div className="sticky top-4">
              <LibraryLegend />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
