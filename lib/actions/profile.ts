"use server";

import { db, isDbAvailable } from "@/lib/db";
import {
  userStats,
  userPreferences,
  lessonCompletion,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";
import { DEFAULT_PATH } from "../constants";

export async function getProfileData() {
  const session = await requireSession();
  const userId = session.user.id;

  if (await isDbAvailable()) {
    try {
      const [stats] = await db
        .select()
        .from(userStats)
        .where(eq(userStats.userId, userId));

      const recentCompletions = await db
        .select()
        .from(lessonCompletion)
        .where(eq(lessonCompletion.userId, userId))
        .orderBy(desc(lessonCompletion.completedAt))
        .limit(10);

      return {
        user: session.user,
        stats: stats ?? {
          currentStreak: 1,
          longestStreak: 1,
          totalLessonsCompleted: 0,
        },
        recentCompletions,
      };
    } catch {}
  }

  return {
    user: session.user,
    stats: {
      currentStreak: 1,
      longestStreak: 1,
      totalLessonsCompleted: 0,
    },
    recentCompletions: [],
  };
}

export async function updateNativeLanguage(language: string) {
  const session = await requireSession();
  const userId = session.user.id;

  if (await isDbAvailable()) {
    try {
      await db
        .insert(userPreferences)
        .values({ userId, nativeLanguage: language, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { nativeLanguage: language, updatedAt: new Date() },
        });
    } catch {}
  }

  revalidatePath(DEFAULT_PATH);
  revalidatePath("/prompts");
  revalidatePath("/settings");
}

export async function getNativeLanguage(userId: string): Promise<string | null> {
  if (await isDbAvailable()) {
    try {
      const [prefs] = await db
        .select({ nativeLanguage: userPreferences.nativeLanguage })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId));

      return prefs?.nativeLanguage ?? null;
    } catch {}
  }

  return null;
}
