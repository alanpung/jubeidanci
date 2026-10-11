"use server";

import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";
import { supportedLanguages } from "@/lib/languages";
import { getModelsForUser } from "@/lib/ai/models";
import { DEFAULT_AI_MODEL, DEFAULT_TARGET_LANGUAGE } from "../constants";

export async function getTargetLanguage(userId?: string): Promise<string> {
  try {
    const session = await requireSession();
    const uid = userId ?? session.user.id;

    const [row] = await db
      .select({ targetLanguage: userPreferences.targetLanguage })
      .from(userPreferences)
      .where(eq(userPreferences.userId, uid))
      .limit(1);

    return row?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  } catch (err: unknown) {
    const error = err as { digest?: string; message?: string } | null;
    if (error?.digest === "NEXT_REDIRECT" || error?.message === "NEXT_REDIRECT") {
      throw err;
    }
    console.error("Error fetching target language preference:", err);
    return DEFAULT_TARGET_LANGUAGE;
  }
}

export async function updateTargetLanguage(language: string) {
  const session = await requireSession();
  const userId = session.user.id;

  if (!supportedLanguages[language] && language !== "en") {
    throw new Error(`Unsupported language: ${language}`);
  }

  await db
    .insert(userPreferences)
    .values({ userId, targetLanguage: language })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { targetLanguage: language, updatedAt: new Date() },
    });

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/words");
}

export async function getPreferredModel(userId?: string): Promise<string> {
  try {
    const session = await requireSession();
    const uid = userId ?? session.user.id;

    const [row] = await db
      .select({ preferredModel: userPreferences.preferredModel })
      .from(userPreferences)
      .where(eq(userPreferences.userId, uid))
      .limit(1);

    return row?.preferredModel ?? DEFAULT_AI_MODEL;
  } catch {
    return DEFAULT_AI_MODEL;
  }
}

export async function updatePreferredModel(model: string) {
  const session = await requireSession();
  const userId = session.user.id;

  const userModels = getModelsForUser(session.user.email);
  const valid = userModels.some((m) => m.id === model);
  if (!valid) {
    throw new Error(`Unsupported model: ${model}`);
  }

  await db
    .insert(userPreferences)
    .values({ userId, preferredModel: model })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { preferredModel: model, updatedAt: new Date() },
    });

  revalidatePath("/");
}
