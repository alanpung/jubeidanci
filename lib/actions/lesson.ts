"use server";

import { db, isDbAvailable, hasDbConfig } from "@/lib/db";
import {
  userStats,
  lessonCompletion,
  exerciseAttempt,
  dailyActivity,
  userUnitLibrary,
  userCourseEnrollment,
  user,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { computeStreak } from "@/lib/game/streaks";
import type { Exercise } from "@/lib/content/types";
import { recordWordPracticeBatch } from "@/lib/actions/srs";
import { scoreToQuality } from "@/lib/marking";
import { extractSrsWords } from "@/lib/srs-words";
import { recordLessonDebug } from "@/lib/lesson-debug";
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
    /** Translation score (0–100); absent for non-scored exercises. */
    score?: number;
  }[];
  mistakeCount: number;
}

export async function completeLesson(input: CompleteLessonInput) {
  const session = await requireSession();
  const userId = session.user.id;

  const perfectScore = input.mistakeCount === 0;
  const today = new Date().toISOString().split("T")[0];

  // Fail loudly if this identity has no `user` row. srs_card.user_id and
  // lesson_completion.user_id are FKs to user.id, so writing under an id that
  // only exists in a cookie (the old fallback-auth path minted
  // user_<hex(email)>) threw a foreign-key error that was swallowed by the
  // surrounding try/catch — the lesson looked complete but recorded nothing.
  // Better to record locally and say so than to silently lose the practice.
  // Ensure the `user` row exists before writing. srs_card / lesson_completion
  // FK to user.id, so a missing row makes every Postgres insert fail and the
  // whole lesson's progress falls through to the ephemeral server local store
  // (/tmp) — which is exactly why "Refresh SRS Data" showed 0 while the warm
  // instance still reported the count. If the row is missing we create it from
  // the session instead of silently skipping the writes.
  const userRowExists = await ensureUserRow(userId, session.user);
  if (!userRowExists) {
    console.error(
      `[lesson] completeLesson: could not ensure user row "${userId}" — ` +
        `SRS/lesson rows will not be persisted to Postgres (FK violation).`,
    );
  }

  // 1. Fetch unit reliably from DB or filesystem registry
  const unitData = await getUnitWithContent(input.unitId);

  // 2. Extract words from exercises for this lesson index
  const practicesToRecord: { word: string; correct: boolean; quality?: number }[] = [];
  let skippedResults = 0;
  let missingExercises = 0;
  let zeroWordExercises = 0;
  let fallbackUsed = false;
  const lesson =
    unitData && unitData.lessons ? unitData.lessons[input.lessonIndex] : undefined;
  if (lesson) {
    for (const result of input.results) {
      if (result.userAnswer === "[skipped]") {
        skippedResults++;
        continue;
      }
      // Guard the index: a stale/out-of-range exerciseIndex used to `continue`
      // silently, which discarded that exercise's words and left the learner
      // with a completed lesson but zero recorded practice.
      const exercise = lesson.exercises?.[result.exerciseIndex] as Exercise | undefined;
      if (!exercise) {
        missingExercises++;
        console.warn(
          `completeLesson: exerciseIndex ${result.exerciseIndex} out of range for unit ${input.unitId} lesson ${input.lessonIndex} (${lesson.exercises?.length ?? 0} exercises) - skipping SRS words`,
        );
        continue;
      }
      const words = extractSrsWords(exercise);
      if (words.length === 0) zeroWordExercises++;
      // Translation exercises ship a whole-sentence score; convert it to an
      // SM-2 quality so each word in the sentence is graded, not just marked
      // right/wrong. Other exercise types leave `quality` undefined and fall
      // back to the binary path in recordWordPracticeBatch.
      const quality =
        result.score !== undefined ? scoreToQuality(result.score) : undefined;
      for (const w of words) {
        practicesToRecord.push({ word: w, correct: result.correct, quality });
      }
    }

    // A learner who answered every question must never end the lesson with
    // zero recorded words: that silently wipes the Learning count on the
    // Progress page. If the per-result lookup produced nothing (index drift,
    // an exercise shape that yields no tokens), fall back to the lesson's own
    // vocabulary, pairing each exercise with its result when one exists.
    if (practicesToRecord.length === 0 && input.results.length > 0) {
      fallbackUsed = true;
      lesson.exercises?.forEach((ex, i) => {
        const result =
          input.results.find((r) => r.exerciseIndex === i) ?? input.results[i];
        if (!result || result.userAnswer === "[skipped]") return;
        for (const w of extractSrsWords(ex as Exercise)) {
          practicesToRecord.push({ word: w, correct: Boolean(result.correct) });
        }
      });
      console.warn(
        `[lesson] completeLesson fallback: per-result extraction yielded 0 words ` +
          `(unit=${input.unitId} lesson=${input.lessonIndex} exercises=${lesson.exercises?.length ?? 0}) ` +
          `- recorded ${practicesToRecord.length} word practice(s) from the lesson vocabulary`,
      );
    }
  } else {
    console.warn(
      `completeLesson: unit ${input.unitId} lesson ${input.lessonIndex} not found - no SRS practice recorded`,
    );
  }

  // The completion screen reports wordsPracticed from this batch. When it shows
  // "no words recorded" while accuracy is non-zero, the results array arrived
  // empty or every exercise yielded nothing — record which, so the cause is
  // visible in the deployment logs instead of having to be re-derived.
  console.log(
    `[lesson] completeLesson unit=${input.unitId} lesson=${input.lessonIndex} ` +
      `results=${input.results.length} skipped=${skippedResults} ` +
      `missingExercise=${missingExercises} zeroWordExercises=${zeroWordExercises} ` +
      `practices=${practicesToRecord.length} mistakeCount=${input.mistakeCount}`,
  );

  // 3. Always record SRS practice batch (saves to local store + DB)
  let wordsLearned = 0;
  let wordsMastered = 0;
  let wordsPracticed = 0;
  let wordsAdded = 0;
  let srsError: string | null = null;
  if (practicesToRecord.length > 0 && userRowExists) {
    try {
      const result = await recordWordPracticeBatch(
        userId,
        practicesToRecord,
        unitData?.targetLanguage || "en"
      );
      wordsLearned = result.learningAdded;
      wordsMastered = result.masteredAdded;
      wordsPracticed = result.totalPracticed;
      wordsAdded = result.activeCount;
    } catch (err) {
      srsError = String(err);
      console.error("recordWordPracticeBatch error in completeLesson:", err);
    }
  }

  recordLessonDebug({
    unitId: input.unitId,
    lessonIndex: input.lessonIndex,
    resultCount: input.results.length,
    skipped: skippedResults,
    missingExercise: missingExercises,
    zeroWordExercises,
    lessonExerciseCount: lesson?.exercises?.length ?? null,
    fallbackUsed,
    practices: practicesToRecord.length,
    learningAdded: wordsLearned,
    masteredAdded: wordsMastered,
    wordsAdded,
    srsError,
  });

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

  // 5. Also save to database if configured. Gate on hasDbConfig (URL present),
  // not the flaky isDbAvailable() probe — same cold-start fix as
  // recordWordPracticeBatch, so lesson / streak / stats rows are attempted even
  // when the probe is inconclusive (a genuine failure is swallowed below).
  if (hasDbConfig && userRowExists) {
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

  return { perfectScore, wordsLearned, wordsMastered, wordsPracticed, wordsAdded };
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

async function ensureUserRow(
  userId: string,
  sessionUser?: { name?: string | null; email?: string | null } | null
): Promise<boolean> {
  if (!hasDbConfig) return true;
  try {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (row) return true;

    const email = sessionUser?.email;
    if (!email) {
      console.error(`[lesson] ensureUserRow: cannot create user "${userId}" — session has no email`);
      return false;
    }

    // Row is missing: create it from the authenticated session so the FK on
    // srs_card / lesson_completion passes and the learner's progress is
    // actually persisted to Postgres (not just the ephemeral /tmp store).
    await db
      .insert(user)
      .values({
        id: userId,
        name: sessionUser?.name || email,
        email,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const [after] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    return Boolean(after);
  } catch (err) {
    // A unique-email collision (row exists under a different id) or any other
    // failure: don't throw — just report and let the local-store fallback keep
    // the progress visible on the warm instance.
    console.warn(`[lesson] ensureUserRow failed for "${userId}":`, err);
    return false;
  }
}

async function autoAddToLibrary(
  userId: string,
  unitRow: { id: string; courseId: string | null; visibility: string | null; createdBy: string | null } | undefined
) {
  if (!unitRow) return;
  // Enrollment tables also FK to user.id; skip rather than throw when the
  // identity is unknown.
  try {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (!row) return;
  } catch {
    return;
  }
  if (unitRow.courseId) {
    // Automatically record course enrollment so course appears in user's library and stays enrolled
    try {
      const { addLocalCourseEnrollment } = await import("@/lib/srs-store");
      await addLocalCourseEnrollment(userId, unitRow.courseId);
    } catch (err) {
      console.warn("addLocalCourseEnrollment error:", err);
    }
    if (await isDbAvailable()) {
      try {
        await db
          .insert(userCourseEnrollment)
          .values({ userId, courseId: unitRow.courseId })
          .onConflictDoNothing();
      } catch {}
    }
    return;
  }
  // Standalone units: auto-add public, non-owned units
  if (unitRow.visibility !== "public") return;
  if (unitRow.createdBy === userId) return;

  if (await isDbAvailable()) {
    try {
      await db
        .insert(userUnitLibrary)
        .values({ userId, unitId: unitRow.id })
        .onConflictDoNothing();
    } catch {}
  }
}

