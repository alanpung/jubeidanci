import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";

/**
 * Owner-only database diagnostics.
 *
 * Reports which schema the app's tables actually resolve to, what foreign
 * keys exist on `student_access`, and how many rows each relevant table
 * holds. Used to diagnose grant/permission problems without shell access to
 * the production database.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const [ctx] = await db.execute<{
      current_schema: string;
      search_path: string;
      db_version: string;
    }>(sql`
      SELECT current_schema() AS current_schema,
             current_setting('search_path') AS search_path,
             version() AS db_version
    `);

    const tables = await db.execute<{
      table_schema: string;
      table_name: string;
      table_type: string;
    }>(sql`
      SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_name IN ('user', 'course', 'unit', 'student_access')
      ORDER BY table_name, table_schema
    `);

    const constraints = await db.execute<{
      conname: string;
      condef: string;
    }>(sql`
      SELECT con.conname AS conname, pg_get_constraintdef(con.oid) AS condef
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'student_access' AND nsp.nspname = current_schema()
      ORDER BY con.conname
    `);

    const counts = await db.execute<{
      users: number;
      courses: number;
      units: number;
      grants: number;
    }>(sql`
      SELECT
        (SELECT count(*) FROM "user")::int AS users,
        (SELECT count(*) FROM course)::int AS courses,
        (SELECT count(*) FROM unit)::int AS units,
        (SELECT count(*) FROM student_access)::int AS grants
    `);

    return NextResponse.json({
      ok: true,
      context: ctx,
      tables,
      constraints,
      counts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
