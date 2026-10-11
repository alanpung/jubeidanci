import { redirect, notFound } from "next/navigation";
import { getUnitWithContent } from "@/lib/db/queries/courses";
import { getSession } from "@/lib/auth-server";
import { LessonView } from "@/app/(main)/lesson/[courseId]/[unitId]/[lessonIndex]/lesson-view";

interface PageProps {
  params: Promise<{ unitId: string; lessonIndex: string }>;
}

export default async function StandaloneLessonPage({ params }: PageProps) {
  const { unitId, lessonIndex } = await params;
  const session = await getSession();

  // Lessons require authentication
  if (!session) {
    redirect(`/sign-up?redirect=${encodeURIComponent(`/unit/${unitId}/lesson/${lessonIndex}`)}`);
  }

  const unit = await getUnitWithContent(unitId);
  if (!unit) notFound();

  // If unit belongs to a course, redirect to course lesson route
  if (unit.courseId) {
    redirect(`/lesson/${unit.courseId}/${unitId}/${lessonIndex}`);
  }

  const li = parseInt(lessonIndex);
  const lesson = unit.lessons[li];
  if (!lesson) notFound();

  return (
    <LessonView
      unitId={unitId}
      lessonIndex={li}
      lesson={lesson}
      lessonTitle={lesson.title}
      unitTitle={unit.title}
      targetLanguage={unit.targetLanguage}
    />
  );
}
