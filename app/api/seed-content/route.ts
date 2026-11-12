import { NextResponse } from "next/server";
import { ensureContentSeeded } from "@/lib/db/seed-content";
import { isDbAvailable, db } from "@/lib/db";
import { unit } from "@/lib/db/schema";
import { isNull, eq, count, and, ne } from "drizzle-orm";
import { getAllCourses, getAllUnits } from "@/lib/content/registry";

export const dynamic = "force-dynamic";

/**
 * Force a content seed and report what actually landed in the database.
 *
 * The response deliberately separates "the filesystem knows about it" from
 * "the database has the row" — those two used to drift apart silently
 * (a newly committed `content/*.md` unit could sit on disk while the
 * "Standalone Units" folder stayed empty), and this endpoint makes the
 * difference visible in one request.
 */
export async function GET() {
  const dbUp = await isDbAvailable();
  if (!dbUp) {
    return NextResponse.json({
      success: false,
      error: "Database is not available",
      coursesInRegistry: getAllCourses().length,
      unitsInRegistry: getAllUnits().length,
    });
  }

  try {
    await ensureContentSeeded();

    const fsUnits = getAllUnits();
    const fsStandalone = fsUnits.filter((u) => !u.parsed.courseId);

    // How many standalone rows are actually in the DB, and how many of them
    // would the Library query return (courseId IS NULL and not hidden).
    const [standaloneRow] = await db
      .select({ count: count() })
      .from(unit)
      .where(isNull(unit.courseId));

    const [visibleRow] = await db
      .select({ count: count() })
      .from(unit)
      .where(
        and(isNull(unit.courseId), ne(unit.visibility, "hidden")),
      );

    const dbStandaloneIds = await db
      .select({ id: unit.id, title: unit.title, visibility: unit.visibility })
      .from(unit)
      .where(isNull(unit.courseId));

    return NextResponse.json({
      success: true,
      message: "Content seeded successfully",
      coursesInRegistry: getAllCourses().length,
      unitsInRegistry: fsUnits.length,
      standalone: {
        inFilesystem: fsStandalone.length,
        inDatabase: Number(standaloneRow?.count ?? 0),
        visibleInLibrary: Number(visibleRow?.count ?? 0),
        titles: dbStandaloneIds.map((r) => ({
          id: r.id,
          title: r.title,
          visibility: r.visibility,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}
