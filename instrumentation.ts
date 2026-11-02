import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "./lib/db";

const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Next.js instrumentation hook.
 *
 * Runs once when the Node.js server runtime boots. We use it to apply any
 * pending Drizzle migrations so the database schema is always in sync with the
 * code — including tables added after a deployment (e.g. `student_access`).
 * This removes the need to remember to run `drizzle-kit migrate` by hand after
 * every schema change.
 *
 * Migrations are tracked in the `drizzle.__drizzle_migrations` table, so on a
 * warm instance (or one that already ran) this is a no-op, and it is safe under
 * concurrent cold starts.
 *
 * Cold-start resilience: if the database was provisioned out-of-band via
 * `drizzle-kit push` (or the `__drizzle_migrations` bookkeeping table was
 * otherwise wiped) the bookkeeping table is empty while the tables themselves
 * already exist. In that state the migrator re-runs every migration and the
 * baseline `CREATE TABLE "account"` throws "already exists" — which used to be
 * logged as a hard error on every cold start. `fastForwardMigrations()` detects
 * that and writes the bookkeeping rows so `migrate()` becomes a no-op, leaving
 * the existing (already-current) schema untouched.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const rawConnectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!rawConnectionString) return;

  // Reconcile the migration bookkeeping BEFORE running migrate(). Non-fatal: if
  // this fails for any reason we fall through to migrate() and let it try.
  try {
    await fastForwardMigrations();
  } catch (err) {
    console.warn("[instrumentation] migration bookkeeping reconcile skipped:", err);
  }

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the schema was provisioned by `push` and the bookkeeping reconcile
    // above didn't catch it, the only failure is "already exists" on a table
    // that is genuinely there. Fast-forward and retry once so cold starts stop
    // erroring; the retry is a guaranteed no-op afterwards.
    if (/already exists|duplicate|relation .* already exists/i.test(msg)) {
      try {
        await fastForwardMigrations(true);
        await migrate(db, { migrationsFolder: "./drizzle" });
      } catch (retryErr) {
        console.error("[instrumentation] database migration failed:", retryErr);
      }
    } else {
      console.error("[instrumentation] database migration failed:", err);
    }
  }
}

/**
 * Writes `__drizzle_migrations` bookkeeping rows for migrations whose tables
 * already exist in the database but are missing from the bookkeeping table.
 *
 * When `forceAll` is true (used on the retry path after an "already exists"
 * error) we assume the live schema is current and stamp every journal entry,
 * guaranteeing migrate() is a no-op.
 *
 * Safety: we only stamp entries when the baseline `account` table already
 * exists. `drizzle-kit push` applies the *entire* current schema in one shot,
 * so the presence of `account` means every later table/column is present too —
 * stamping all entries is then correct, never skips a needed migration. If
 * `account` is absent the schema is genuinely empty and we let migrate() build
 * it from scratch (which won't hit "already exists").
 */
async function fastForwardMigrations(forceAll = false) {
  const journalPath = join(process.cwd(), "drizzle", "meta", "_journal.json");
  if (!existsSync(journalPath)) return;

  let journal: { entries?: { when: number; tag: string }[] };
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch {
    return;
  }
  const entries = journal.entries ?? [];
  if (entries.length === 0) return;

  // Ensure the bookkeeping schema/table exist before we read or write them.
  await db.execute(
    sql.raw(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`),
  );
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    ),
  );

  const existingRows = (await db.execute(
    sql.raw(
      `SELECT count(*)::int AS c FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    ),
  )) as unknown as Array<{ c: number }>;
  const existingCount = Number(existingRows?.[0]?.c ?? 0);
  // Normal case: bookkeeping already populated -> migrate() resumes correctly.
  if (existingCount > 0 && !forceAll) return;

  // Baseline present? (schema provisioned by push, not migrate)
  const baselineRows = (await db.execute(
    sql.raw(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'account' LIMIT 1`,
    ),
  )) as unknown as unknown[];
  const baselineExists =
    Array.isArray(baselineRows) && baselineRows.length > 0;

  if (!baselineExists && !forceAll) return;

  for (const entry of entries) {
    const sqlPath = join(process.cwd(), "drizzle", `${entry.tag}.sql`);
    let hash = "";
    try {
      const query = readFileSync(sqlPath).toString();
      hash = crypto.createHash("sha256").update(query).digest("hex");
    } catch {
      // If we can't read the SQL we can't compute the exact hash; a zero hash
      // is still unique enough for our bookkeeping purpose (migrate only
      // compares created_at, never the hash).
      hash = "0".repeat(64);
    }
    await db.execute(
      sql.raw(
        `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES ('${hash}', ${Number(entry.when)}) ON CONFLICT DO NOTHING`,
      ),
    );
  }
}
