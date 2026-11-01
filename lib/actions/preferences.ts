"use server";

import { db, isDbAvailable } from "@/lib/db";
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

    if (!(await isDbAvailable())) {
      return DEFAULT_TARGET_LANGUAGE;
    }

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

  if (await isDbAvailable()) {
    await db
      .insert(userPreferences)
      .values({ userId, targetLanguage: language })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { targetLanguage: language, updatedAt: new Date() },
      });
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/words");
}

export async function getPreferredModel(userId?: string): Promise<string> {
  try {
    const session = await requireSession();
    const uid = userId ?? session.user.id;

    if (!(await isDbAvailable())) {
      return DEFAULT_AI_MODEL;
    }

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

/** The reader's own "My Books" shelf order: course ids, first id first.
 *
 *  Returns an empty array whenever there is nothing usable to return — no
 *  session, DB unreachable, or (most importantly) the `my_books_order`
 *  column has not been migrated in yet. The shelf then falls back to the
 *  catalog order, so dragging still works instead of taking /library down. */
export async function getMyBooksOrder(userId?: string): Promise<string[]> {
  try {
    const session = await requireSession();
    const uid = userId ?? session.user.id;

    if (!(await isDbAvailable())) return [];

    const [row] = await db
      .select({ myBooksOrder: userPreferences.myBooksOrder })
      .from(userPreferences)
      .where(eq(userPreferences.userId, uid))
      .limit(1);

    const order = row?.myBooksOrder;
    if (!Array.isArray(order)) return [];
    return order.filter((id): id is string => typeof id === "string");
  } catch (err) {
    console.warn("getMyBooksOrder: falling back to natural order:", err);
    return [];
  }
}

/** Persist the reader's "My Books" shelf order.
 *
 *  One row per reader, so this is a single upsert no matter how many books
 *  were dragged. Best-effort on purpose: if the column is missing or the DB
 *  is down, the shelf still reorders for this session — it just will not
 *  survive a reload until the migration lands. */
export async function saveMyBooksOrder(
  orderedIds: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const clean = (Array.isArray(orderedIds) ? orderedIds : [])
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      // Hard ceiling so a malformed payload can never balloon the row.
      .slice(0, 100);

    if (await isDbAvailable()) {
      await db
        .insert(userPreferences)
        .values({ userId, myBooksOrder: clean })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { myBooksOrder: clean, updatedAt: new Date() },
        });
    }

    revalidatePath("/library", "page");
    return { success: true };
  } catch (err) {
    console.warn("saveMyBooksOrder failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save shelf order",
    };
  }
}
