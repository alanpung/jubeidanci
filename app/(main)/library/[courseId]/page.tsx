import { notFound } from "next/navigation";
import { getCourseWithContent, SYSTEM_COURSE_IDS } from "@/lib/db/queries/courses";
import { getUserProgress } from "@/lib/actions/progress";
import { LearningPath } from "@/components/library/learning-path";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { db, isDbAvailable } from "@/lib/db";
import { userUnitLibrary, userCourseEnrollment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { CourseTitleHeader } from "@/components/course/course-title-header";
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
  const isAdmin = isAdminEmail(session?.user?.email);
  const isOwner = course.createdBy === userId && !SYSTEM_COURSE_IDS.includes(course.id);
  const canEdit = isAdmin || (isOwner && course.visibility !== "public");

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
    <div className="mx-auto w-full max-w-2xl">
      <CourseTitleHeader
        courseId={course.id}
        initialTitle={course.title}
        sourceLanguage={course.sourceLanguage}
        targetLanguage={course.targetLanguage}
        canEdit={canEdit}
        creatorName={course.creatorName}
      />
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
