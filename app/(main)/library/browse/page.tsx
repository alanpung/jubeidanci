import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import {
  listCoursesWithLessonCounts,
  getAvailableFilters,
  getBrowsableUnits,
} from "@/lib/db/queries/courses";
import { CourseBrowser } from "@/components/library/course-browser";
import { BrowseUnits } from "@/components/library/browse-units";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/sign-in?redirect=/library/browse");
  }

  const [courses, filters, browsableUnits] = await Promise.all([
    listCoursesWithLessonCounts(undefined, userId),
    getAvailableFilters(userId),
    getBrowsableUnits(userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/library"
          className="shrink-0 text-sm font-bold text-lingo-text-light hover:text-lingo-text transition-colors"
        >
          &larr; Back to Library
        </Link>
        <h1 className="text-2xl font-black text-lingo-text">Browse Content</h1>
      </div>

      {/* Courses Section */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-lingo-text">Public Courses</h2>
        {courses.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-lingo-border p-6 text-center">
            <p className="text-sm font-medium text-lingo-text-light">
              No public courses available yet.
            </p>
          </div>
        ) : (
          <CourseBrowser courses={courses} filters={filters} />
        )}
      </section>

      {/* Standalone Units Section */}
      <section className="mb-8">
        <BrowseUnits units={browsableUnits} />
      </section>
    </div>
  );
}

