"use server";

import { db } from "@/lib/db";
import {
  studentAccess,
  studentVip,
  course,
  unit,
  user,
} from "@/lib/db/schema";
import { ensureStudentVipTable } from "@/lib/db/ensure-student-vip";
import { and, eq, or, isNull, desc, count } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { revalidatePath } from "next/cache";
import { getStudentsList, type StudentSummary } from "@/lib/actions/teacher";
import { ensureStudentAccessTable } from "@/lib/db/ensure-student-access";

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

/**
 * Resolve a user reference to a real `user.id`.
 *
 * The student picker passes the id shown in the students list, but ids can
 * drift between auth providers (email-based ids in some SRS rows, generated
 * ids in better-auth). Falling back to the email keeps grants working when
 * the id we hold is not the primary key.
 */
async function resolveUserId(reference: string): Promise<string | null> {
  if (!reference) return null;
  try {
    const [byId] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, reference))
      .limit(1);
    if (byId?.id) return byId.id;

    const [byEmail] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, reference))
      .limit(1);
    return byEmail?.id ?? null;
  } catch (err) {
    console.warn("resolveUserId failed:", err);
    return null;
  }
}

/**
 * Turn a thrown error into something actionable. Drizzle wraps the Postgres
 * error, so the constraint name / real reason lives on `cause`.
 */
function describeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const cause = (err as { cause?: unknown }).cause;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  if (causeMessage && !err.message.includes(causeMessage)) {
    return `${err.message} — ${causeMessage}`;
  }
  return err.message || fallback;
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
    await ensureStudentAccessTable();
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

/**
 * Everyone who can already open one private course: the students granted this
 * course explicitly, plus the owner's VIP students (who can see every private
 * course, so the panel shows them as inherited rather than individually
 * granted). One round trip for the whole panel instead of a `getStudentGrants`
 * call per student.
 */
export async function listCourseStudentAccess(courseId: string): Promise<{
  studentIds: string[];
  vipIds: string[];
}> {
  const session = await requireOwner();
  const ownerId = session.user.id;
  try {
    await ensureStudentAccessTable();
    await ensureStudentVipTable();
    const [granted, vips] = await Promise.all([
      db
        .select({ studentId: studentAccess.studentId })
        .from(studentAccess)
        .where(
          and(
            eq(studentAccess.ownerId, ownerId),
            eq(studentAccess.courseId, courseId)
          )
        ),
      db
        .select({ studentId: studentVip.studentId })
        .from(studentVip)
        .where(eq(studentVip.ownerId, ownerId)),
    ]);
    return {
      studentIds: [...new Set(granted.map((r) => r.studentId))],
      vipIds: [...new Set(vips.map((r) => r.studentId))],
    };
  } catch (err) {
    console.warn("listCourseStudentAccess failed:", err);
    return { studentIds: [], vipIds: [] };
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
    await ensureStudentAccessTable();
    // Confirm the course belongs to the owner and is not public.
    const [c] = await db
      .select({ id: course.id, visibility: course.visibility, createdBy: course.createdBy })
      .from(course)
      .where(eq(course.id, courseId));
    if (!c) return { success: false, error: "Course not found" };
    if (c.createdBy !== ownerId)
      return { success: false, error: "You do not own this course" };

    // Resolve the student to a real `user` row — we store the primary key, so
    // a stale id (or an email) would otherwise create an orphan grant.
    const resolvedStudentId = await resolveUserId(studentId);
    if (enabled && !resolvedStudentId) {
      return {
        success: false,
        error: `Student "${studentId}" was not found in the user table`,
      };
    }
    const targetStudentId = resolvedStudentId ?? studentId;

    if (enabled) {
      await db
        .insert(studentAccess)
        .values({ ownerId, studentId: targetStudentId, courseId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(studentAccess)
        .where(
          and(
            eq(studentAccess.ownerId, ownerId),
            eq(studentAccess.courseId, courseId),
            or(eq(studentAccess.studentId, targetStudentId), eq(studentAccess.studentId, studentId))!
          )
        );
    }
    revalidatePath("/library/students");
    return { success: true };
  } catch (err) {
    console.error("setStudentCourseAccess failed:", err);
    return {
      success: false,
      error: describeError(err, "Failed to update student access"),
    };
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
    await ensureStudentAccessTable();
    const [u] = await db
      .select({ id: unit.id, visibility: unit.visibility, createdBy: unit.createdBy })
      .from(unit)
      .where(eq(unit.id, unitId));
    if (!u) return { success: false, error: "Unit not found" };
    if (u.createdBy !== ownerId)
      return { success: false, error: "You do not own this unit" };

    const resolvedStudentId = await resolveUserId(studentId);
    if (enabled && !resolvedStudentId) {
      return {
        success: false,
        error: `Student "${studentId}" was not found in the user table`,
      };
    }
    const targetStudentId = resolvedStudentId ?? studentId;

    if (enabled) {
      await db
        .insert(studentAccess)
        .values({ ownerId, studentId: targetStudentId, unitId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(studentAccess)
        .where(
          and(
            eq(studentAccess.ownerId, ownerId),
            eq(studentAccess.unitId, unitId),
            or(eq(studentAccess.studentId, targetStudentId), eq(studentAccess.studentId, studentId))!
          )
        );
    }
    revalidatePath("/library/students");
    return { success: true };
  } catch (err) {
    console.error("setStudentUnitAccess failed:", err);
    return {
      success: false,
      error: describeError(err, "Failed to update student access"),
    };
  }
}

// ─── Per-student VIP status ───
//
// A single switch that grants a student access to ALL of the owner's private
// (VIP) content — simpler than per-course/per-unit grants. Students are public
// by default; the owner flips them to VIP here.

/**
 * Returns the set of student ids that are VIPs of `ownerId`.
 * The owner uses this to seed the toggle state on the VIP page.
 */
export async function getVipStudentIds(
  ownerId: string
): Promise<Set<string>> {
  try {
    await ensureStudentVipTable();
    const rows = await db
      .select({ studentId: studentVip.studentId })
      .from(studentVip)
      .where(eq(studentVip.ownerId, ownerId));
    return new Set(rows.map((r) => r.studentId));
  } catch (err) {
    console.warn("getVipStudentIds failed:", err);
    return new Set();
  }
}

/**
 * Returns the set of owner ids for which `studentId` is a VIP.
 * A student's access layer uses this to see which owners' private content
 * they may view.
 */
export async function getVipOwnerIds(
  studentId: string
): Promise<Set<string>> {
  try {
    await ensureStudentVipTable();
    const rows = await db
      .select({ ownerId: studentVip.ownerId })
      .from(studentVip)
      .where(eq(studentVip.studentId, studentId));
    return new Set(rows.map((r) => r.ownerId));
  } catch (err) {
    console.warn("getVipOwnerIds failed:", err);
    return new Set();
  }
}

/** Convenience check used by the access layer. */
export async function isStudentVip(
  studentId: string,
  ownerId: string
): Promise<boolean> {
  try {
    await ensureStudentVipTable();
    const [row] = await db
      .select({ id: studentVip.id })
      .from(studentVip)
      .where(
        and(
          eq(studentVip.ownerId, ownerId),
          eq(studentVip.studentId, studentId)
        )
      )
      .limit(1);
    return !!row;
  } catch (err) {
    console.warn("isStudentVip failed:", err);
    return false;
  }
}

export async function setStudentVip(
  studentId: string,
  enabled: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireOwner();
  const ownerId = session.user.id;
  try {
    await ensureStudentVipTable();

    const resolvedStudentId = await resolveUserId(studentId);
    if (enabled && !resolvedStudentId) {
      return {
        success: false,
        error: `Student "${studentId}" was not found in the user table`,
      };
    }
    const targetStudentId = resolvedStudentId ?? studentId;

    if (enabled) {
      await db
        .insert(studentVip)
        .values({ ownerId, studentId: targetStudentId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(studentVip)
        .where(
          and(
            eq(studentVip.ownerId, ownerId),
            or(
              eq(studentVip.studentId, targetStudentId),
              eq(studentVip.studentId, studentId)
            )!
          )
        );
    }
    revalidatePath("/library/students");
    return { success: true };
  } catch (err) {
    console.error("setStudentVip failed:", err);
    return {
      success: false,
      error: describeError(err, "Failed to update VIP status"),
    };
  }
}
