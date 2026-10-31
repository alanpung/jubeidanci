/**
 * Delete 7 of the 8 standalone units, keeping 1 as the reference example.
 *
 * Standalone units = rows in `unit` where `courseId IS NULL`.
 * The script previews them, keeps 1 (configurable), and deletes the rest.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:...@db.olspnhbfvqhqrwpcdcgk.supabase.co:5432/postgres" \
 *     npx tsx scripts/delete-standalone-units.ts            # dry-run (no changes)
 *   ... npx tsx scripts/delete-standalone-units.ts --apply   # actually delete
 *
 * Which one to keep:
 *   - Default: keep the OLDEST standalone unit (createdAt ASC, LIMIT 1).
 *   - Override: set KEEP_UNIT_IDS="id1,id2" to keep specific ids (comma-separated).
 *
 * The matching Supabase dashboard SQL is printed at the bottom of a dry-run so you
 * can also run it directly in https://supabase.com/dashboard/project/olspnhbfvqhqrwpcdcgk/editor
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is required (Supabase connection string).");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const keepIds = (process.env.KEEP_UNIT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

async function main() {
  // NOTE: raw postgres.js SQL uses the *actual* DB column names (snake_case),
  // not the Drizzle field names. unit.course_id / unit.created_at.
  const rows = await sql<{ id: string; title: string | null; createdAt: Date | null }[]>`
    SELECT id, title, "created_at" AS "createdAt"
    FROM unit
    WHERE "course_id" IS NULL
    ORDER BY "created_at" ASC
  `;

  console.log(`\nFound ${rows.length} standalone units (course_id IS NULL):`);
  rows.forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.id}  |  ${(r.title ?? "").slice(0, 40)}  |  ${r.createdAt ?? "n/a"}`)
  );

  const keep = keepIds.length ? keepIds : rows.length ? [rows[0].id] : [];
  const toDelete = rows.filter((r) => !keep.includes(r.id)).map((r) => r.id);

  console.log(`\nKeep:   ${keep.join(", ") || "(none)"}
Delete: ${toDelete.length ? toDelete.join(", ") : "(none)"}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN — no rows deleted. Re-run with --apply to execute.");
    printDashboardSql(keep, toDelete);
    await sql.end();
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNothing to delete.");
    await sql.end();
    return;
  }

  let deleted = 0;
  for (const id of toDelete) {
    await sql`DELETE FROM "userUnitLibrary" WHERE "unitId" = ${id}`;
    const res = await sql`DELETE FROM unit WHERE id = ${id}`;
    deleted += Number(res.count ?? 0);
    console.log(`  ✅ deleted ${id}`);
  }
  console.log(`\nDeleted ${deleted} standalone unit(s). Kept ${keep.join(", ")} as the example.`);
  await sql.end();
}

function printDashboardSql(keep: string[], toDelete: string[]) {
  const keepList = keep.length ? keep.map((id) => `'${id}'`).join(", ") : `'<PASTE_THE_ID_YOU_WANT_TO_KEEP>'`;
  console.log(`
────────────────────────────────────────────────────────────
Equivalent Supabase SQL editor query (https://supabase.com/dashboard/project/olspnhbfvqhqrwpcdcgk/editor):

-- 1) Preview the standalone units
SELECT id, title, "created_at"
FROM unit
WHERE "course_id" IS NULL
ORDER BY "created_at" ASC;

-- 2) Delete all but the kept one(s)
DELETE FROM "user_unit_library"
WHERE "unit_id" IN (
  SELECT id FROM unit WHERE "course_id" IS NULL AND id NOT IN (${keepList})
);

DELETE FROM unit
WHERE "course_id" IS NULL
  AND id NOT IN (${keepList});
────────────────────────────────────────────────────────────
`);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
