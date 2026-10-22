import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Self-healing schema bootstrap for the `student_access` table.
 *
 * Background: relying on the Drizzle migrator (`instrumentation.ts`) to create
 * this table on Vercel has proven unreliable — the migration chain can no-op or
 * fail silently (schema/`_drizzle_migrations` quirks), leaving the table absent
 * so every grant write dies with `relation "student_access" does not exist`.
 *
 * Instead we create the table with idempotent DDL the first time any action
 * touches it. This is independent of the migration runner, runs in the same
 * `current_schema` the app queries (`public`), and is cached per process so it
 * only issues SQL once on a warm instance (and retries if it ever fails).
 */

let ensured: Promise<void> | null = null;

export function ensureStudentAccessTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "student_access" (
          "id" text PRIMARY KEY NOT NULL,
          "owner_id" text NOT NULL,
          "student_id" text NOT NULL,
          "course_id" text,
          "unit_id" text,
          "created_at" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "student_access_course_unique"
        ON "student_access" ("student_id", "course_id")
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "student_access_unit_unique"
        ON "student_access" ("student_id", "unit_id")
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "student_access_owner_idx"
        ON "student_access" ("owner_id")
      `);
    })().catch((err) => {
      // Allow a later call to retry instead of permanently caching the failure.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}
