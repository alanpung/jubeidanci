import { dbBackground, isDbAvailable } from "./index";
import { course, unit, user } from "./schema";
import { getAllCourses, getAllUnits, invalidateAllCaches } from "../content/registry";
import { eq, or, ilike, and, notInArray, like, notLike, sql, count, inArray, isNull } from "drizzle-orm";
import { runAfterResponse } from "../after-response";
import type { ParsedUnit } from "../content/types";

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

/**
 * Replicate the DB id `runSeedTask` assigns to a filesystem unit so the
 * missing-units check can test for its existence by id. Must stay in lockstep
 * with the two upsert loops in `runSeedTask`.
 */
function deriveUnitDbId(p: ParsedUnit): string {
  if (p.courseId) {
    const match = p.title.match(/Unit\s+(\d+)/i);
    const unitNum = match ? parseInt(match[1], 10) : null;
    return unitNum
      ? `${p.courseId}-unit-${unitNum}`
      : `${p.courseId}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }
  return p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function runSeedTask() {
  try {
    // 1. Ensure Alan's user name is "Alan P"
    let alanUser = await dbBackground.query.user.findFirst({
      where: ilike(user.email, "alan.pung@gmail.com"),
    });

    if (!alanUser) {
      alanUser = await dbBackground.query.user.findFirst({
        where: ilike(user.name, "%alan%"),
      });
    }

    if (alanUser && alanUser.name !== "Alan P") {
      await dbBackground.update(user).set({ name: "Alan P" }).where(eq(user.id, alanUser.id));
    }

    const creatorId = alanUser ? alanUser.id : null;

    // 2. Load filesystem content.
    //
    // Force a FRESH scan of the content directory before reading the catalog.
    // `loadContentDir()` keeps a 24h cache, so without this a warm server
    // that picked up newly committed `content/*.md` units via a `git pull`
    // (without a full restart) would keep returning the stale file list — and
    // the seeder would never discover the new units. Clearing here is cheap:
    // it only happens inside an actual seed run, which is gated by the
    // missing-units / routine-sync checks below.
    invalidateAllCaches();
    const courses = getAllCourses();
    const units = getAllUnits();

    // Course markdown is the source of truth for the visibility of NEW rows.
    // Unit markdown has no visibility field, so a new unit inherits its parent
    // course's value. Existing rows keep whatever the owner chose — see the
    // onConflictDoUpdate note below.
    const courseVisibility = new Map(
      courses.map((c) => [c.id, c.visibility ?? "public"] as const),
    );

    // 3. Batch upsert all filesystem courses with Alan P (creatorId) as author
    if (courses.length > 0) {
      const courseValues = courses.map((c) => ({
        id: c.id,
        title: c.title,
        sourceLanguage: c.sourceLanguage,
        targetLanguage: c.targetLanguage,
        level: c.level,
        visibility: c.visibility ?? "public",
        published: true,
        createdBy: creatorId,
      }));

      await dbBackground
        .insert(course)
        .values(courseValues)
        .onConflictDoUpdate({
          target: course.id,
          set: {
            // The filesystem is only the source of truth for rows that do not
            // exist yet. Once a course is in the DB its title belongs to the
            // owner (edit title); the public/private visibility the owner chose
            // must never be clobbered by a re-seed. We therefore leave
            // `visibility` out of this update entirely: new rows get the
            // markdown-declared value from the insert `values` above, and
            // existing rows keep whatever the owner set (a private course
            // stored as NULL stays private). Rows created before visibility
            // was wired through the parser are fixed by the one-off backfill
            // in drizzle/0012_vip_courses.sql.
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

      // Migration: rename the "A1 Essay/Writing" course id from
      // "a1-essay-course" to "a1-writing-course" to match its filesystem id.
      // The filesystem units now carry the new courseId, so the old course
      // row and its old-id units would otherwise survive as a duplicate,
      // empty course in the library. Mirror the a1-word-bank ->
      // a1-word-order migration below:
      //   - re-point any hand-created units (UUID id, not derived from the
      //     course id) at the new course id so they survive the rename;
      //   - delete the old-id filesystem units (they are recreated with the
      //     new id by the upsert loops above);
      //   - drop the stale old course row.
      // The new course row is INSERTED (not updated) by the upsert above, so
      // its title already comes from the front-matter ("A1 writing course")
      // and needs no separate migration. Runs once: after the first run the
      // old id is gone, so every branch below is a no-op on later seeds.
      const oldEssayCourseId = "a1-essay-course";
      const newEssayCourseId = "a1-writing-course";

      await dbBackground
        .update(unit)
        .set({ courseId: newEssayCourseId })
        .where(
          and(
            eq(unit.courseId, oldEssayCourseId),
            notLike(unit.id, `${oldEssayCourseId}-%`),
          ),
        );

      await dbBackground
        .delete(unit)
        .where(eq(unit.courseId, oldEssayCourseId));

      await dbBackground
        .delete(course)
        .where(eq(course.id, oldEssayCourseId));

      // The "A1 Word Bank" course was renamed to "A1 Word Order" and its id
      // changed from "a1-word-bank-course" to "a1-word-order-course". The
      // filesystem units now carry the new courseId, so the old course row
      // would survive as a second, empty course with the same title ("A1 Word
      // Order") — the library would then show the course twice.
      //
      // Remove the stale row. Only units that still belong to the old course
      // id and were derived from the filesystem (id starts with the course id)
      // are deleted; units the owner created by hand have a UUID id and are
      // re-pointed at the new course id so they survive the rename.
      const staleCourseId = "a1-word-bank-course";
      const newCourseId = "a1-word-order-course";

      await dbBackground
        .update(unit)
        .set({ courseId: newCourseId })
        .where(
          and(
            eq(unit.courseId, staleCourseId),
            notLike(unit.id, `${staleCourseId}-%`)
          )
        );

      await dbBackground
        .delete(unit)
        .where(eq(unit.courseId, staleCourseId));

      await dbBackground
        .delete(course)
        .where(eq(course.id, staleCourseId));
    }

    // 4. Delete unwanted German / test courses and units
    await dbBackground
      .delete(unit)
      .where(
        or(
          ilike(unit.targetLanguage, "de"),
          ilike(unit.title, "%German%"),
          ilike(unit.title, "%Steve Jobs%"),
          ilike(unit.title, "%Testing Unit%"),
          ilike(unit.id, "%testing-%"),
          ilike(unit.id, "%steve-jobs-%"),
          ilike(unit.id, "%a1-matching-pairs-%")
        )
      );

    await dbBackground
      .delete(course)
      .where(
        or(
          ilike(course.targetLanguage, "de"),
          ilike(course.title, "%German%"),
          ilike(course.title, "%Steve Jobs%"),
          ilike(course.title, "%Testing%"),
          ilike(course.id, "%testing-%"),
          ilike(course.id, "%steve-jobs-%"),
          ilike(course.id, "%a1-matching-pairs-%")
        )
      );

    // 5. Track valid unit IDs for each course and batch upsert filesystem units
    const validUnitIdsByCourse = new Map<string, string[]>();
    const unitValues = [];
    const standaloneUnitValues = [];

    for (const u of units) {
      const p = u.parsed;
      if (!p.targetLanguage || !p.courseId) continue;

      // Use the SAME helper the missing-units check uses, so the id we look
      // for and the id we write can never drift apart.
      const unitId = deriveUnitDbId(p);

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
        visibility: courseVisibility.get(p.courseId) ?? "public",
        createdBy: creatorId,
      });
    }

    // 5b. Batch upsert standalone (courseId-null) filesystem units.
    //
    // The main loop above skips units without courseId. Standalone units need
    // their own upsert so they appear in getStandaloneUnits (courseId IS NULL)
    // and getBrowsableUnits (visibility='public').
    //
    // They are inserted in a SEPARATE pass, before the course-owned units, and
    // each chunk is isolated: the course-owned pass writes ~200 rows across
    // dozens of chunked INSERTs, and a single failure there used to abort
    // `runSeedTask` before the standalone rows (which were pushed last) were
    // ever written — leaving the whole "Standalone Units" folder empty with
    // nothing but a swallowed console warning to show for it.
    //
    // The ID must match the filesystem fallback formula used by
    // getStandaloneUnits and srs.ts: parseUnitMarkdown never sets parsed.id,
    // so the fallback is the title slug `title.toLowerCase().replace(...)`.
    // Using the same formula here keeps DB and filesystem IDs in sync for FK
    // integrity and SRS word sync.
    for (const u of units) {
      const p = u.parsed;
      if (!p.targetLanguage || p.courseId) continue; // only courseId-null units

      const standaloneUnitId = deriveUnitDbId(p);

      standaloneUnitValues.push({
        id: standaloneUnitId,
        courseId: null,
        title: p.title,
        description: p.description,
        icon: p.icon,
        color: p.color,
        markdown: u.markdown,
        targetLanguage: p.targetLanguage,
        sourceLanguage: p.sourceLanguage,
        level: p.level,
        // Hardcoded "public" in insert values only; NOT in onConflictDoUpdate
        // .set below, so an owner who later hides a unit keeps their choice.
        visibility: "public",
        createdBy: creatorId,
      });
    }

    // 5c. Upsert the standalone units FIRST, in their own isolated pass.
    //
    // Why first and separate: the course-owned pass below writes ~200 rows in
    // dozens of chunked INSERTs. Any one of those chunks failing used to abort
    // the whole `runSeedTask` — and because the standalone rows used to be
    // appended to the same array (i.e. written in the LAST chunks), they were
    // never written at all. The failure was swallowed by the outer try/catch,
    // so the "Standalone Units" folder simply stayed empty.
    //
    // Each chunk is now wrapped on its own: a bad row can no longer take the
    // rest of the catalog down with it.
    if (standaloneUnitValues.length > 0) {
      // Repair pass: a standalone unit may already exist in the DB under an id
      // that is NOT the canonical title slug — e.g. it was seeded by an older
      // id formula, or created by hand. Such a row is invisible to the
      // filesystem-id checks and would end up duplicated under the canonical
      // id. Re-point those rows at the canonical id instead, so the unit keeps
      // its history (lesson completions, SRS words, library entries) and the
      // folder shows exactly one tile per unit.
      try {
        const canonicalIds = standaloneUnitValues.map((v) => v.id);
        const legacyRows = await dbBackground
          .select({ id: unit.id, title: unit.title })
          .from(unit)
          .where(and(isNull(unit.courseId), notInArray(unit.id, canonicalIds)));

        for (const row of legacyRows) {
          const canonicalId = row.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
          if (!canonicalId || canonicalId === row.id) continue;
          if (canonicalIds.includes(canonicalId)) continue; // already have it

          const clash = await dbBackground
            .select({ id: unit.id })
            .from(unit)
            .where(eq(unit.id, canonicalId))
            .limit(1);
          if (clash.length > 0) continue; // canonical id taken — leave both

          await dbBackground
            .update(unit)
            .set({ id: canonicalId })
            .where(eq(unit.id, row.id));
        }
      } catch (err) {
        console.warn(
          "seedContentFromFilesystem: standalone id repair skipped:",
          err instanceof Error ? err.message : err,
        );
      }

      for (let i = 0; i < standaloneUnitValues.length; i += 5) {
        const chunk = standaloneUnitValues.slice(i, i + 5);
        try {
          await dbBackground
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
                // Same rule as courses: never reset a visibility the owner
                // chose. Leave `visibility` out of the update so a private
                // unit (NULL) survives every re-seed; new units are inserted
                // with "public".
                createdBy: sql`coalesce(${unit.createdBy}, excluded.created_by)`,
                updatedAt: new Date(),
              },
            });
        } catch (err) {
          console.warn(
            `seedContentFromFilesystem: standalone unit chunk ${i / 5} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    // Insert units in chunks of 5 to keep request payload safe.
    // Each chunk is isolated: one bad row must not abort the whole catalog
    // sync (that previously left the library half-populated with nothing but
    // a swallowed warning to show for it).
    for (let i = 0; i < unitValues.length; i += 5) {
      const chunk = unitValues.slice(i, i + 5);
      try {
        await dbBackground
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
              // survives every re-seed; new units inherit their parent course's
              // markdown visibility from values.
              createdBy: sql`coalesce(${unit.createdBy}, excluded.created_by)`,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.warn(
          `seedContentFromFilesystem: course unit chunk ${i / 5} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // 6. Strict cleanup of old/ghost units in DB for known courses.
    //
    // Only filesystem-derived units may be removed here. Units the owner
    // created by hand (their id is a UUID, not `<courseId>-...`) belong to
    // the course and must survive: deleting them would make "Add Unit" on the
    // course page silently revert on the next background sync.
    for (const [courseId, validIds] of validUnitIdsByCourse.entries()) {
      if (validIds.length > 0) {
        await dbBackground
          .delete(unit)
          .where(
            and(
              eq(unit.courseId, courseId),
              notInArray(unit.id, validIds),
              // Filesystem ids all start with the course id; a hand-made unit
              // never does.
              like(unit.id, `${courseId}-%`)
            )
          );
      }
    }

    // 6b. Migration cleanup: units that MOVED from standalone to a course keep
    // their old standalone row (courseId IS NULL, id = title slug) behind in the
    // "Standalone Units" folder, because the course cleanup above only touches
    // rows with the course id. The A1 Writing units did exactly this — they were
    // `unit-1-my-school`…`unit-10-my-friends` standalone and are now
    // `a1-writing-course-unit-N`. Drop any standalone row whose id is a unit's
    // legacy title-slug id but is NOT among the ids we just (re)wrote.
    const allCurrentIds = new Set([
      ...unitValues.map((v) => v.id),
      ...standaloneUnitValues.map((v) => v.id),
    ]);
    const legacyStandaloneIds: string[] = [];
    for (const u of units) {
      const legacyId = u.parsed.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      if (legacyId && !allCurrentIds.has(legacyId)) {
        legacyStandaloneIds.push(legacyId);
      }
    }
    if (legacyStandaloneIds.length > 0) {
      try {
        await dbBackground
          .delete(unit)
          .where(
            and(
              isNull(unit.courseId),
              inArray(unit.id, legacyStandaloneIds),
            ),
          );
      } catch (err) {
        console.warn(
          "seedContentFromFilesystem: legacy standalone cleanup skipped:",
          err instanceof Error ? err.message : err,
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

  // Check if DB contains all filesystem courses and units.
  //
  // The catalog read here is always fresh: `getAllUnits()` delegates to
  // `loadContentDir()`, which re-scans as soon as the content directory's
  // signature (file names + mtimes + sizes) changes. A warm instance that
  // picked up new `content/*.md` files therefore sees them on the very next
  // request, and the missing-units check below notices them immediately.
  try {
    const dbCourses = await dbBackground.select({ id: course.id }).from(course);
    const dbCourseIds = new Set(dbCourses.map((c) => c.id));
    const courses = getAllCourses();
    const hasMissingCourse = courses.some((c) => !dbCourseIds.has(c.id));

    // Detect missing *filesystem* units by their expected DB id, not by a raw
    // total count. The old check (`dbUnitCount < fsUnitCount`) was blind to new
    // units whenever the DB already held MORE units than the filesystem (e.g.
    // hand-made AI-tutor units with UUID ids) — the count comparison came out
    // false and newly committed units (like standalone a1-essay-* units) were
    // skipped until the 30-minute routine sync.
    const units = getAllUnits();
    const expectedUnitIds = units.map((u) => deriveUnitDbId(u.parsed));
    let hasMissingUnits = false;
    if (expectedUnitIds.length > 0) {
      const existingRows = await dbBackground
        .select({ id: unit.id })
        .from(unit)
        .where(inArray(unit.id, expectedUnitIds));
      const existingIds = new Set(existingRows.map((r) => r.id));
      hasMissingUnits = expectedUnitIds.some((id) => !existingIds.has(id));
    }

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
