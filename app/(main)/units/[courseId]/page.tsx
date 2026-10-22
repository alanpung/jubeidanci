import { notFound } from "next/navigation";
import { getCourseWithContent } from "@/lib/db/queries/courses";
import { getUserProgress } from "@/lib/actions/progress";
import { LearningPath } from "../learning-path";
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

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 overflow-x-hidden">
      <LearningPath
        course={course}
        completions={progress.completions}
        userId={userId}
      />
    </div>
  );
}