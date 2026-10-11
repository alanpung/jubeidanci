"use server";

import {
  syncUserCourseWordsToSrs,
  cleanupUnstudiedCourseWordsFromSrs,
  invalidateUserLibraryWordsCache,
} from "@/lib/actions/srs";

import { db, isDbAvailable } from "@/lib/db";
import { unit, course, user, userUnitLibrary, userCourseEnrollment } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/ai/models";

export async function addUnitToLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  // Verify unit exists
  const [existing] = await db
    .select({
      id: unit.id,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      courseId: unit.courseId,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  // Check if created by an admin
  let isCreatedByAdmin = false;
  if (existing.createdBy) {
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, existing.createdBy));
    isCreatedByAdmin = creator?.email ? isAdminEmail(creator.email) : false;
  }

  // If in a course, check if parent course is public or created by admin
  let isParentCoursePublic = false;
  if (existing.courseId) {
    const [parentCourse] = await db
      .select({ visibility: course.visibility, createdBy: course.createdBy })
      .from(course)
      .where(eq(course.id, existing.courseId));
    if (parentCourse) {
      if (parentCourse.visibility === "public") isParentCoursePublic = true;
      if (parentCourse.createdBy) {
        const [courseCreator] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, parentCourse.createdBy));
        if (courseCreator?.email && isAdminEmail(courseCreator.email)) {
          isCreatedByAdmin = true;
        }
      }
    }
  }

  if (existing.visibility !== "public" && !isCreatedByAdmin && !isParentCoursePublic) {
    return { success: false, error: "Unit is not public" };
  }

  if (existing.createdBy === userId) {
    return { success: true };
  }

  // Insert into library (ignore if already exists)
  await db
    .insert(userUnitLibrary)
    .values({ userId, unitId })
    .onConflictDoNothing();

  await invalidateUserLibraryWordsCache(userId);
  await syncUserCourseWordsToSrs(userId, true);

  revalidatePath("/library", "page");
  revalidatePath("/library/browse", "page");
  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  if (existing.courseId) {
    revalidatePath(`/library/${existing.courseId}`, "page");
    revalidatePath(`/units/${existing.courseId}`, "page");
  }
  revalidatePath(`/unit/${unitId}`, "page");
  return { success: true };
}

export async function removeUnitFromLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  await db
    .delete(userUnitLibrary)
    .where(
      and(
        eq(userUnitLibrary.userId, userId),
        eq(userUnitLibrary.unitId, unitId)
      )
    );

  await invalidateUserLibraryWordsCache(userId);
  await cleanupUnstudiedCourseWordsFromSrs(userId);

  revalidatePath("/library", "page");
  revalidatePath("/units", "page");
  revalidatePath(`/unit/${unitId}`, "page");
  return { success: true };
}

export async function addCourseToLibrary(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  const { seedContentFromFilesystem } = await import("@/lib/db/seed-content");
  await seedContentFromFilesystem().catch(() => {});

  let [existingCourse] = await db
    .select({
      id: course.id,
      visibility: course.visibility,
      createdBy: course.createdBy,
    })
    .from(course)
    .where(eq(course.id, courseId));

  const { SYSTEM_COURSE_IDS } = await import("@/lib/db/queries/courses");
  const isSystemCourse = SYSTEM_COURSE_IDS.includes(courseId);

  if (!existingCourse && isSystemCourse) {
    existingCourse = {
      id: courseId,
      visibility: "public",
      createdBy: null,
    };
  }

  if (!existingCourse) {
    return { success: false, error: "Course not found" };
  }

  // Check if user is owner (except for default system courses)
  if (existingCourse.createdBy === userId && !isSystemCourse) {
    return { success: true };
  }

  // Check visibility or creator admin status
  let isCreatedByAdmin = false;
  if (existingCourse.createdBy) {
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, existingCourse.createdBy));
    isCreatedByAdmin = creator?.email ? isAdminEmail(creator.email) : false;
  }

  if (existingCourse.visibility !== "public" && !isCreatedByAdmin) {
    return { success: false, error: "Course is not public" };
  }

  // Insert into course enrollment (DB and local store)
  const { addLocalCourseEnrollment } = await import("@/lib/srs-store");
  await addLocalCourseEnrollment(userId, courseId);

  if (await isDbAvailable()) {
    try {
      await db
        .insert(userCourseEnrollment)
        .values({ userId, courseId })
        .onConflictDoNothing();
    } catch {}
  }

  // Add all units in the course to userUnitLibrary (from DB or filesystem)
  let unitsInCourse = await db
    .select({ id: unit.id })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  if (unitsInCourse.length === 0) {
    const { loadContentDir } = await import("@/lib/content/loader");
    const { units: fsUnits } = loadContentDir();
    const fsUnitIds = fsUnits
      .filter((u) => u.parsed.courseId === courseId)
      .map((u) => {
        const match = u.parsed.title.match(/Unit\s+(\d+)/i);
        const unitNum = match ? parseInt(match[1], 10) : null;
        return unitNum ? `${courseId}-unit-${unitNum}` : `${courseId}-${u.parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      });
    unitsInCourse = fsUnitIds.map((id) => ({ id }));
  }

  for (const u of unitsInCourse) {
    await db
      .insert(userUnitLibrary)
      .values({ userId, unitId: u.id })
      .onConflictDoNothing();
  }

  await invalidateUserLibraryWordsCache(userId);
  await syncUserCourseWordsToSrs(userId, true);

  revalidatePath("/library", "page");
  revalidatePath("/library/browse", "page");
  revalidatePath(`/library/${courseId}`, "page");
  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  revalidatePath(`/units/${courseId}`, "page");
  return { success: true };
}

export async function removeCourseFromLibrary(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  const { removeLocalCourseEnrollment } = await import("@/lib/srs-store");
  await removeLocalCourseEnrollment(userId, courseId);

  // 1. Remove enrollment
  await db
    .delete(userCourseEnrollment)
    .where(
      and(
        eq(userCourseEnrollment.userId, userId),
        eq(userCourseEnrollment.courseId, courseId)
      )
    );

  // 2. Remove all course units from user's unit library
  const unitsInCourse = await db
    .select({ id: unit.id })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  if (unitsInCourse.length > 0) {
    const unitIds = unitsInCourse.map((u) => u.id);
    await db
      .delete(userUnitLibrary)
      .where(
        and(
          eq(userUnitLibrary.userId, userId),
          inArray(userUnitLibrary.unitId, unitIds)
        )
      );
  }

  // 3. If createdBy was set to userId on a system or public course, clear createdBy to null
  await db
    .update(course)
    .set({ createdBy: null })
    .where(and(eq(course.id, courseId), eq(course.createdBy, userId)));

  // 4. Clean up unstudied 'new' SRS cards for levels no longer active in user's library
  await invalidateUserLibraryWordsCache(userId);
  await cleanupUnstudiedCourseWordsFromSrs(userId);

  revalidatePath("/", "layout");
  revalidatePath("/library", "page");
  revalidatePath("/library/browse", "page");
  revalidatePath(`/library/${courseId}`, "page");
  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  revalidatePath(`/units/${courseId}`, "page");
  return { success: true };
}

