"use server";

import { db } from "@/lib/db";
import {
  studentAccess,
  course,
  unit,
  user,
} from "@/lib/db/schema";
import { and, eq, isNull, desc, count } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { revalidatePath } from "next/cache";
import { getStudentsList, type StudentSummary } from "@/lib/actions/teacher";

// ─── Types ───

export interface PrivateCourseItem {
  id: string;
  title: string;
  unitCount: number;
}

export interface PrivateUnitItem {
  id: string;
  title: string;
}

export interface StudentGrantSummary {
  courseIds: string[];
  unitIds: string[];
}

// ─── Helpers ───

/** Only the site owner (author) may grant content to students. */
async function requireOwner() {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) {
    throw new Error("Only the site owner can share content with students");
  }
  return session;
}

// ─── Student listing (reuses the existing teacher inspector query) ───

export async function listRegisteredStudents(): Promise<StudentSummary[]> {
  try {
    return await getStudentsList();
  } catch (err) {
    console.warn("listRegisteredStudents failed:", err);
    return [];
  }
}

// ─── Owner's private content (the catalogue the owner can share) ───

export async function listOwnerPrivateContent(): Promise<{
  courses: PrivateCourseItem[];
  units: PrivateUnitItem[];
}> {
  const session = await requireOwner();
  const ownerId = session.user.id;

  try {
    const courseRows = await db
      .select({
        id: course.id,
        title: course.title,
        visibility: course.visibility,
        unitCount: count(unit.id),
      })
      .from(course)
      .leftJoin(unit, eq(unit.courseId, course.id))
      .where(and(eq(course.createdBy, ownerId), eq(course.published, true)))
      .groupBy(course.id, course.title, course.visibility)
      .orderBy(course.title);

    const privateCourses = courseRows
      .filter((c) => c.visibility !== "public")
      .map((c) => ({
        id: c.id,
        title: c.title ?? "Untitled",
        unitCount: Number(c.unitCount),
      }));

    const unitRows = await db
      .select({
        id: unit.id,
        title: unit.title,
        visibility: unit.visibility,
      })
      .from(unit)
      .where(and(eq(unit.createdBy, ownerId), isNull(unit.courseId)))
      .orderBy(unit.title);
    const privateUnits = unitRows
      .filter((u) => u.visibility !== "public")
      .map((u) => ({ id: u.id, title: u.title ?? "Untitled" }));

    return { courses: privateCourses, units: privateUnits };
  } catch (err) {
    console.warn("listOwnerPrivateContent failed:", err);
    return { courses: [], units: [] };
  }
}

// ─── Per-student grants ───

export async function getStudentGrants(
  studentId: string
): Promise<StudentGrantSummary> {
  const session = await requireOwner();
  try {
    const rows = await db
      .select({
        courseId: studentAccess.courseId,
        unitId: studentAccess.unitId,
      })
      .from(studentAccess)
      .where(
        and(
          eq(studentAccess.ownerId, session.user.id),
          eq(studentAccess.studentId, studentId)
        )
      );
    return {
      courseIds: rows.map((r) => r.courseId).filter(Boolean) as string[],
      unitIds: rows.map((r) => r.unitId).filter(Boolean) as string[],
    };
  } catch (err) {
    console.warn("getStudentGrants failed:", err);
    return { courseIds: [], unitIds: [] };
  }
}

export async function setStudentCourseAccess(
  studentId: string,
  courseId: string,
  enabled: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireOwner();
  const ownerId = session.user.id;
  try {
    // Confirm the course belongs to the owner and is not public.
    const [c] = await db
      .select({ id: course.id, visibility: course.visibility, createdBy: course.createdBy })
      .from(course)
      .where(eq(course.id, courseId));
    if (!c) return { success: false, error: "Course not found" };
    if (c.createdBy !== ownerId)
      return { success: false, error: "You do not own this course" };

    if (enabled) {
      await db
        .insert(studentAccess)
        .values({ ownerId, studentId, courseId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(studentAccess)
        .where(
          and(
            eq(studentAccess.ownerId, ownerId),
            eq(studentAccess.studentId, studentId),
            eq(studentAccess.courseId, courseId)
          )
        );
    }
    revalidatePath("/library/students");
    return { success: true };
  } catch (err) {
    console.error("setStudentCourseAccess failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to update student access";
    return { success: false, error: message };
  }
}

export async function setStudentUnitAccess(
  studentId: string,
  unitId: string,
  enabled: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireOwner();
  const ownerId = session.user.id;
  try {
    const [u] = await db
      .select({ id: unit.id, visibility: unit.visibility, createdBy: unit.createdBy })
      .from(unit)
      .where(eq(unit.id, unitId));
    if (!u) return { success: false, error: "Unit not found" };
    if (u.createdBy !== ownerId)
      return { success: false, error: "You do not own this unit" };

    if (enabled) {
      await db
        .insert(studentAccess)
        .values({ ownerId, studentId, unitId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(studentAccess)
        .where(
          and(
            eq(studentAccess.ownerId, ownerId),
            eq(studentAccess.studentId, studentId),
            eq(studentAccess.unitId, unitId)
          )
        );
    }
    revalidatePath("/library/students");
    return { success: true };
  } catch (err) {
    console.error("setStudentUnitAccess failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to update student access";
    return { success: false, error: message };
  }
}
