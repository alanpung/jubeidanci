"use server";

import { db } from "@/lib/db";
import { course } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { revalidatePath } from "next/cache";
import { getCourseMarkdownForEdit } from "@/lib/db/queries/courses";
import { normalizeQuestionType } from "@/lib/content/question-types";

export async function renameCourse(
  courseId: string,
  title: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return { success: false, error: "Course name is required" };
  }

  if (trimmedTitle.length > 120) {
    return { success: false, error: "Course name must be 120 characters or fewer" };
  }

  const [existing] = await db
    .select({ createdBy: course.createdBy })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existing) {
    return { success: false, error: "Course not found" };
  }

  const isAdmin = isAdminEmail(session.user.email);
  if (existing.createdBy !== session.user.id && !isAdmin) {
    return { success: false, error: "You do not own this course" };
  }

  await db
    .update(course)
    .set({ title: trimmedTitle, updatedAt: new Date() })
    .where(eq(course.id, courseId));

  revalidatePath("/library", "page");
  revalidatePath("/library/browse", "page");
  revalidatePath(`/library/${courseId}`, "page");
  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  revalidatePath(`/units/${courseId}`, "page");

  return { success: true };
}

/** Every course the caller may edit markdown for — their own, plus anything at
 *  all when they are the site admin. Powers the course picker on /markdown. */
export async function listEditableCourses(): Promise<
  | {
      success: true;
      courses: {
        id: string;
        title: string;
        level: string;
        /** Resolved exercise type id (e.g. "flashcard-review"), null if unknown. */
        questionTypeId: string | null;
      }[];
    }
  | { success: false; error: string }
> {
  const session = await requireSession();
  const isAdmin = isAdminEmail(session.user.email);

  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      level: course.level,
      createdBy: course.createdBy,
    })
    .from(course)
    .orderBy(course.level, course.title);

  const courses = rows
    .filter((r) => isAdmin || r.createdBy === session.user.id)
    .map((r) => ({
      id: r.id,
      title: r.title,
      level: r.level,
      // Same keyword resolution the Library symbols use (title + id), so a
      // course's type in the picker always matches its shelf symbol.
      questionTypeId: normalizeQuestionType(`${r.title} ${r.id}`)?.id ?? null,
    }));

  if (isAdmin) {
    const { getAllCourses } = await import("@/lib/content/registry");
    const existingIds = new Set(courses.map((c) => c.id));
    for (const fc of getAllCourses()) {
      if (!existingIds.has(fc.id)) {
        courses.push({
          id: fc.id,
          title: fc.title,
          level: fc.level,
          questionTypeId: normalizeQuestionType(`${fc.title} ${fc.id}`)?.id ?? null,
        });
      }
    }
  }

  return { success: true, courses };
}

/** Raw markdown of every unit in one course, for the owner-facing editor. */
export async function fetchCourseMarkdownForEdit(
  courseId: string
): Promise<
  | {
      success: true;
      courseId: string;
      title: string;
      units: {
        id: string;
        title: string;
        icon: string | null;
        markdown: string;
        lessonCount: number;
      }[];
    }
  | { success: false; error: string }
> {
  const session = await requireSession();
  const isAdmin = isAdminEmail(session.user.email);
  const data = await getCourseMarkdownForEdit(courseId, session.user.id, isAdmin);
  if (!data) {
    return { success: false, error: "Course not found, or you don't own it." };
  }
  return {
    success: true,
    courseId: data.id,
    title: data.title,
    units: data.units,
  };
}
