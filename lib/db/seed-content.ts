import { db, isDbAvailable } from "./index";
import { course, unit, user } from "./schema";
import { getAllCourses, getAllUnits } from "../content/registry";
import { eq, or, ilike, and, notInArray, inArray, sql } from "drizzle-orm";

let isSeeding = false;
let lastSyncedAt = 0;

async function runSeedTask() {
  if (isSeeding) return;
  isSeeding = true;

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
            title: sql`excluded.title`,
            sourceLanguage: sql`excluded.source_language`,
            targetLanguage: sql`excluded.target_language`,
            level: sql`excluded.level`,
            visibility: "public",
            published: true,
            createdBy: creatorId,
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

    // Insert units in chunks of 20
    for (let i = 0; i < unitValues.length; i += 20) {
      const chunk = unitValues.slice(i, i + 20);
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
            visibility: "public",
            createdBy: creatorId,
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
    isSeeding = false;
  }
}

export async function seedContentFromFilesystem() {
  if (!(await isDbAvailable())) return;

  const now = Date.now();
  // Throttle background syncs to max once every 5 minutes
  if (lastSyncedAt > 0 && now - lastSyncedAt < 300000) return;

  if (lastSyncedAt > 0) {
    // Already seeded before: run sync in background without delaying request
    void runSeedTask();
    return;
  }

  // Check if DB already contains courses
  try {
    const existing = await db.select({ id: course.id }).from(course).limit(1);
    if (existing.length > 0) {
      lastSyncedAt = now;
      void runSeedTask();
      return;
    }
  } catch (err) {
    console.warn("seedContentFromFilesystem check error:", err);
    return;
  }

  // Initial sync in background so page rendering is never blocked
  lastSyncedAt = now;
  void runSeedTask();
}
