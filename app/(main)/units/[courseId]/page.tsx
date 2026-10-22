import { notFound } from "next/navigation";
import { getCourseWithContent } from "@/lib/db/queries/courses";
import { getUserProgress } from "@/lib/actions/progress";
import { LearningPath } from "../learning-path";
import { getSession } from "@/lib/auth-server";
import { db, isDbAvailable } from "@/lib/db";
import { userUnitLibrary, userCourseEnrollment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { CourseLibraryBanner } from "@/components/course/course-library-banner";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await getSession();
  const userId = session?.user?.id;
  const course = await getCourseWithContent(courseId, userId);
  if (!course) notFound();

  const progress = await getUserProgress(course.id);
  const isOwner = course.createdBy === userId;

  let libraryUnitIds: string[] = [];
  let isCourseInLibrary = false;
  if (userId) {
    let localEnrollments: string[] = [];
    try {
      const { getLocalCourseEnrollments } = await import("@/lib/srs-store");
      localEnrollments = await getLocalCourseEnrollments(userId);
    } catch {}

    if (await isDbAvailable()) {
      try {
        const [libRows, enrollment] = await Promise.all([
          db
            .select({ unitId: userUnitLibrary.unitId })
            .from(userUnitLibrary)
            .where(eq(userUnitLibrary.userId, userId)),
          db
            .select({ id: userCourseEnrollment.id })
            .from(userCourseEnrollment)
            .where(
              and(
                eq(userCourseEnrollment.userId, userId),
                eq(userCourseEnrollment.courseId, courseId)
              )
            )
            .limit(1),
        ]);
        libraryUnitIds = libRows.map((r) => r.unitId);
        const hasDbEnrollment = enrollment.length > 0;
        const hasLocalEnrollment = localEnrollments.includes(courseId);
        const hasUnitsInLibrary = course.units?.some((u) => libraryUnitIds.includes(u.id)) ?? false;
        const hasCompletions = progress.completions.length > 0;

        isCourseInLibrary = hasDbEnrollment || hasLocalEnrollment || hasUnitsInLibrary || hasCompletions || isOwner;
      } catch (err) {
        console.warn("CourseDetailPage: failed to fetch user unit library:", err);
        isCourseInLibrary = localEnrollments.includes(courseId);
      }
    } else {
      isCourseInLibrary = localEnrollments.includes(courseId);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 overflow-x-hidden">
      {/* No page heading here — the breadcrumb inside LearningPath already
          reads "Library / <course>", so the title would be repeated. */}
      {userId && !isOwner && (
        <CourseLibraryBanner
          courseId={course.id}
          initialIsInLibrary={isCourseInLibrary}
        />
      )}
      <LearningPath
        course={course}
        completions={progress.completions}
        libraryUnitIds={libraryUnitIds}
        userId={userId}
      />
    </div>
  );
}
