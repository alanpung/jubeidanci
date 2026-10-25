import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./lib/db";

/**
 * Next.js instrumentation hook.
 *
 * Runs once when the Node.js server runtime boots. We use it to apply any
 * pending Drizzle migrations so the database schema is always in sync with the
 * code — including tables added after a deployment (e.g. `student_access`).
 * This removes the need to remember to run `drizzle-kit migrate` by hand after
 * every schema change.
 *
 * Migrations are idempotent (tracked in the `_drizzle_migrations` table), so a
 * no-op on warm instances and safe under concurrent cold starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const rawConnectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!rawConnectionString) return;

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (err) {
    // Never let a migration hiccup take the whole app down; log and continue.
    console.error("[instrumentation] database migration failed:", err);
  }
}
