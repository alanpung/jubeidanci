import { db, isDbAvailable } from "./index";
import { course, unit, user } from "./schema";
import { getAllCourses, getAllUnits } from "../content/registry";
import { eq, or, ilike, and, notInArray, sql, count } from "drizzle-orm";
import { runAfterResponse } from "../after-response";

let lastSyncedAt = 0;

const SYNC_INTERVAL_MS = 30 * 60_000;

/**
 * Single in-flight handle for the seed task. Callers that need the data to
 * actually be present (e.g. addCourseToLibrary inserting rows that FK to
 * unit.id) can await this; callers that just want a background refresh fire
 * it and move on.
 */
let seedPromise: Promise<void> | null = null;

function startSeedTask(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = runSeedTask().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

async function runSeedTask() {
  try {
    // 1. Ensure Alan's user name is "Alan P"
    let alanUser = await db.query.user.findFirst({
      where: ilike(user.email, "alan.pung@gmail.com"),
    });

    if (!alanUser) {
      alanUser = await db.query.user.findFirst({
        where: ilike(user.name, "%alan%"),
      });
    }

    if (alanUser && alanUser.name !== "Alan P") {
      await db.update(user).set({ name: "Alan P" }).where(eq(user.id, alanUser.id));
    }

    const creatorId = alanUser ? alanUser.id : null;

    // 2. Load filesystem content
    const courses = getAllCourses();
    const units = getAllUnits();

    // 3. Batch upsert all filesystem courses with Alan P (creatorId) as author
    if (courses.length > 0) {
      const courseValues = courses.map((c) => ({
        id: c.id,
        title: c.title,
        sourceLanguage: c.sourceLanguage,
        targetLanguage: c.targetLanguage,
        level: c.level,
        visibility: "public" as const,
        published: true,
        createdBy: creatorId,
      }));

      await db
        .insert(course)
        .values(courseValues)
        .onConflictDoUpdate({
          target: course.id,
          set: {
            // The filesystem is only the source of truth for rows that do not
            // exist yet. Once a course is in the DB its title belongs to the
            // owner (edit title); the public/private visibility the owner chose
            // must never be clobbered by a re-seed. We therefore leave
            // `visibility` out of this update entirely: new rows get "public"
            // from the insert `values` above, and existing rows keep whatever
            // the owner set (a private course stored as NULL stays private).
            //
            // `title` is deliberately absent from this update too — a renamed
            // course must survive the next background sync, otherwise the
            // owner's edit silently reverts to the markdown front-matter title.
            sourceLanguage: sql`excluded.source_language`,
            targetLanguage: sql`excluded.target_language`,
            level: sql`excluded.level`,
            published: true,
            createdBy: sql`coalesce(${course.createdBy}, excluded.created_by)`,
            updatedAt: new Date(),
          },
        });
    }

    // 4. Delete unwanted German / test courses and units
    await db
      .delete(unit)
      .where(
        or(
          ilike(unit.targetLanguage, "de"),
          ilike(unit.title, "%German%"),
          ilike(unit.title, "%Steve Jobs%"),
          ilike(unit.title, "%Testing Unit%"),
          ilike(unit.id, "%testing-%"),
          ilike(unit.id, "%steve-jobs-%")
        )
      );

    await db
      .delete(course)
      .where(
        or(
          ilike(course.targetLanguage, "de"),
          ilike(course.title, "%German%"),
          ilike(course.title, "%Steve Jobs%"),
          ilike(course.title, "%Testing%"),
          ilike(course.id, "%testing-%"),
          ilike(course.id, "%steve-jobs-%")
        )
      );

    // 5. Track valid unit IDs for each course and batch upsert filesystem units
    const validUnitIdsByCourse = new Map<string, string[]>();
    const unitValues = [];

    for (const u of units) {
      const p = u.parsed;
      if (!p.targetLanguage || !p.courseId) continue;

      const match = p.title.match(/Unit\s+(\d+)/i);
      const unitNum = match ? parseInt(match[1], 10) : null;
      
      const unitId = unitNum ? `${p.courseId}-unit-${unitNum}` : `${p.courseId}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      if (!validUnitIdsByCourse.has(p.courseId)) {
        validUnitIdsByCourse.set(p.courseId, []);
      }
      validUnitIdsByCourse.get(p.courseId)!.push(unitId);

      unitValues.push({
        id: unitId,
        courseId: p.courseId,
        title: p.title,
        description: p.description,
        icon: p.icon,
        color: p.color,
        markdown: u.markdown,
        targetLanguage: p.targetLanguage,
        sourceLanguage: p.sourceLanguage,
        level: p.level,
        visibility: "public" as const,
        createdBy: creatorId,
      });
    }

    // Insert units in chunks of 5 to keep request payload safe
    for (let i = 0; i < unitValues.length; i += 5) {
      const chunk = unitValues.slice(i, i + 5);
      await db
        .insert(unit)
        .values(chunk)
        .onConflictDoUpdate({
          target: unit.id,
          set: {
            courseId: sql`excluded.course_id`,
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            icon: sql`excluded.icon`,
            color: sql`excluded.color`,
            markdown: sql`excluded.markdown`,
            targetLanguage: sql`excluded.target_language`,
            sourceLanguage: sql`excluded.source_language`,
            level: sql`excluded.level`,
            // Same rule as courses: never reset a visibility the owner chose.
            // Leave `visibility` out of the update so a private unit (NULL)
            // survives every re-seed; new units inherit "public" from values.
            createdBy: sql`coalesce(${unit.createdBy}, excluded.created_by)`,
            updatedAt: new Date(),
          },
        });
    }

    // 6. Strict cleanup of old/ghost units in DB for known courses
    for (const [courseId, validIds] of validUnitIdsByCourse.entries()) {
      if (validIds.length > 0) {
        await db
          .delete(unit)
          .where(
            and(
              eq(unit.courseId, courseId),
              notInArray(unit.id, validIds)
            )
          );
      }
    }

    lastSyncedAt = Date.now();
  } catch (err) {
    console.warn("seedContentFromFilesystem error:", err);
  } finally {
    // nothing to clean up; seedPromise is reset by startSeedTask()
  }
}

/**
 * Awaitable variant of seedContentFromFilesystem.
 *
 * seedContentFromFilesystem deliberately never waits (page renders must not
 * block on it), which means a caller doing `await seedContentFromFilesystem()`
 * gets control back before any row is written. Anything that subsequently
 * writes rows referencing course/unit (user_unit_library.unitId has an FK to
 * unit.id) must use this instead, or the insert fails with a foreign-key
 * violation.
 */
export async function ensureContentSeeded(): Promise<void> {
  if (!(await isDbAvailable())) return;
  await startSeedTask();
}

export async function seedContentFromFilesystem() {
  if (!(await isDbAvailable())) return;

  const now = Date.now();

  // Check if DB contains all filesystem courses and units
  try {
    const dbCourses = await db.select({ id: course.id }).from(course);
    const dbCourseIds = new Set(dbCourses.map((c) => c.id));
    const courses = getAllCourses();
    const hasMissingCourse = courses.some((c) => !dbCourseIds.has(c.id));

    const [unitCountRow] = await db.select({ count: count() }).from(unit);
    const totalDbUnits = Number(unitCountRow?.count ?? 0);
    const totalFsUnits = getAllUnits().length;
    const hasMissingUnits = totalDbUnits < totalFsUnits;

    if (!hasMissingCourse && !hasMissingUnits && lastSyncedAt > 0 && now - lastSyncedAt < SYNC_INTERVAL_MS) {
      return;
    }

    if (hasMissingCourse || hasMissingUnits) {
      lastSyncedAt = now;
      await startSeedTask();
      return;
    }
  } catch (err) {
    console.warn("seedContentFromFilesystem check error:", err);
    return;
  }

  // Routine background sync
  lastSyncedAt = now;
  void scheduleSeedTask();
}

/**
 * Run the seed *after* the response when we're inside a request (Next's
 * `after`), and fire-and-forget otherwise (scripts, background jobs).
 *
 * Starting it inline used to hand the sync half the request's CPU and DB
 * connections while the page was still waiting on its own queries.
 */
function scheduleSeedTask() {
  return runAfterResponse(() => startSeedTask());
}
