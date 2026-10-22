import { NextResponse } from "next/server";
import { db, client, isDbAvailable } from "@/lib/db";
import { course, unit, user, userUnitLibrary, userCourseEnrollment, userPreferences } from "@/lib/db/schema";
import { eq, and, countDistinct, or } from "drizzle-orm";
import { withTimeout } from "@/lib/db/timeout";

export const dynamic = "force-dynamic";

const UID = "user_demo_123";

async function step<T>(name: string, fn: () => Promise<T>) {
  const s = Date.now();
  const r = await withTimeout<T | { timeout: true }>(
    name,
    fn(),
    7000,
    { timeout: true } as unknown as T,
  );
  return { name, ms: Date.now() - s, timeout: (r as { timeout?: boolean })?.timeout === true };
}

// TEMP DEBUG ROUTE — delete after diagnosing the /library hang.
export async function GET() {
  const out: unknown[] = [];

  out.push(
    await step("isDbAvailable", () => isDbAvailable()),
  );

  out.push(
    await step("raw SELECT 1", async () => {
      const r = await client`SELECT 1 as ok`;
      return r.length;
    }),
  );

  out.push(
    await step("course limit 5", () => db.select({ id: course.id }).from(course).limit(5)),
  );

  out.push(
    await step("unit limit 5 (no markdown)", () =>
      db.select({ id: unit.id, title: unit.title }).from(unit).limit(5),
    ),
  );

  out.push(
    await step("unit markdown limit 5", () =>
      db.select({ id: unit.id, markdown: unit.markdown }).from(unit).limit(5),
    ),
  );

  out.push(
    await step("listCourses main query", () =>
      db
        .select({
          id: course.id,
          title: course.title,
          creatorName: user.name,
          unitCount: countDistinct(unit.id),
        })
        .from(course)
        .leftJoin(unit, eq(unit.courseId, course.id))
        .leftJoin(user, eq(course.createdBy, user.id))
        .where(and(eq(course.published, true), or(eq(course.visibility, "public"), eq(course.createdBy, UID))!))
        .groupBy(course.id, course.title, course.sourceLanguage, course.targetLanguage, course.level, course.createdBy, course.visibility, user.name)
        .orderBy(course.title),
    ),
  );

  out.push(
    await step("userUnitLibrary by user", () =>
      db.select({ unitId: userUnitLibrary.unitId }).from(userUnitLibrary).where(eq(userUnitLibrary.userId, UID)),
    ),
  );

  out.push(
    await step("userCourseEnrollment by user", () =>
      db.select({ courseId: userCourseEnrollment.courseId }).from(userCourseEnrollment).where(eq(userCourseEnrollment.userId, UID)),
    ),
  );

  out.push(
    await step("userPreferences by user", () =>
      db.select({ t: userPreferences.targetLanguage }).from(userPreferences).where(eq(userPreferences.userId, UID)).limit(1),
    ),
  );

  out.push(
    await step("standalone units query", () =>
      db.select({ id: unit.id, markdown: unit.markdown }).from(unit).where(and(eq(unit.createdBy, UID))).limit(10),
    ),
  );

  return NextResponse.json({ total: Date.now(), steps: out });
}
