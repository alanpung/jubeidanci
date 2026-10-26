import { notFound } from "next/navigation";
import { getCourseWithContent } from "@/lib/db/queries/courses";
import { getUserProgress } from "@/lib/actions/progress";
import { LearningPath } from "@/components/library/learning-path";
import { CourseSharePanel } from "@/components/library/course-share-panel";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";

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

  // Sharing only means something while the course is private, and only the
  // owner may grant it — everyone else sees the plain unit list.
  const canShare =
    !!userId &&
    course.createdBy === userId &&
    isAdminEmail(session?.user?.email) &&
    course.visibility !== "public";

  // Nothing but the breadcrumb and the unit list: the course name is already
  // in the breadcrumb, and the "In My Library / Add to My Library" banner only
  // repeated what the Library shelf shows one click away.
  return (
    <div className="mx-auto w-full max-w-2xl">
      <LearningPath
        course={course}
        completions={progress.completions}
        userId={userId}
      />
      {canShare && <CourseSharePanel courseId={course.id} />}
    </div>
  );
}