/**
 * Rename the "A1 Word Bank" course to "A1 Word Order".
 *
 * The course id changed from `a1-word-bank-course` to `a1-word-order-course`
 * and the five unit files now carry `courseId: "a1-word-order-course"`.
 * This script migrates the existing database rows so that:
 *
 *   - there is exactly ONE course titled "A1 Word Order" (no empty duplicate
 *     left behind under the old id);
 *   - learner progress (lesson completions, exercise attempts, "added to
 *     library" flags, course enrollment + "continue where I left off") is
 *     preserved rather than wiped.
 *
 * Progress is preserved by RENAMING rows instead of deleting and re-creating
 * them: `lesson_completion.unit_id` and `user_unit_library.unit_id` are
 * foreign keys onto `unit.id` with `onDelete: "cascade"`, so deleting the old
 * unit rows would silently destroy every learner's history for this course.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:...@db.xxx.supabase.co:5432/postgres" \
 *     npx tsx scripts/rename-word-bank-course.ts            # dry-run (no changes)
 *   ... npx tsx scripts/rename-word-bank-course.ts --apply    # actually migrate
 *
 * The equivalent Supabase dashboard SQL is printed at the bottom of a dry-run
 * so you can also run it directly in
 * https://supabase.com/dashboard/project/<project>/editor
 */
import postgres from "postgres";

const OLD_COURSE_ID = "a1-word-bank-course";
const NEW_COURSE_ID = "a1-word-order-course";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is required (Supabase connection string).");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

interface CourseRow {
  id: string;
  title: string | null;
}

interface UnitRow {
  id: string;
  courseId: string | null;
  title: string | null;
}

interface CountRow {
  n: number;
}

async function main() {
  // ── Preview ────────────────────────────────────────────────────────────
  const courses = await sql<CourseRow[]>`
    SELECT id, title FROM course
    WHERE id IN (${OLD_COURSE_ID}, ${NEW_COURSE_ID})
    ORDER BY id
  `;

  const units = await sql<UnitRow[]>`
    SELECT id, "course_id" AS "courseId", title FROM unit
    WHERE "course_id" = ${OLD_COURSE_ID} OR id LIKE ${`${OLD_COURSE_ID}-%`}
    ORDER BY id
  `;

  // Units whose id does not start with "<courseId>-" were created by hand in
  // the UI (they get a UUID), so they must not be deleted.
  const fsUnits = units.filter((u) => u.id.startsWith(`${OLD_COURSE_ID}-`));
  const handMadeUnits = units.filter((u) => !u.id.startsWith(`${OLD_COURSE_ID}-`));

  const [enrollments] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM user_course_enrollment
    WHERE "course_id" = ${OLD_COURSE_ID}
  `;
  const [libraryRows] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM user_unit_library
    WHERE "unit_id" LIKE ${`${OLD_COURSE_ID}-%`}
  `;
  const [completionRows] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM lesson_completion
    WHERE "unit_id" LIKE ${`${OLD_COURSE_ID}-%`}
  `;

  console.log(`\n=== Courses matching the rename ===`);
  if (courses.length === 0) {
    console.log("  (none — the migration may already have been applied)");
  }
  for (const c of courses) {
    console.log(`  ${c.id}  |  ${c.title ?? "(no title)"}`);
  }

  console.log(`\n=== Units under "${OLD_COURSE_ID}" ===`);
  if (units.length === 0) {
    console.log("  (none)");
  }
  for (const u of units) {
    const kind = u.id.startsWith(`${OLD_COURSE_ID}-`) ? "filesystem" : "hand-made";
    console.log(`  [${kind}] ${u.id}  |  ${(u.title ?? "").slice(0, 50)}`);
  }

  console.log(`\n=== Learner data that will be preserved ===`);
  console.log(`  course enrollments : ${enrollments.n}`);
  console.log(`  library entries    : ${libraryRows.n}`);
  console.log(`  lesson completions : ${completionRows.n}`);

  if (handMadeUnits.length > 0) {
    console.log(
      `\n⚠️  ${handMadeUnits.length} hand-made unit(s) will be re-pointed at the new course id (not deleted).`,
    );
  }

  if (!apply) {
    console.log("\n🔍 DRY-RUN — no rows changed. Re-run with --apply to execute.");
    printDashboardSql();
    await sql.end();
    return;
  }

  // ── Migrate ────────────────────────────────────────────────────────────
  // Order matters:
  //   1. rename the unit ids (they are the PK referenced by progress tables)
  //   2. re-point every remaining unit (incl. hand-made ones) at the new course
  //   3. rename the course row (PK)
  //   4. fix the enrollment rows that reference the old ids
  //
  // Step 1 must run before step 2, otherwise the "hand-made" filter would
  // still see the renamed filesystem units as belonging to the old course.

  console.log("\n→ Renaming unit ids…");
  const renamed = await sql`
    UPDATE unit
    SET id = replace(id, ${OLD_COURSE_ID}, ${NEW_COURSE_ID})
    WHERE id LIKE ${`${OLD_COURSE_ID}-%`}
  `;
  console.log(`  updated ${Number(renamed.count ?? 0)} unit row(s)`);

  console.log("→ Re-pointing remaining units at the new course id…");
  const repointed = await sql`
    UPDATE unit
    SET "course_id" = ${NEW_COURSE_ID}
    WHERE "course_id" = ${OLD_COURSE_ID}
  `;
  console.log(`  updated ${Number(repointed.count ?? 0)} unit row(s)`);

  console.log("→ Renaming the course row…");
  const courseRenamed = await sql`
    UPDATE course
    SET id = ${NEW_COURSE_ID}, title = 'A1 Word Order', "updated_at" = now()
    WHERE id = ${OLD_COURSE_ID}
  `;
  console.log(`  updated ${Number(courseRenamed.count ?? 0)} course row(s)`);

  console.log("→ Fixing enrollments…");
  const enrollUpdated = await sql`
    UPDATE user_course_enrollment
    SET "course_id" = ${NEW_COURSE_ID}
    WHERE "course_id" = ${OLD_COURSE_ID}
  `;
  const currentUpdated = await sql`
    UPDATE user_course_enrollment
    SET "current_unit_id" = replace("current_unit_id", ${OLD_COURSE_ID}, ${NEW_COURSE_ID})
    WHERE "current_unit_id" LIKE ${`${OLD_COURSE_ID}-%`}
  `;
  console.log(
    `  updated ${Number(enrollUpdated.count ?? 0)} enrollment row(s), ` +
      `${Number(currentUpdated.count ?? 0)} "continue learning" pointer(s)`,
  );

  // ── Verify ─────────────────────────────────────────────────────────────
  const [after] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM course
    WHERE id IN (${OLD_COURSE_ID}, ${NEW_COURSE_ID})
  `;
  const [afterUnits] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM unit WHERE "course_id" = ${NEW_COURSE_ID}
  `;
  const [afterOldUnits] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM unit WHERE "course_id" = ${OLD_COURSE_ID}
  `;
  const [afterCompletions] = await sql<CountRow[]>`
    SELECT count(*)::int AS n FROM lesson_completion
    WHERE "unit_id" LIKE ${`${NEW_COURSE_ID}-%`}
  `;

  console.log("\n=== Verification ===");
  console.log(`  courses named old-or-new id : ${after.n}   (expected 1)`);
  console.log(`  units under new course id    : ${afterUnits.n}`);
  console.log(`  units still under old id     : ${afterOldUnits.n}   (expected 0)`);
  console.log(`  lesson completions preserved : ${afterCompletions.n}   (was ${completionRows.n})`);

  console.log("\n✅ Migration complete.");
  await sql.end();
}

function printDashboardSql() {
  console.log(`
────────────────────────────────────────────────────────────
Equivalent Supabase SQL editor query (https://supabase.com/dashboard/project/<project>/editor):

-- 1) Preview what will change
SELECT id, title FROM course
WHERE id IN ('${OLD_COURSE_ID}', '${NEW_COURSE_ID}');

SELECT id, "course_id", title FROM unit
WHERE "course_id" = '${OLD_COURSE_ID}' OR id LIKE '${OLD_COURSE_ID}-%';

-- 2) Rename the unit ids (preserves lesson_completion / user_unit_library)
UPDATE unit
SET id = replace(id, '${OLD_COURSE_ID}', '${NEW_COURSE_ID}')
WHERE id LIKE '${OLD_COURSE_ID}-%';

-- 3) Re-point any hand-made units at the new course
UPDATE unit
SET "course_id" = '${NEW_COURSE_ID}'
WHERE "course_id" = '${OLD_COURSE_ID}';

-- 4) Rename the course row
UPDATE course
SET id = '${NEW_COURSE_ID}', title = 'A1 Word Order', "updated_at" = now()
WHERE id = '${OLD_COURSE_ID}';

-- 5) Fix enrollments
UPDATE user_course_enrollment
SET "course_id" = '${NEW_COURSE_ID}'
WHERE "course_id" = '${OLD_COURSE_ID}';

UPDATE user_course_enrollment
SET "current_unit_id" = replace("current_unit_id", '${OLD_COURSE_ID}', '${NEW_COURSE_ID}')
WHERE "current_unit_id" LIKE '${OLD_COURSE_ID}-%';

-- 6) Verify
SELECT id, title FROM course WHERE id LIKE '%word-order%' OR id LIKE '%word-bank%';
SELECT id, "course_id", title FROM unit WHERE "course_id" LIKE '%word-order%';
────────────────────────────────────────────────────────────
`);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
