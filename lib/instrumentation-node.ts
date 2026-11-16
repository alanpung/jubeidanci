import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { db } from "./db";

const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

export async function registerNodeInstrumentation() {
  const rawConnectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!rawConnectionString) return;

  try {
    await fastForwardMigrations();
  } catch (err) {
    console.warn("[instrumentation] migration bookkeeping reconcile skipped:", err);
  }

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

  try {
    const { loadContentDir } = await import("./content/loader");
    loadContentDir();
  } catch (err) {
    console.warn("[instrumentation] content pre-warm skipped:", err);
  }

  try {
    const { seedContentFromFilesystem } = await import("./db/seed-content");
    void seedContentFromFilesystem().catch((err) =>
      console.warn("[instrumentation] background seed skipped:", err),
    );
  } catch (err) {
    console.warn("[instrumentation] background seed load skipped:", err);
  }
}

async function fastForwardMigrations(forceAll = false) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const crypto = await import("node:crypto");

  const journalPath = path.join(process.cwd(), "drizzle", "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return;

  let journal: { entries?: { when: number; tag: string }[] };
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  } catch {
    return;
  }
  const entries = journal.entries ?? [];
  if (entries.length === 0) return;

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
  if (existingCount > 0 && !forceAll) return;

  const baselineRows = (await db.execute(
    sql.raw(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'account' LIMIT 1`,
    ),
  )) as unknown as unknown[];
  const baselineExists =
    Array.isArray(baselineRows) && baselineRows.length > 0;

  if (!baselineExists && !forceAll) return;

  for (const entry of entries) {
    const sqlPath = path.join(process.cwd(), "drizzle", `${entry.tag}.sql`);
    let hash = "";
    try {
      const query = fs.readFileSync(sqlPath).toString();
      hash = crypto.createHash("sha256").update(query).digest("hex");
    } catch {
      hash = "0".repeat(64);
    }
    await db.execute(
      sql.raw(
        `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES ('${hash}', ${Number(entry.when)}) ON CONFLICT DO NOTHING`,
      ),
    );
  }
}
