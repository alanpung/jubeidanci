import { getUnitWithContent } from "@/lib/db/queries/courses";
import { notFound } from "next/navigation";
import { LessonView } from "./lesson-view";

interface PageProps {
  params: Promise<{ courseId: string; unitId: string; lessonIndex: string }>;
}

export default async function LessonPage({ params }: PageProps) {
  const { courseId, unitId, lessonIndex } = await params;
  const unit = await getUnitWithContent(unitId);
  if (!unit) notFound();

  const li = parseInt(lessonIndex, 10);
  const lesson = unit.lessons[li];
  if (!lesson) notFound();

  return (
    <LessonView
      courseId={courseId}
      unitId={unitId}
      lessonIndex={li}
      lesson={lesson}
      lessonTitle={lesson.title}
      unitTitle={unit.title}
      targetLanguage={unit.targetLanguage}
    />
  );
}
