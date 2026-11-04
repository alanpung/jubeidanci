import { getSession } from "@/lib/auth-server";
import {
  listCoursesWithLessonCounts,
  getStandaloneUnits,
  getVipOwnerIds,
} from "@/lib/db/queries/courses";
import type { CourseListItem, StandaloneUnitInfo } from "@/lib/content/types";
import { isAdminEmail } from "@/lib/ai/models";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { CourseBookShelf } from "@/components/library/course-book-shelf";
import { LearnHeader } from "@/components/library/learn-header";
import { RefreshLibraryButton } from "@/components/library/refresh-library-button";
import { withTimeout } from "@/lib/db/timeout";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const session = await getSession();

  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  let allCourses: CourseListItem[] = [];
  let targetLang: string | null = null;
  let standaloneUnits: StandaloneUnitInfo[] = [];
  // Owner ids for which the viewer is a VIP — grants access to the owner's
  // private/VIP content without owning it. Drives the per-tile open gate.
  let vipOwnerIds: string[] = [];

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
      withTimeout<StandaloneUnitInfo[]>(
        "library:getStandaloneUnits",
        getStandaloneUnits(userId),
        10000,
        [] as StandaloneUnitInfo[],
      ),
      withTimeout<string[]>(
        "library:getVipOwnerIds",
        getVipOwnerIds(userId).then((s) => [...s]),
        5000,
        [] as string[],
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

    if (results[2].status === "fulfilled") {
      standaloneUnits = results[2].value;
    } else {
      console.error("LearnPage: getStandaloneUnits failed:", results[2].reason);
    }

    if (results[3].status === "fulfilled") {
      vipOwnerIds = results[3].value;
    } else {
      console.error("LearnPage: getVipOwnerIds failed:", results[3].reason);
    }
  }

  const isEmptyLibrary = allCourses.length === 0 && standaloneUnits.length === 0;

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
          <RefreshLibraryButton />
        </div>
      ) : (
        <>
          {/* The AI tutor's units are not a section of their own any more —
              they live in the "Standalone Units" folder inside My Books. */}
          <CourseBookShelf
            courses={allCourses}
            units={standaloneUnits}
            isAdmin={isAdmin}
            vipOwnerIds={vipOwnerIds}
          />
        </>
      )}
    </div>
  );
}
