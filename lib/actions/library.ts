"use server";

import {
  syncUserCourseWordsToSrs,
  pruneStaleNewCards,
  invalidateUserLibraryWordsCache,
} from "@/lib/actions/srs";

import { db, isDbAvailable } from "@/lib/db";
import { unit, course, userUnitLibrary, userCourseEnrollment } from "@/lib/db/schema";
import { eq, and, inArray, like, or } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";
import { canAccessUnit, canAccessCourse } from "@/lib/db/queries/courses";

export async function addUnitToLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  // Verify unit exists
  let [existing] = await db
    .select({
      id: unit.id,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      courseId: unit.courseId,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    // Filesystem-backed units only exist in the DB after a seed run. Only
    // pay for that when the lookup actually missed, otherwise every add
    // re-walks all of content/.
    const { ensureContentSeeded } = await import("@/lib/db/seed-content");
    await ensureContentSeeded().catch(() => {});

    [existing] = await db
      .select({
        id: unit.id,
        visibility: unit.visibility,
        createdBy: unit.createdBy,
        courseId: unit.courseId,
      })
      .from(unit)
      .where(eq(unit.id, unitId));
  }

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  // Access gate: a unit can be added if it is public, owned by the viewer, or
  // (for course units) its parent course is shared with a group the viewer is
  // in. Admins no longer get a blanket bypass. When the DB is unreachable we
  // fall back to the previous open behaviour for public filesystem content.
  const dbUp = await isDbAvailable();
  const unitAccessible = !dbUp || (await canAccessUnit(unitId, userId));
  if (!unitAccessible) {
    return { success: false, error: "Unit is not available" };
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
  // Same background-fire rationale as addCourseToLibrary — keeping the action
  // responsive even for users whose library implies thousands of SRS words.
  void syncUserCourseWordsToSrs(userId, true).catch((err) => {
    console.warn("addUnitToLibrary: background SRS sync failed:", err);
  });

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
  // Await the lightweight, two-store prune (it only DELETES, never the heavy
  // full-deck rebuild that re-walks every course and rewrites thousands of
  // rows and used to make "remove" hang). This guarantees the "New" count drops
  // to zero for the removed unit's words immediately, instead of racing the
  // next page-load sync and persisting stale counts.
  await pruneStaleNewCards(userId).catch((err) => {
    console.warn("removeUnitFromLibrary: SRS prune failed:", err);
  });

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


  // Access gate: a course can be added if it is public or shared with a group
  // the viewer belongs to. Admins no longer get a blanket bypass. When the DB
  // is unreachable we fall back to the previous open behaviour.
  const dbUp = await isDbAvailable();
  const courseAccessible = !dbUp || (await canAccessCourse(courseId, userId));
  if (!courseAccessible) {
    return { success: false, error: "Course is not available" };
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
    // No rows means the filesystem content has not landed yet. The seed task
    // walks every course/unit in content/ and upserts them, so only pay that
    // cost when it is actually needed — and wait for it, because
    // seedContentFromFilesystem() is fire-and-forget and
    // userUnitLibrary.unitId has an FK to unit.id.
    const { ensureContentSeeded } = await import("@/lib/db/seed-content");
    await ensureContentSeeded().catch(() => {});

    unitsInCourse = await db
      .select({ id: unit.id })
      .from(unit)
      .where(eq(unit.courseId, courseId));
  }

  if (unitsInCourse.length === 0) {
    // Still nothing (DB down or seed failed): fall back to filesystem ids.
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

  if (unitsInCourse.length > 0) {
    // Single multi-row insert instead of one query per unit. With 10 units
    // in a course, this turns N round-trips into 1 — well within Vercel's
    // action timeout on the free tier.
    try {
      await db
        .insert(userUnitLibrary)
        .values(unitsInCourse.map((u) => ({ userId, unitId: u.id })))
        .onConflictDoNothing();
    } catch (err) {
      // A single unit id that is not present in `unit` (stale filesystem
      // fallback, interrupted seed) sinks the entire batch and surfaces as a
      // user-visible error. Retry row-by-row so the valid units still land.
      console.warn("addCourseToLibrary: batch unit insert failed:", err);
      for (const u of unitsInCourse) {
        await db
          .insert(userUnitLibrary)
          .values({ userId, unitId: u.id })
          .onConflictDoNothing()
          .catch(() => {});
      }
    }
  }

  await invalidateUserLibraryWordsCache(userId);
  // Sync course words into the SRS deck. For a 10-unit / 1000-question course
  // this can mean thousands of srs_card rows. Run in background so the UI
  // returns immediately rather than waiting on long-running DB writes that
  // previously pushed the action over Vercel's function limit.
  void syncUserCourseWordsToSrs(userId, true).catch((err) => {
    console.warn("addCourseToLibrary: background SRS sync failed:", err);
  });

  const { clearContentCache } = await import("@/lib/db/queries/courses");
  clearContentCache();

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
  await removeLocalCourseEnrollment(userId, courseId).catch(() => {});

  if (await isDbAvailable()) {
    // 1. Remove enrollment (table may not exist in older deployments)
    try {
      await db
        .delete(userCourseEnrollment)
        .where(
          and(
            eq(userCourseEnrollment.userId, userId),
            eq(userCourseEnrollment.courseId, courseId)
          )
        );
    } catch {}

    // 2. Remove all course units from user's unit library
    try {
      const unitsInCourse = await db
        .select({ id: unit.id })
        .from(unit)
        .where(eq(unit.courseId, courseId));

      const unitIds = unitsInCourse.map((u) => u.id);
      if (unitIds.length > 0) {
        await db
          .delete(userUnitLibrary)
          .where(
            and(
              eq(userUnitLibrary.userId, userId),
              or(
                inArray(userUnitLibrary.unitId, unitIds),
                like(userUnitLibrary.unitId, `${courseId}-%`)
              )
            )
          );
      } else {
        await db
          .delete(userUnitLibrary)
          .where(
            and(
              eq(userUnitLibrary.userId, userId),
              like(userUnitLibrary.unitId, `${courseId}-%`)
            )
          );
      }
    } catch (err) {
      console.warn("removeCourseFromLibrary unit cleanup warning:", err);
    }

    // 3. If createdBy was set to userId on a system course, clear createdBy to null
    try {
      const { SYSTEM_COURSE_IDS } = await import("@/lib/db/queries/courses");
      if (SYSTEM_COURSE_IDS.includes(courseId)) {
        await db
          .update(course)
          .set({ createdBy: null })
          .where(and(eq(course.id, courseId), eq(course.createdBy, userId)));
      }
    } catch {}
  }

  // 4. Clean up unstudied 'new' SRS cards for levels no longer active in user's library
  const { clearContentCache } = await import("@/lib/db/queries/courses");
  clearContentCache();

  await invalidateUserLibraryWordsCache(userId).catch(() => {});
  // Await the lightweight, two-store prune — NOT the full syncUserCourseWordsToSrs
  // rebuild (which re-walks every enrolled course and rewrites thousands of rows
  // and is what made "remove course" hang). pruneStaleNewCards only DELETES
  // (Postgres + local store symmetrically), so it returns quickly and safely
  // within the request and guarantees the "New" count drops to zero for the
  // removed course instead of racing the next page-load sync.
  await pruneStaleNewCards(userId).catch((err) => {
    console.warn("removeCourseFromLibrary: SRS prune failed:", err);
  });

  revalidatePath("/", "layout");
  revalidatePath("/library", "page");
  revalidatePath("/library/browse", "page");
  revalidatePath(`/library/${courseId}`, "page");
  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  revalidatePath(`/units/${courseId}`, "page");
  return { success: true };
}

