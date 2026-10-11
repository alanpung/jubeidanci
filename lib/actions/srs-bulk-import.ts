"use server";

import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { loadEnLevelWords, getBundledWords } from "@/lib/words";
import { db, isDbAvailable } from "@/lib/db";
import { srsCard } from "@/lib/db/schema";
import { upsertLocalCard } from "@/lib/srs-store";
import { eq, and } from "drizzle-orm";

export async function bulkAddMissingWordsToSRS(
  language: string = "en"
): Promise<{
  success: boolean;
  message: string;
  addedCount: number;
  totalAvailable: number;
}> {
  const session = await getSession();
  if (!session?.user?.email) {
    return {
      success: false,
      message: "Authentication required",
      addedCount: 0,
      totalAvailable: 0,
    };
  }

  if (!isAdminEmail(session.user.email)) {
    return {
      success: false,
      message: "Only admins can bulk import words",
      addedCount: 0,
      totalAvailable: 0,
    };
  }

  const userId = session.user.id;

  try {
    // Load all available words from merged dictionary
    const allWords = await getBundledWords(language);
    if (!allWords || allWords.length === 0) {
      return {
        success: false,
        message: "No words found in dictionary",
        addedCount: 0,
        totalAvailable: 0,
      };
    }

    // Get existing cards for this user
    const existingCards = await db
      .select()
      .from(srsCard)
      .where(eq(srsCard.userId, userId));

    const existingWordSet = new Set(
      existingCards.map((c) => c.word.toLowerCase().trim())
    );

    // Find missing words
    const missingWords = allWords.filter(
      (w) => !existingWordSet.has(w.word.toLowerCase().trim())
    );

    // Bulk add missing words to local SRS store
    const now = new Date();
    const nextReview = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    let addedCount = 0;
    for (const w of missingWords) {
      try {
        await upsertLocalCard({
          word: w.word.toLowerCase().trim(),
          language: language === "english" ? "en" : language,
          userId,
          translation: w.english_translation || w.definition_zh || w.word,
          cefrLevel: w.cefr_level || "A1",
          pos: w.pos || "noun",
          status: "new",
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReviewAt: nextReview,
          createdAt: now.toISOString(),
        });
        addedCount++;
      } catch (err) {
        console.error(`Failed to add word "${w.word}":`, err);
      }
    }

    // Also bulk insert to database if available
    if (await isDbAvailable()) {
      try {
        const recordsToInsert = missingWords.map((w) => ({
          userId,
          word: w.word.toLowerCase().trim(),
          language: language === "english" ? "en" : language,
          translation: w.english_translation || w.definition_zh || w.word,
          cefrLevel: w.cefr_level || "A1",
          pos: w.pos || "noun",
          status: "new",
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReviewAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          createdAt: now,
          lastReviewedAt: null,
          usefulForFlashcard: true,
        }));

        if (recordsToInsert.length > 0) {
          await db
            .insert(srsCard)
            .values(recordsToInsert)
            .onConflictDoNothing();
        }
      } catch (dbErr) {
        console.error("Database bulk insert failed:", dbErr);
      }
    }

    return {
      success: true,
      message: `Successfully added ${addedCount} missing words to your SRS deck`,
      addedCount,
      totalAvailable: allWords.length,
    };
  } catch (err) {
    console.error("Bulk import error:", err);
    return {
      success: false,
      message: `Error during bulk import: ${(err as Error).message}`,
      addedCount: 0,
      totalAvailable: 0,
    };
  }
}
