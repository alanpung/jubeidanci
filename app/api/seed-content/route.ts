import { NextResponse } from "next/server";
import { ensureContentSeeded } from "@/lib/db/seed-content";
import { isDbAvailable } from "@/lib/db";
import { getAllCourses, getAllUnits } from "@/lib/content/registry";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({
      success: true,
      message: "Content seeded successfully",
      coursesInRegistry: getAllCourses().length,
      unitsInRegistry: getAllUnits().length,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
