"use server";

import { db, isDbAvailable } from "@/lib/db";
import { userStats, lessonCompletion, unit } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";

export async function getUserProgress(courseId: string) {
  const session = await requireSession();
  const userId = session.user.id;

  if (await isDbAvailable()) {
    try {
      const courseUnitIds = await db
        .select({ id: unit.id })
        .from(unit)
        .where(eq(unit.courseId, courseId));

      const unitIds = courseUnitIds.map((u) => u.id);

      const completions =
        unitIds.length > 0
          ? await db
              .select({
                id: lessonCompletion.id,
                unitId: lessonCompletion.unitId,
                lessonIndex: lessonCompletion.lessonIndex,
                perfectScore: lessonCompletion.perfectScore,
                completedAt: lessonCompletion.completedAt,
              })
              .from(lessonCompletion)
              .where(
                and(
                  eq(lessonCompletion.userId, userId),
                  inArray(lessonCompletion.unitId, unitIds)
                )
              )
          : [];

      return { completions };
    } catch {}
  }

  return { completions: [] };
}

export async function getUnitProgress(unitId: string) {
  const session = await requireSession();
  const userId = session.user.id;

  if (await isDbAvailable()) {
    try {
      const completions = await db
        .select({
          id: lessonCompletion.id,
          unitId: lessonCompletion.unitId,
          lessonIndex: lessonCompletion.lessonIndex,
          perfectScore: lessonCompletion.perfectScore,
          completedAt: lessonCompletion.completedAt,
        })
        .from(lessonCompletion)
        .where(
          and(
            eq(lessonCompletion.userId, userId),
            eq(lessonCompletion.unitId, unitId)
          )
        );

      return { completions };
    } catch {}
  }

  return { completions: [] };
}

export async function getUserStatsData() {
  const session = await requireSession();
  const userId = session.user.id;

  if (await isDbAvailable()) {
    try {
      const [stats] = await db
        .select()
        .from(userStats)
        .where(eq(userStats.userId, userId));

      if (!stats) {
        const [newStats] = await db
          .insert(userStats)
          .values({ userId })
          .returning();
        return newStats;
      }

      return stats;
    } catch {}
  }

  return {
    userId,
    currentStreak: 1,
    longestStreak: 1,
    totalLessonsCompleted: 0,
    lastPracticeDate: new Date().toISOString().split("T")[0],
  };
}
