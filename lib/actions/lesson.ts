"use server";

import { db, isDbAvailable } from "@/lib/db";
import {
  userStats,
  lessonCompletion,
  exerciseAttempt,
  dailyActivity,
  userUnitLibrary,
  userCourseEnrollment,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { computeStreak } from "@/lib/game/streaks";
import type { Exercise } from "@/lib/content/types";
import { recordWordPracticeBatch } from "@/lib/actions/srs";
import { extractSrsWords } from "@/lib/srs-words";
import { getUnitWithContent } from "@/lib/db/queries/courses";
import { addLocalLessonCompletion, upsertLocalUserStats } from "@/lib/srs-store";
import { revalidatePath } from "next/cache";

interface CompleteLessonInput {
  unitId: string;
  lessonIndex: number;
  results: {
    exerciseIndex: number;
    exerciseType: string;
    correct: boolean;
    userAnswer: string;
  }[];
  mistakeCount: number;
}

export async function completeLesson(input: CompleteLessonInput) {
  const session = await requireSession();
  const userId = session.user.id;

  const perfectScore = input.mistakeCount === 0;
  const today = new Date().toISOString().split("T")[0];

  // 1. Fetch unit reliably from DB or filesystem registry
  const unitData = await getUnitWithContent(input.unitId);

  // 2. Extract words from exercises for this lesson index
  const practicesToRecord: { word: string; correct: boolean }[] = [];
  if (unitData && unitData.lessons && unitData.lessons[input.lessonIndex]) {
    const lesson = unitData.lessons[input.lessonIndex];
    for (const result of input.results) {
      if (result.userAnswer === "[skipped]") continue;
      // Guard the index: a stale/out-of-range exerciseIndex used to `continue`
      // silently, which discarded that exercise's words and left the learner
      // with a completed lesson but zero recorded practice.
      const exercise = lesson.exercises?.[result.exerciseIndex] as Exercise | undefined;
      if (!exercise) {
        console.warn(
          `completeLesson: exerciseIndex ${result.exerciseIndex} out of range for unit ${input.unitId} lesson ${input.lessonIndex} (${lesson.exercises?.length ?? 0} exercises) - skipping SRS words`,
        );
        continue;
      }
      const words = extractSrsWords(exercise);
      for (const w of words) {
        practicesToRecord.push({ word: w, correct: result.correct });
      }
    }
  } else {
    console.warn(
      `completeLesson: unit ${input.unitId} lesson ${input.lessonIndex} not found - no SRS practice recorded`,
    );
  }

  // 3. Always record SRS practice batch (saves to local store + DB)
  if (practicesToRecord.length > 0) {
    try {
      await recordWordPracticeBatch(
        userId,
        practicesToRecord,
        unitData?.targetLanguage || "en"
      );
    } catch (err) {
      console.error("recordWordPracticeBatch error in completeLesson:", err);
    }
  }

  // 4. Always record lesson completion, streak & course enrollment locally
  try {
    await addLocalLessonCompletion(userId, input.unitId, input.lessonIndex, perfectScore);
    await upsertLocalUserStats(userId, today);
    if (unitData) {
      await autoAddToLibrary(userId, unitData);
    }
  } catch (err) {
    console.warn("Local lesson save error:", err);
  }

  // 5. Also save to database if available
  if (await isDbAvailable()) {
    try {
      const [completion] = await db
        .insert(lessonCompletion)
        .values({
          userId,
          unitId: input.unitId,
          lessonIndex: input.lessonIndex,
          perfectScore,
        })
        .returning();

      if (completion && input.results.length > 0) {
        await db.insert(exerciseAttempt).values(
          input.results.map((r) => ({
            userId,
            lessonCompletionId: completion.id,
            exerciseIndex: r.exerciseIndex,
            exerciseType: r.exerciseType,
            correct: r.correct,
            userAnswer: r.userAnswer,
          }))
        );
      }

      await Promise.all([
        upsertUserStats(userId, today),
        db
          .insert(dailyActivity)
          .values({ userId, date: today, lessonsCompleted: 1 })
          .onConflictDoUpdate({
            target: [dailyActivity.userId, dailyActivity.date],
            set: {
              lessonsCompleted: sql`${dailyActivity.lessonsCompleted} + 1`,
            },
          }),
      ]);
    } catch (e) {
      console.warn("Complete lesson DB save skipped:", e);
    }
  }

  // 6. Revalidate caches so Progress and Words pages show updated stats immediately
  try {
    revalidatePath("/progress");
    revalidatePath("/words");
    revalidatePath(`/unit/${input.unitId}`);
  } catch {}

  return { perfectScore };
}

async function upsertUserStats(userId: string, today: string) {
  // Fetch current stats to compute streak
  const [stats] = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId));

  const { newStreak, shouldUpdate } = computeStreak(
    stats?.currentStreak ?? 0,
    stats?.lastPracticeDate ?? null
  );

  // Always increment lesson count; only update streak fields if needed
  const totalCompleted = (stats?.totalLessonsCompleted ?? 0) + 1;
  const longestStreak = Math.max(stats?.longestStreak ?? 0, newStreak);

  if (stats) {
    if (shouldUpdate) {
      await db
        .update(userStats)
        .set({
          currentStreak: newStreak,
          longestStreak,
          lastPracticeDate: today,
          totalLessonsCompleted: totalCompleted,
        })
        .where(eq(userStats.userId, userId));
    } else {
      // Already practiced today — only increment lesson count
      await db
        .update(userStats)
        .set({ totalLessonsCompleted: totalCompleted })
        .where(eq(userStats.userId, userId));
    }
  } else {
    await db.insert(userStats).values({
      userId,
      currentStreak: newStreak,
      longestStreak,
      lastPracticeDate: today,
      totalLessonsCompleted: totalCompleted,
    });
  }
}

async function autoAddToLibrary(
  userId: string,
  unitRow: { id: string; courseId: string | null; visibility: string | null; createdBy: string | null } | undefined
) {
  if (!unitRow) return;
  if (unitRow.courseId) {
    // Automatically record course enrollment so course appears in user's library and stays enrolled
    try {
      await db
        .insert(userCourseEnrollment)
        .values({ userId, courseId: unitRow.courseId })
        .onConflictDoNothing();
      const { addLocalCourseEnrollment } = await import("@/lib/srs-store");
      await addLocalCourseEnrollment(userId, unitRow.courseId);
    } catch {}
    return;
  }
  // Standalone units: auto-add public, non-owned units
  if (unitRow.visibility !== "public") return;
  if (unitRow.createdBy === userId) return;

  await db
    .insert(userUnitLibrary)
    .values({ userId, unitId: unitRow.id })
    .onConflictDoNothing();
}

