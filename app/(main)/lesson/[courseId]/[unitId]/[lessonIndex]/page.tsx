import { getUnitWithContent, getCourseTitle, canAccessUnit } from "@/lib/db/queries/courses";
import { getSession } from "@/lib/auth-server";
import { isDbAvailable } from "@/lib/db";
import { notFound } from "next/navigation";
import { LessonView } from "./lesson-view";

interface PageProps {
  params: Promise<{ courseId: string; unitId: string; lessonIndex: string }>;
}

export default async function LessonPage({ params }: PageProps) {
  const { courseId, unitId, lessonIndex } = await params;
  const session = await getSession();
  const userId = session?.user?.id;

  // Gate the lesson behind the unit's access rule. When the DB is unreachable
  // we skip the check to preserve the previous open behaviour for filesystem
  // content. Admins no longer get a blanket bypass here.
  if ((await isDbAvailable()) && !(await canAccessUnit(unitId, userId))) {
    notFound();
  }

  const [unit, courseTitle] = await Promise.all([
    getUnitWithContent(unitId),
    getCourseTitle(courseId),
  ]);
  if (!unit) notFound();

  const li = parseInt(lessonIndex, 10);
  const lesson = unit.lessons[li];
  if (!lesson) notFound();

  return (
    <LessonView
      courseId={courseId}
      courseTitle={courseTitle}
      unitId={unitId}
      lessonIndex={li}
      totalLessons={unit.lessons.length}
      nextLessonTitle={unit.lessons[li + 1]?.title ?? null}
      lesson={lesson}
      lessonTitle={lesson.title}
      unitTitle={unit.title}
      targetLanguage={unit.targetLanguage}
    />
  );
}
