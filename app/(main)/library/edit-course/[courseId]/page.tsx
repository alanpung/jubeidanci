import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { getCourseMarkdownForEdit } from "@/lib/db/queries/courses";
import { CourseMarkdownEditor } from "./course-markdown-editor";

interface EditCoursePageProps {
  params: Promise<{ courseId: string }>;
}

export default async function EditCoursePage({ params }: EditCoursePageProps) {
  const { courseId } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const isAdmin = isAdminEmail(session.user.email);
  const course = await getCourseMarkdownForEdit(courseId, session.user.id, isAdmin);
  if (!course) {
    redirect("/library");
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <CourseMarkdownEditor
        courseId={course.id}
        courseTitle={course.title}
        units={course.units}
        isAdmin={isAdmin}
      />
    </div>
  );
}
