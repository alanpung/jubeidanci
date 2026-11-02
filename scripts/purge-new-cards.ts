/**
 * Purge the deck's legacy `status='new'` rows.
 *
 * New is no longer a stored state — it is DERIVED from the learner's library
 * (the course catalog, plus the words they have already practised) as
 * All − Mastered − Learning. Every row still sitting at status='new' is a
 * leftover from the old seeding, which wrote one row per library word.
 *
 * Two kinds of row, because "new" was also the column default:
 *   - UNPRACTISED (repetitions = 0 AND last_reviewed_at IS NULL) → DELETE.
 *     The learner never studied the word; the derived New set still offers it.
 *   - PRACTISED (repetitions > 0 OR a review timestamp) → moved to "learning",
 *     never deleted, so real progress is not destroyed.
 *
 * The local JSON mirror (data/srs-cards.json) is purged with the same rules,
 * otherwise getAllCards' merge re-appends cards that only ever existed locally.
 *
 * Usage:
 *   npx tsx scripts/purge-new-cards.ts                 # dry-run, nothing written
 *   npx tsx scripts/purge-new-cards.ts --apply         # actually purge
 *   npx tsx scripts/purge-new-cards.ts --apply --skip-db    # local JSON only
 *   npx tsx scripts/purge-new-cards.ts --apply --skip-local # Postgres only
 *
 * DATABASE_URL is only needed for the Postgres pass; without it the script
 * still reports and (with --apply) purges the local JSON store.
 */
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const skipDb = process.argv.includes("--skip-db");
const skipLocal = process.argv.includes("--skip-local");

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

async function main() {
  let dbDeleted = 0;
  let dbConverted = 0;

  if (!skipDb) {
    if (!url) {
      console.log("ℹ️  No DATABASE_URL — skipping the Postgres pass (--skip-db).");
    } else {
      const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

      const [totals] = await sql<
        { total: number; unpractised: number; practised: number }[]
      >`
        SELECT
          COUNT(*)::int AS total,
          COUNT(CASE WHEN "repetitions" = 0 AND "last_reviewed_at" IS NULL THEN 1 END)::int AS unpractised,
          COUNT(CASE WHEN "repetitions" > 0 OR "last_reviewed_at" IS NOT NULL THEN 1 END)::int AS practised
        FROM "srs_card"
        WHERE "status" = 'new'
      `;

      console.log(`\nPostgres — stored 'new' rows: ${totals.total}`);
      console.log(`  unpractised (will be deleted):        ${totals.unpractised}`);
      console.log(`  practised   (will move to learning):  ${totals.practised}`);

      if (!apply) {
        console.log("\n🔍 DRY-RUN — nothing written. Re-run with --apply to purge.");
        printDashboardSql();
      } else if (totals.total === 0) {
        console.log("\nNothing to purge — the deck already stores no 'new' rows.");
      } else {
        const converted = await sql`
          UPDATE "srs_card"
          SET "status" = 'learning',
              "next_review_at" = COALESCE("next_review_at", NOW())
          WHERE "status" = 'new'
            AND ("repetitions" > 0 OR "last_reviewed_at" IS NOT NULL)
        `;
        const deleted = await sql`
          DELETE FROM "srs_card"
          WHERE "status" = 'new'
            AND "repetitions" = 0
            AND "last_reviewed_at" IS NULL
        `;
        dbConverted = Number(converted.count ?? 0);
        dbDeleted = Number(deleted.count ?? 0);
        console.log(`\n✅ deleted ${dbDeleted} unpractised row(s), moved ${dbConverted} practised row(s) to learning.`);
      }

      await sql.end();
    }
  }

  if (!skipLocal) {
    const { purgeAllLocalNewCards } = await import("../lib/srs-store");
    const { getLocalCards } = await import("../lib/srs-store");

    const cards = await getLocalCards();
    const pending = cards.filter((c) => c.status === "new");
    const practisedCount = pending.filter(
      (c) => (c.repetitions ?? 0) > 0 || Boolean(c.lastReviewedAt),
    ).length;
    console.log(`\nLocal JSON — stored 'new' rows: ${pending.length}`);
    console.log(`  unpractised (will be deleted):        ${pending.length - practisedCount}`);
    console.log(`  practised   (will move to learning):  ${practisedCount}`);

    if (!apply) {
      console.log("🔍 DRY-RUN — nothing written to data/srs-cards.json.");
    } else {
      const res = await purgeAllLocalNewCards();
      console.log(
        `✅ deleted ${res.deleted} unpractised row(s), moved ${res.converted} practised row(s) to learning.`,
      );
    }
  }

  if (!apply) {
    console.log("\nRe-run with --apply to execute everything above.");
  }
}

function printDashboardSql() {
  console.log(`
────────────────────────────────────────────────────────────
Equivalent SQL (paste into the Supabase SQL editor):

-- 1) Preview
SELECT COUNT(*)::int AS total,
       COUNT(CASE WHEN "repetitions" = 0 AND "last_reviewed_at" IS NULL THEN 1 END)::int AS unpractised,
       COUNT(CASE WHEN "repetitions" > 0 OR "last_reviewed_at" IS NOT NULL THEN 1 END)::int AS practised
FROM "srs_card"
WHERE "status" = 'new';

-- 2) Purge
UPDATE "srs_card"
SET "status" = 'learning',
    "next_review_at" = COALESCE("next_review_at", NOW())
WHERE "status" = 'new'
  AND ("repetitions" > 0 OR "last_reviewed_at" IS NOT NULL);

DELETE FROM "srs_card"
WHERE "status" = 'new'
  AND "repetitions" = 0
  AND "last_reviewed_at" IS NULL;

-- 3) Verify (must be 0)
SELECT COUNT(*)::int FROM "srs_card" WHERE "status" = 'new';
────────────────────────────────────────────────────────────
`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
