import { notFound } from "next/navigation";
import { getCourseWithContent } from "@/lib/db/queries/courses";
import { getUserProgress } from "@/lib/actions/progress";
import { LearningPath } from "@/components/library/learning-path";
import { getSession } from "@/lib/auth-server";

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

  // Just the breadcrumb and the unit list. Per-student course sharing used to
  // render here, but VIP management now lives on the dedicated /library/students
  // page, so there is no inline student list on the course page anymore.
  return (
    <div className="mx-auto w-full max-w-2xl">
      <LearningPath
        course={course}
        completions={progress.completions}
        userId={userId}
      />
    </div>
  );
}