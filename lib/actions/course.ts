"use server";

import { db } from "@/lib/db";
import { course } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { revalidatePath } from "next/cache";

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
