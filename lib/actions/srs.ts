"use server";

import { db, isDbAvailable, hasDbConfig } from "@/lib/db";
import { srsCard, dictionaryWord, userCourseEnrollment, userUnitLibrary, course, unit, user } from "@/lib/db/schema";
import { and, eq, lte, count, sql, asc, isNotNull, inArray, notInArray, or } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { revalidatePath } from "next/cache";
import { calculateNextReview, GRADUATION_THRESHOLD, hasTrackedSrsStatus, type Quality, type CardStatus } from "@/lib/srs";
import type { Exercise } from "@/lib/content/types";
import { extractSrsWords } from "@/lib/srs-words";
import { getWordToLevelMap, getBundledWords } from "@/lib/words";
import {
  getLocalCards,
  getLocalCard,
  upsertLocalCard,
  upsertLocalCardsBatch,
  deleteLocalCard,
  type SrsCardRecord,
} from "@/lib/srs-store";
import { runAfterResponse } from "@/lib/after-response";

export async function migrateDefaultUserCards(userId: string) {
  if (userId === "default_user") return;
  if (await isDbAvailable()) {
    try {
      const defaultRows = await db.execute(sql`SELECT 1 FROM srs_card WHERE user_id = 'default_user' LIMIT 1`);
      if (!defaultRows || defaultRows.length === 0) return;

      // 1. Remove duplicate 'default_user' cards where the target user already has a card for the same word and language
      await db.execute(sql`
        DELETE FROM srs_card 
        WHERE user_id = 'default_user' 
          AND EXISTS (
            SELECT 1 FROM srs_card target 
            WHERE target.user_id = ${userId} 
              AND target.word = srs_card.word 
              AND target.language = srs_card.language
          )
      `);

      // 2. Safely batch-update all remaining unique 'default_user' cards to the new user ID in a single query
      await db.execute(sql`
        UPDATE srs_card 
        SET user_id = ${userId} 
        WHERE user_id = 'default_user'
      `);
    } catch (err) {
      console.error("Migration error:", err);
    }
  }
}

async function getSafeUserId(): Promise<string> {
  try {
    const session = await getSession();
    if (session?.user?.id) return session.user.id;
  } catch {}
  return "default_user";
}

function getLanguageAliases(lang?: string): string[] {
  if (!lang) return [];
  const normalized = lang.toLowerCase().trim();
  const set = new Set<string>([lang, normalized]);

  if (normalized === "de" || normalized === "german") {
    set.add("de");
    set.add("german");
    set.add("German");
  } else if (normalized === "zh" || normalized === "mandarin" || normalized === "chinese") {
    set.add("zh");
    set.add("mandarin");
    set.add("chinese");
    set.add("Chinese");
    set.add("Mandarin");
  } else if (normalized === "es" || normalized === "spanish") {
    set.add("es");
    set.add("spanish");
    set.add("Spanish");
  } else if (normalized === "fr" || normalized === "french") {
    set.add("fr");
    set.add("french");
    set.add("French");
  } else if (normalized === "en" || normalized === "english") {
    set.add("en");
    set.add("english");
    set.add("English");
  } else if (normalized === "ja" || normalized === "japanese") {
    set.add("ja");
    set.add("japanese");
    set.add("Japanese");
  } else if (normalized === "ko" || normalized === "korean") {
    set.add("ko");
    set.add("korean");
    set.add("Korean");
  } else if (normalized === "it" || normalized === "italian") {
    set.add("it");
    set.add("italian");
    set.add("Italian");
  } else if (normalized === "pt" || normalized === "portuguese") {
    set.add("pt");
    set.add("portuguese");
    set.add("Portuguese");
  } else if (normalized === "ru" || normalized === "russian") {
    set.add("ru");
    set.add("russian");
    set.add("Russian");
  }

  return Array.from(set);
}

export async function addWordToSrs(
  word: string,
  language: string,
  translation: string
) {
  const userId = await getSafeUserId();
  const normalized = word.toLowerCase().trim();

  await upsertLocalCard({
    word: normalized,
    language,
    userId,
    translation,
    status: "new",
    nextReviewAt: null,
  });

  if (await isDbAvailable()) {
    try {
      await db
        .insert(srsCard)
        .values({
          word: normalized,
          language,
          userId,
          translation,
          status: "new",
          nextReviewAt: null,
        })
        .onConflictDoNothing();
    } catch {}
  }
}

export async function addOrFailWord(
  word: string,
  language: string,
  translation: string,
  metadata?: { cefrLevel?: string; pos?: string }
): Promise<"added" | "failed"> {
  const userId = await getSafeUserId();
  const normalizedWord = word.toLowerCase().trim();
  const aliases = getLanguageAliases(language);

  const localExisting = await getLocalCard(normalizedWord, aliases, userId);

  // Fill CEFR from the dictionary when the caller (the word tooltip) didn't
  // supply it — that way every newly tracked card still records its level badge.
  let cefrLevel = metadata?.cefrLevel || null;
  if (!cefrLevel) {
    try {
      const levelMap = await getWordToLevelMap();
      cefrLevel = levelMap[normalizedWord] || null;
    } catch {
      // ignore — the field is optional
    }
  }

  if (!localExisting) {
    await upsertLocalCard({
      word: normalizedWord,
      language,
      userId,
      translation,
      cefrLevel,
      status: "learning",
      nextReviewAt: new Date().toISOString(),
    });

    if (await isDbAvailable()) {
      try {
        await db.insert(srsCard).values({
          word: normalizedWord,
          language,
          userId,
          translation,
          cefrLevel,
          status: "learning",
          nextReviewAt: new Date(),
        }).onConflictDoNothing();
      } catch {}
    }

    return "added";
  }

  // Already exists — reset
  const result = calculateNextReview(
    {
      easeFactor: localExisting.easeFactor,
      interval: localExisting.interval,
      repetitions: localExisting.repetitions,
      status: (localExisting.status as CardStatus) ?? "learning",
    },
    0
  );

  await upsertLocalCard({
    word: normalizedWord,
    language: localExisting.language,
    userId,
    easeFactor: result.easeFactor,
    interval: result.interval,
    repetitions: result.repetitions,
    status: result.status,
    nextReviewAt: result.nextReviewAt.toISOString(),
    lastReviewedAt: new Date().toISOString(),
  });

  if (await isDbAvailable()) {
    try {
      await db
        .update(srsCard)
        .set({
          easeFactor: result.easeFactor,
          interval: result.interval,
          repetitions: result.repetitions,
          status: result.status,
          nextReviewAt: result.nextReviewAt,
          lastReviewedAt: new Date(),
        })
        .where(
          and(
            eq(srsCard.word, normalizedWord),
            inArray(srsCard.language, aliases),
            eq(srsCard.userId, userId)
          )
        );
    } catch {}
  }

  return "failed";
}

export async function getDueCards(language: string, limit = 20) {
  const userId = await getSafeUserId();
  const now = new Date();
  const aliases = getLanguageAliases(language);

  if (await isDbAvailable()) {
    try {
      const conditions = [
        eq(srsCard.userId, userId),
        inArray(srsCard.status, ["learning", "review"]),
        isNotNull(srsCard.nextReviewAt),
        lte(srsCard.nextReviewAt, now),
      ];

      if (aliases.length > 0) {
        conditions.push(inArray(srsCard.language, aliases));
      }

      return await db
        .select()
        .from(srsCard)
        .where(and(...conditions))
        .orderBy(srsCard.nextReviewAt)
        .limit(limit);
    } catch {}
  }

  const local = await getLocalCards(userId, aliases);
  return local
    .filter(
      (c) =>
        (c.status === "learning" || c.status === "review") &&
        c.nextReviewAt &&
        new Date(c.nextReviewAt) <= now
    )
    .sort((a, b) => (a.nextReviewAt! > b.nextReviewAt! ? 1 : -1))
    .slice(0, limit)
    .map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      nextReviewAt: c.nextReviewAt ? new Date(c.nextReviewAt) : null,
      lastReviewedAt: c.lastReviewedAt ? new Date(c.lastReviewedAt) : null,
    }));
}

export interface SrsCardItem {
  word: string;
  language: string;
  userId: string;
  translation: string;
  cefrLevel: string | null;
  pos: string | null;
  gender?: string | null;
  status: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  lastRating?: string | null;
  createdAt: Date;
}

export async function getAllCards(
  language?: string,
  userIdOverride?: string,
  forceSync = false,
  skipSync = false
): Promise<SrsCardItem[]> {
  // Prefer an explicitly resolved userId (e.g. the one the caller already
  // authenticated) over re-resolving via getSession(). In a Route Handler the
  // second getSession() call can throw/return null and silently fall back to
  // "default_user", which is exactly why the Refresh endpoint returned an empty
  // deck (0 cards) while its own count query reported the real user's rows.
  const userId = userIdOverride ?? (await getSafeUserId());
  // forceSync=true (used by the explicit "Refresh SRS Data" button) bypasses
  // the 60s throttle so a manual refresh always triggers a full sync. Without
  // it, a refresh landing within the throttle window would silently skip the
  // sync and the user would keep seeing a stale "New" count.
  // Deferred to after the response: this sync reads every enrolled course's
  // word list and writes/updates thousands of srs_card rows. Running it inline
  // alongside the request's own reads used to hold most of the 5-connection
  // pool, and because postgres.js queues (rather than fails) on an exhausted
  // pool, the page waited indefinitely instead of erroring.
  // skipSync=true (used by the /api/words SRS-exclusion read) reuses the same
  // authoritative DB+local merge WITHOUT scheduling another sync — the page
  // load that rendered the dictionary already triggered one.
  if (!skipSync) {
    void runAfterResponse(() =>
      syncUserCourseWordsToSrs(userId, forceSync).catch(() => {}),
    );
  }
  const aliases = language ? getLanguageAliases(language) : [];
  // Gate on hasDbConfig (DB URL present), NOT the flaky isDbAvailable()
  // cold-start probe. The probe can false-negative on a cold serverless
  // instance and make getAllCards() return 0 for everything — the exact
  // "67 -> 0 on refresh" symptom. Attempt the real read below and let its
  // try/catch absorb a genuine failure instead of guessing.
  const dbUp = hasDbConfig;

  // Populated only when the DB half of the merge could not be read (e.g. a
  // schema/connection error). Surfaced via the /api/srs-cards diagnostics so a
  // wrong count is never silent again.
  let srsDbReadError: string | null = null;
  let cards: SrsCardItem[] = [];
  if (dbUp) {
    try {
      cards = (await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.userId, userId),
            ...(aliases.length > 0 ? [inArray(srsCard.language, aliases)] : []),
          ),
        )
        .orderBy(srsCard.createdAt)) as unknown as SrsCardItem[];
    } catch (err) {
      srsDbReadError =
        err instanceof Error ? err.message : String(err);
      console.warn(
        `[srs] getAllCards: DB half of the merge unavailable for user "${userId}": ${srsDbReadError}`,
      );
    }
  }

  // Always load the local store as well, then MERGE it with the DB rows.
  // The local store is the one that recordWordPracticeBatch/upsertLocalCard
  // always write, while the Postgres write sits behind isDbAvailable() and a
  // try/catch. When that write silently fails, the DB still holds the card as
  // status="new" (seeded by syncUserCourseWordsToSrs) and the learner's real
  // progress was visible nowhere: the old code returned DB cards whenever
  // cards.length > 0 and never consulted the local store at all.
  // Merge precedence: a card that has actually been practised (status other
  // than "new", or repetitions > 0, or a recent lastReviewedAt) wins over the
  // DB copy, so a completed lesson can never be reported as all-new again.
  const local = await getLocalCards(userId, aliases);
  const localMap = new Map<string, SrsCardRecord>();
  local.forEach((c) => {
    const key = c.word.toLowerCase().trim();
    if (!localMap.has(key)) localMap.set(key, c);
  });

  const dbMap = new Map<string, SrsCardItem>();
  cards.forEach((c) => {
    dbMap.set(c.word.toLowerCase().trim(), c);
  });

  cards = Array.from(dbMap.keys()).map((key) => {
    const d = dbMap.get(key)!;
    const l = localMap.get(key);
    if (!l) return d as unknown as SrsCardItem;

    const dbPractised =
      d.status !== "new" || (d.repetitions ?? 0) > 0 || d.lastReviewedAt != null;
    const localPractised =
      l.status !== "new" || (l.repetitions ?? 0) > 0 || l.lastReviewedAt != null;

    // Take whichever record reflects more study; never regress a practised
    // word back to "new" just because the DB copy is stale.
    const winner = localPractised && !dbPractised ? l : dbPractised && !localPractised ? d : dbPractised && localPractised
      ? l.lastReviewedAt && d.lastReviewedAt
        ? new Date(l.lastReviewedAt).getTime() >= new Date(d.lastReviewedAt).getTime()
          ? l
          : d
        : l
      : d;

    return winner as unknown as SrsCardItem;
  });

  // Cards that exist ONLY locally (DB write failed or not yet replicated) must
  // still count — dropping them is exactly how practised words disappeared.
  localMap.forEach((l, key) => {
    if (!dbMap.has(key)) cards.push(l as unknown as SrsCardItem);
  });

  // Normalise date fields: the local store persists ISO strings while the DB
  // returns Date objects, and callers (progress-view, word tables) expect Dates.
  cards = cards.map((c) => {
    const any = c as unknown as Record<string, unknown>;
    return {
      ...(c as unknown as SrsCardItem),
      createdAt: any.createdAt ? new Date(any.createdAt as string) : new Date(),
      nextReviewAt: any.nextReviewAt ? new Date(any.nextReviewAt as string) : null,
      lastReviewedAt: any.lastReviewedAt ? new Date(any.lastReviewedAt as string) : null,
    } as SrsCardItem;
  });

  try {
    const levelMap = await getWordToLevelMap();
    for (const card of cards) {
      const key = card.word.toLowerCase().trim();
      const mappedLvl = levelMap[key];
      if (mappedLvl) {
        card.cefrLevel = mappedLvl;
      } else if (!card.cefrLevel) {
        card.cefrLevel = "A1";
      }
    }
  } catch (err) {
    console.error("Failed to map CEFR levels:", err);
  }

  // Expose the DB-read diagnostic on the returned array (non-enumerable, so it
  // never shows up in JSON payloads) for the /api/srs-cards diagnostics.
  if (srsDbReadError) {
    Object.defineProperty(cards, "__dbReadError", {
      value: srsDbReadError,
      enumerable: false,
      configurable: true,
    });
  }

  return cards;
}

/**
 * The set of dictionary words the learner already has in their SRS deck
 * (any tracked status: new / learning / learned / review). Used by the
 * "Remaining" (R) filter to exclude those words server-side, so the filter
 * is exact and paginable instead of relying on the client's copy of the deck.
 *
 * Reuses the same authoritative DB+local merge as getAllCards (skipSync=true
 * so we don't schedule a second background sync for a read-only request).
 */
export async function getTrackedWordSet(
  language?: string,
  userIdOverride?: string
): Promise<Set<string>> {
  const cards = await getAllCards(language, userIdOverride, false, true);
  const set = new Set<string>();
  for (const c of cards) {
    if (hasTrackedSrsStatus(c.status)) {
      set.add(c.word.toLowerCase().trim());
    }
  }
  return set;
}

/**
 * The exact number of dictionary words the learner has NOT yet taken on —
 * i.e. the size of the "Remaining" (R) filter's result set. Computed the same
 * way the /api/words SRS exclusion computes it (dictionary words minus the
 * tracked SRS words), so the badge on the R button can never disagree with the
 * list behind it.
 */
export async function getRemainingDictionaryCount(
  language?: string,
  userIdOverride?: string
): Promise<number> {
  const normLang = language === "english" ? "en" : language || "en";
  const words = await getBundledWords(normLang);
  if (words.length === 0) return 0;
  const tracked = await getTrackedWordSet(normLang, userIdOverride);
  let remaining = 0;
  for (const w of words) {
    if (!tracked.has(w.word.toLowerCase().trim())) remaining++;
  }
  return remaining;
}

export async function reviewCard(
  word: string,
  language: string,
  quality: Quality
) {
  const userId = await getSafeUserId();
  const normalizedWord = word.toLowerCase().trim();
  const aliases = getLanguageAliases(language);
  // Gate on hasDbConfig, not the flaky cold-start probe (see getAllCards).
  const dbUp = hasDbConfig;

  let card: SrsCardItem | null = null;
  if (dbUp) {
    try {
      const [dbCard] = await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.word, normalizedWord),
            inArray(srsCard.language, aliases),
            eq(srsCard.userId, userId)
          )
        );
      card = dbCard || null;
    } catch {}
  }

  if (!card) {
    const local = await getLocalCard(normalizedWord, aliases, userId);
    if (local) {
      card = {
        ...local,
        createdAt: new Date(local.createdAt),
        nextReviewAt: local.nextReviewAt ? new Date(local.nextReviewAt) : null,
        lastReviewedAt: local.lastReviewedAt ? new Date(local.lastReviewedAt) : null,
      };
    }
  }

  const initialStatus: CardStatus = card ? (card.status as CardStatus) : "new";

  const result = calculateNextReview(
    {
      easeFactor: card?.easeFactor ?? 2.5,
      interval: card?.interval ?? 0,
      repetitions: card?.repetitions ?? 0,
      status: initialStatus,
    },
    quality
  );

  const rawStatus = result.status;
  const cardStatus = rawStatus === "review" ? "learned" : rawStatus;

  const ratingStr: "hard" | "ok" | "easy" =
    quality === 5 ? "easy" : quality === 4 ? "ok" : "hard";

  const targetLang = card?.language || aliases[0] || language;

  // 1. Always save to local store
  await upsertLocalCard({
    word: normalizedWord,
    language: targetLang,
    userId,
    status: cardStatus,
    translation: card?.translation || word,
    easeFactor: result.easeFactor,
    interval: cardStatus === "learned" ? 36500 : result.interval,
    repetitions: result.repetitions,
    nextReviewAt: result.nextReviewAt ? result.nextReviewAt.toISOString() : null,
    lastReviewedAt: new Date().toISOString(),
    lastRating: ratingStr,
  });

  // 2. Also save to DB if available
  if (dbUp) {
    try {
      if (card && card.createdAt) {
        await db
          .update(srsCard)
          .set({
            easeFactor: result.easeFactor,
            interval: cardStatus === "learned" ? 36500 : result.interval,
            repetitions: result.repetitions,
            status: cardStatus,
            nextReviewAt: result.nextReviewAt,
            lastReviewedAt: new Date(),
          })
          .where(
            and(
              eq(srsCard.word, card.word),
              eq(srsCard.language, card.language),
              eq(srsCard.userId, userId)
            )
          );
      } else {
        await db
          .insert(srsCard)
          .values({
            word: normalizedWord,
            language: targetLang,
            userId,
            translation: word,
            easeFactor: result.easeFactor,
            interval: cardStatus === "learned" ? 36500 : result.interval,
            repetitions: result.repetitions,
            status: cardStatus,
            nextReviewAt: result.nextReviewAt,
            lastReviewedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [srsCard.word, srsCard.language, srsCard.userId],
            set: {
              easeFactor: result.easeFactor,
              interval: cardStatus === "learned" ? 36500 : result.interval,
              repetitions: result.repetitions,
              status: cardStatus,
              nextReviewAt: result.nextReviewAt,
              lastReviewedAt: new Date(),
            },
          });
      }
    } catch {}
  }

  try {
    revalidatePath("/words");
  } catch {}
  return result;
}

export async function getSrsStats(language?: string) {
  const userId = await getSafeUserId();
  // See getAllCards: the sync is maintenance work, not part of answering this
  // request, so run it once the response is on the wire.
  void runAfterResponse(() => syncUserCourseWordsToSrs(userId).catch(() => {}));
  const dbUp = await isDbAvailable();
  const aliases = language ? getLanguageAliases(language) : [];

  if (dbUp) {
    try {
      type StatRow = {
        total: number;
        due: number;
        new_count: number;
        learning_count: number;
        learned_count: number;
      };

      const rows = await db.execute<StatRow>(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(CASE WHEN status IN ('learning', 'review') AND next_review_at IS NOT NULL AND next_review_at <= NOW() THEN 1 END)::int AS due,
          COUNT(CASE WHEN status = 'new' AND repetitions < 3 THEN 1 END)::int AS new_count,
          COUNT(CASE WHEN status = 'learning' AND repetitions < 3 THEN 1 END)::int AS learning_count,
          COUNT(CASE WHEN status IN ('learned', 'review') OR repetitions >= 3 THEN 1 END)::int AS learned_count
        FROM srs_card
        WHERE user_id = ${userId}
          ${aliases.length > 0 ? sql`AND language = ANY(${aliases})` : sql``}
      `);

      const stat = rows[0];
      if (stat) {
        return {
          total: Number(stat.total) || 0,
          due: Number(stat.due) || 0,
          new: Number(stat.new_count) || 0,
          learning: Number(stat.learning_count) || 0,
          review: Number(stat.learned_count) || 0,
          learned: Number(stat.learned_count) || 0,
          hard: 0,
          ok: 0,
          easy: Number(stat.learned_count) || 0,
        };
      }
    } catch (err) {
      console.error("DEBUG: getSrsStats DB query failed:", err);
    }
  }

  const local = await getLocalCards(userId, aliases);
  const now = new Date();
  let dueCount = 0;
  let newCount = 0;
  let learningCount = 0;
  let learnedCount = 0;
  let hardCount = 0;
  let okCount = 0;
  let easyCount = 0;

  for (const c of local) {
    // A card graduates (counts as "learned") once it has survived the SM-2
    // graduation threshold of 3 successful repetitions — matching the
    // front-end rule in progress-view.tsx / word-explorer.tsx and teacher.ts.
    const graduated = c.repetitions >= GRADUATION_THRESHOLD;
    if (c.status === "learned" || c.status === "review" || graduated) {
      learnedCount++;
    } else if (c.status === "learning") {
      learningCount++;
      if (c.nextReviewAt && new Date(c.nextReviewAt) <= now) {
        dueCount++;
      }
    } else if (c.status === "new") {
      newCount++;
    }

    if (c.lastRating === "hard") hardCount++;
    else if (c.lastRating === "ok") okCount++;
    else if (c.lastRating === "easy") easyCount++;
  }

  return {
    total: local.length,
    due: dueCount,
    new: newCount,
    learning: learningCount,
    review: learnedCount,
    learned: learnedCount,
    hard: hardCount,
    ok: okCount,
    easy: easyCount,
  };
}

const userLibraryWordsCache = new Map<string, { timestamp: number; words: string[] }>();

export async function invalidateUserLibraryWordsCache(userId?: string) {
  if (userId) userLibraryWordsCache.delete(userId);
  else userLibraryWordsCache.clear();
}

export async function getUserLibraryWords(userIdParam?: string): Promise<string[]> {
  const userId = userIdParam || (await getSafeUserId());
  if (!userId || userId === "default_user") return [];

  const cached = userLibraryWordsCache.get(userId);
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.words;
  }

  const dbUp = await isDbAvailable();
  const enrolledCourseIds = new Set<string>();

  if (dbUp) {
    try {
      const enrollments = await db
        .select({ courseId: userCourseEnrollment.courseId })
        .from(userCourseEnrollment)
        .where(eq(userCourseEnrollment.userId, userId));
      enrollments.forEach((e) => enrolledCourseIds.add(e.courseId));

      const { SYSTEM_COURSE_IDS } = await import("@/lib/db/queries/courses");
      const createdCourses = await db
        .select({ id: course.id })
        .from(course)
        .where(eq(course.createdBy, userId));
      createdCourses.forEach((c) => {
        if (!SYSTEM_COURSE_IDS.includes(c.id)) enrolledCourseIds.add(c.id);
      });
    } catch {}
  }

  const { getLocalCourseEnrollments } = await import("@/lib/srs-store");
  const localEnrollments = await getLocalCourseEnrollments(userId);
  localEnrollments.forEach((id) => enrolledCourseIds.add(id));

  const standaloneUnitIds = new Set<string>();
  if (dbUp) {
    try {
      const libraryUnitRows = await db
        .select({ unitId: userUnitLibrary.unitId, courseId: unit.courseId })
        .from(userUnitLibrary)
        .innerJoin(unit, eq(unit.id, userUnitLibrary.unitId))
        .where(eq(userUnitLibrary.userId, userId));
      for (const u of libraryUnitRows) {
        if (u.courseId) enrolledCourseIds.add(u.courseId);
        else standaloneUnitIds.add(u.unitId);
      }
    } catch {}
  }

  if (enrolledCourseIds.size === 0 && standaloneUnitIds.size === 0) {
    userLibraryWordsCache.set(userId, { timestamp: Date.now(), words: [] });
    return [];
  }

  const unitConditions = [];
  if (enrolledCourseIds.size > 0) {
    unitConditions.push(inArray(unit.courseId, Array.from(enrolledCourseIds)));
  }
  if (standaloneUnitIds.size > 0) {
    unitConditions.push(inArray(unit.id, Array.from(standaloneUnitIds)));
  }

  let activeUnits: { id: string; markdown: string; level: string | null; targetLanguage: string | null }[] = [];
  if (dbUp && unitConditions.length > 0) {
    try {
      activeUnits = await db
        .select({
          id: unit.id,
          markdown: unit.markdown,
          level: unit.level,
          targetLanguage: unit.targetLanguage,
        })
        .from(unit)
        .where(or(...unitConditions));
    } catch (err) {
      console.warn("Error fetching units from DB in getUserLibraryWords:", err);
    }
  }

  const { loadContentDir, getUnitLessonsSafe } = await import("@/lib/content/loader");
  const { units: fsUnits } = loadContentDir();
  const dictLevelMap = (await getWordToLevelMap().catch(() => ({}))) as Record<string, string>;

  const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

  const unitMap = new Map<string, { id: string; markdown: string; level: string }>();
  for (const u of activeUnits) {
    if (u.id && u.markdown) {
      unitMap.set(u.id, { id: u.id, markdown: u.markdown, level: u.level || "A2" });
    }
  }
  for (const fsu of fsUnits) {
    const cId = fsu.parsed.courseId;
    if (cId && enrolledCourseIds.has(cId)) {
      const match = fsu.parsed.title.match(/Unit\s+(\d+)/i);
      const unitNum = match ? parseInt(match[1], 10) : null;
      const uId = unitNum ? `${cId}-unit-${unitNum}` : `${cId}-${fsu.parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      // Prefer filesystem markdown for system courses so updated srsWords are always reflected
      unitMap.set(uId, { id: uId, markdown: fsu.markdown, level: fsu.parsed.level || "A2" });
    }
  }

  const wordSet = new Set<string>();
  for (const u of unitMap.values()) {
    if (!u.markdown) continue;
    const { lessons } = getUnitLessonsSafe(u.markdown);
    const maxLvlRank = LEVEL_ORDER[(u.level || "C2").toUpperCase().trim()] || 6;
    for (const lesson of lessons) {
      for (const ex of lesson.exercises) {
        const exAny = ex as unknown as Record<string, unknown>;
        const words = extractSrsWords(ex);
        const frontWord = typeof exAny.front === "string" ? exAny.front.toLowerCase().trim() : null;
        const targetWords = words.length > 0 ? words : frontWord ? [frontWord] : [];
        for (const w of targetWords) {
          const norm = w.toLowerCase().trim();
          if (!norm) continue;
          const dictLvl = dictLevelMap[norm];
          if (dictLvl || frontWord === norm) {
            wordSet.add(norm);
          }
        }
      }
    }
  }

  const result = Array.from(wordSet);
  userLibraryWordsCache.set(userId, { timestamp: Date.now(), words: result });
  return result;
}

export async function setWordStatus(
  word: string,
  language: string,
  status: "new" | "learning" | "learned" | "remove" | "unmaster",
  metadata?: { translation?: string; cefrLevel?: string; pos?: string }
) {
  const userId = await getSafeUserId();
  const normalizedWord = word.toLowerCase().trim();
  const langKey = (language || "en").toLowerCase().trim();
  const aliases = getLanguageAliases(langKey);
  const dbUp = await isDbAvailable();

  // If status is "unmaster", check if the word is in the user's active library courses/units
  let effectiveStatus = status;
  if (status === "unmaster") {
    const libraryWords = await getUserLibraryWords(userId);
    const inLibrary = libraryWords.some((w) => w.toLowerCase().trim() === normalizedWord);
    effectiveStatus = inLibrary ? "new" : "remove";
  }

  if (effectiveStatus === "remove") {
    await deleteLocalCard(normalizedWord, aliases, userId);
    if (dbUp) {
      try {
        await db
          .delete(srsCard)
          .where(
            and(
              eq(srsCard.word, normalizedWord),
              inArray(srsCard.language, aliases),
              eq(srsCard.userId, userId)
            )
          );
      } catch (err) {
        console.error("setWordStatus remove DB error:", err);
      }
    }
    try {
      revalidatePath("/progress");
      revalidatePath("/words");
    } catch {}
    return { success: true, word: normalizedWord, status: "remove" };
  }

  const translation = metadata?.translation || word;
  let cefrLevel = metadata?.cefrLevel || null;
  const pos = metadata?.pos || null;

  if (!cefrLevel) {
    try {
      const levelMap = await getWordToLevelMap();
      cefrLevel = levelMap[normalizedWord] || "A1";
    } catch {
      cefrLevel = "A1";
    }
  }

  const reps = effectiveStatus === "learned" ? 10 : effectiveStatus === "learning" ? 1 : 0;
  const interval = effectiveStatus === "learned" ? 36500 : effectiveStatus === "learning" ? 1 : 0;
  const now = new Date();

  // 1. Always save locally first for instant file persistence
  await upsertLocalCard({
    word: normalizedWord,
    language: aliases[0] || langKey,
    userId,
    status: effectiveStatus,
    translation,
    cefrLevel,
    pos,
    nextReviewAt: effectiveStatus === "learning" ? now.toISOString() : null,
    lastReviewedAt: effectiveStatus === "learned" ? now.toISOString() : null,
    interval,
    repetitions: reps,
  });

  // 2. Also save to DB if available.
  if (dbUp) {
    try {
      const [existing] = await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.word, normalizedWord),
            inArray(srsCard.language, aliases),
            eq(srsCard.userId, userId)
          )
        );

      if (existing) {
        await db
          .update(srsCard)
          .set({
            status: effectiveStatus,
            translation: metadata?.translation || existing.translation,
            cefrLevel: cefrLevel || existing.cefrLevel,
            pos: pos || existing.pos,
            nextReviewAt: effectiveStatus === "learning" ? now : null,
            lastReviewedAt: effectiveStatus === "learned" ? now : null,
            interval,
            repetitions: reps,
          })
          .where(
            and(
              eq(srsCard.word, existing.word),
              eq(srsCard.language, existing.language),
              eq(srsCard.userId, userId)
            )
          );
      } else {
        await db
          .insert(srsCard)
          .values({
            word: normalizedWord,
            language: aliases[0] || langKey,
            userId,
            translation,
            cefrLevel,
            pos,
            status: effectiveStatus,
            nextReviewAt: effectiveStatus === "learning" ? now : null,
            lastReviewedAt: effectiveStatus === "learned" ? now : null,
            interval,
            repetitions: reps,
          })
          .onConflictDoUpdate({
            target: [srsCard.word, srsCard.language, srsCard.userId],
            set: {
              status: effectiveStatus,
              translation,
              cefrLevel: cefrLevel || sql`COALESCE(${srsCard.cefrLevel}, ${cefrLevel})`,
              pos: pos || sql`COALESCE(${srsCard.pos}, ${pos})`,
              nextReviewAt: effectiveStatus === "learning" ? now : null,
              lastReviewedAt: effectiveStatus === "learned" ? now : null,
              interval,
              repetitions: reps,
            },
          });
        }
      } catch (err) {
        console.error("setWordStatus DB error:", err);
      }
    }

  try {
    revalidatePath("/progress");
    revalidatePath("/words");
  } catch {}

  return { success: true, word: normalizedWord, status: effectiveStatus };
}

export async function getNewCards(language: string, limit = 20) {
  const userId = await getSafeUserId();
  const aliases = getLanguageAliases(language);

  if (await isDbAvailable()) {
    try {
      return await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.userId, userId),
            inArray(srsCard.language, aliases),
            eq(srsCard.status, "new")
          )
        )
        .orderBy(asc(srsCard.createdAt))
        .limit(limit);
    } catch {}
  }

  const local = await getLocalCards(userId, aliases);
  return local
    .filter((c) => c.status === "new")
    .slice(0, limit)
    .map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      nextReviewAt: null,
      lastReviewedAt: null,
    }));
}

export async function introduceNewCards(language: string, count_: number) {
  const userId = await getSafeUserId();
  const aliases = getLanguageAliases(language);
  const now = new Date();

  const cards = await getNewCards(language, count_);
  if (cards.length === 0) return [];

  for (const card of cards) {
    await upsertLocalCard({
      word: card.word,
      language: card.language,
      userId,
      status: "learning",
      nextReviewAt: now.toISOString(),
    });
  }

  if (await isDbAvailable()) {
    try {
      await db
        .update(srsCard)
        .set({
          status: "learning",
          nextReviewAt: now,
        })
        .where(
          and(
            eq(srsCard.userId, userId),
            inArray(srsCard.language, aliases),
            eq(srsCard.status, "new"),
            inArray(
              srsCard.word,
              cards.map((c) => c.word)
            )
          )
        );
    } catch {}
  }

  return cards.map((c) => ({ ...c, status: "learning" as const, nextReviewAt: now }));
}

export async function recordWordPractice(
  userId: string,
  word: string,
  language: string,
  translation: string,
  correct: boolean
) {
  const normalizedWord = word.toLowerCase().trim();
  const aliases = getLanguageAliases(language);
  const local = await getLocalCard(normalizedWord, aliases, userId);

  // Look up CEFR level if missing
  let cefrLevel = local?.cefrLevel || null;
  const pos = local?.pos || null;
  if (!cefrLevel) {
    try {
      const levelMap = await getWordToLevelMap();
      cefrLevel = levelMap[normalizedWord] || null;
    } catch {}
  }

  const previousReps = local?.repetitions ?? 0;
  const previousStatus = local?.status ?? "new";

  // Rule:
  // "learning" = once student encounter the word in any exercise
  // word status = "learned" if correct more or equal 3 times and also when student selected "learned" in flashcard review
  let repetitions = correct ? previousReps + 1 : previousReps;
  let finalStatus: CardStatus = "learning";

  if (previousStatus === "learned" || repetitions >= 3) {
    finalStatus = "learned";
    repetitions = Math.max(repetitions, 3);
  } else {
    finalStatus = "learning";
  }

  const nextReviewAt = new Date();
  if (finalStatus === "learned") {
    nextReviewAt.setDate(nextReviewAt.getDate() + 30);
  } else {
    nextReviewAt.setDate(nextReviewAt.getDate() + 1);
  }

  await upsertLocalCard({
    word: normalizedWord,
    language: aliases[0] || language,
    userId,
    translation: translation || local?.translation || word,
    cefrLevel,
    pos,
    status: finalStatus,
    easeFactor: local?.easeFactor ?? 2.5,
    interval: finalStatus === "learned" ? 36500 : 1,
    repetitions,
    nextReviewAt: nextReviewAt.toISOString(),
    lastReviewedAt: new Date().toISOString(),
  });

  if (await isDbAvailable()) {
    try {
      const [existing] = await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.word, normalizedWord),
            eq(srsCard.language, language),
            eq(srsCard.userId, userId)
          )
        );

      if (!existing) {
        await db.insert(srsCard).values({
          word: normalizedWord,
          language: aliases[0] || language,
          userId,
          translation: translation || word,
          cefrLevel,
          pos,
          status: finalStatus,
          easeFactor: 2.5,
          interval: finalStatus === "learned" ? 36500 : 1,
          repetitions,
          nextReviewAt,
          lastReviewedAt: new Date(),
        }).onConflictDoNothing();
      } else {
        await db
          .update(srsCard)
          .set({
            status: finalStatus,
            cefrLevel: cefrLevel || existing.cefrLevel,
            repetitions,
            interval: finalStatus === "learned" ? 36500 : 1,
            nextReviewAt,
            lastReviewedAt: new Date(),
          })
          .where(
            and(
              eq(srsCard.word, normalizedWord),
              eq(srsCard.language, language),
              eq(srsCard.userId, userId)
            )
          );
      }
    } catch {}
  }
}

export async function recordWordPracticeBatch(
  userId: string,
  practices: {
    word: string;
    correct: boolean;
    translation?: string;
    /** SM-2 quality 0–5. Present for graded (translation) exercises; absent
     *  for binary callers (flashcard, chat) which fall back to the all-or-nothing
     *  path. */
    quality?: number;
  }[],
  language: string
): Promise<{
  learningAdded: number;
  masteredAdded: number;
  totalPracticed: number;
  /** Distinct words in this batch that ended up in learning/learned status.
   *  Unlike learningAdded (a new->learning delta), this is always meaningful:
   *  it is the number of words this lesson actually contributed to the
   *  learner's active vocabulary, so the completion screen never shows a
   *  misleading 0 just because the words were already "learning". */
  activeCount: number;
}> {
  if (!userId || practices.length === 0)
    return { learningAdded: 0, masteredAdded: 0, totalPracticed: 0, activeCount: 0 };

  const targetLang = (language || "en").toLowerCase().trim();
  const aliases = getLanguageAliases(targetLang);
  const primaryLang = aliases[0] || targetLang;

  const wordMap = new Map<string, { correctCount: number; totalCount: number; translation?: string; quality?: number }>();
  for (const p of practices) {
    const norm = p.word.toLowerCase().trim();
    if (!norm) continue;
    const existing = wordMap.get(norm);
    if (existing) {
      if (p.correct) existing.correctCount++;
      existing.totalCount++;
      if (p.translation) existing.translation = p.translation;
      if (typeof p.quality === "number") {
        // A word may appear in several sentences in one lesson; keep the worst
        // (lowest) quality so a single poor attempt never gets averaged away.
        existing.quality =
          existing.quality === undefined
            ? p.quality
            : Math.min(existing.quality, p.quality);
      }
    } else {
      wordMap.set(norm, {
        correctCount: p.correct ? 1 : 0,
        totalCount: 1,
        translation: p.translation,
        quality: typeof p.quality === "number" ? p.quality : undefined,
      });
    }
  }

  const uniqueWords = Array.from(wordMap.keys());
  if (uniqueWords.length === 0)
    return { learningAdded: 0, masteredAdded: 0, totalPracticed: 0, activeCount: 0 };

  const localCards = await getLocalCards(userId, aliases);
  const localCardMap = new Map<string, SrsCardRecord>();
  localCards.forEach((c) => {
    const key = c.word.toLowerCase().trim();
    if (!localCardMap.has(key)) localCardMap.set(key, c);
  });

  // Gate on hasDbConfig, not the flaky cold-start probe. Reading existing rows
  // matters here: without it, previousStatus/reps default to new/0 and a word
  // that was already "learning"/"mastered" gets reset instead of incremented.
  const dbUp = hasDbConfig;
  const dbCardMap = new Map<string, typeof srsCard.$inferSelect>();
  if (dbUp) {
    try {
      const dbRows = await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.userId, userId),
            inArray(srsCard.word, uniqueWords)
          )
        );
      dbRows.forEach((r) => dbCardMap.set(r.word.toLowerCase().trim(), r));
    } catch (err) {
      console.warn("recordWordPracticeBatch DB fetch failed:", err);
    }
  }

  let levelMap: Record<string, string> = {};
  try {
    levelMap = (await getWordToLevelMap()) as Record<string, string>;
  } catch {}

  const now = new Date();
  const localUpdatesToSave: (Partial<SrsCardRecord> & { word: string; language: string; userId: string })[] = [];
  const dbInsertsToSave: (typeof srsCard.$inferInsert)[] = [];

  // Count the transitions this batch actually caused, so the lesson-complete
  // screen can show how many words moved from "new" -> "learning" and how many
  // crossed into "learned" this lesson (rather than a hard-coded gamification
  // number with no observable meaning).
  let learningAdded = 0;
  let masteredAdded = 0;
  let activeCount = 0;

  for (const [normWord, data] of wordMap.entries()) {
    const local = localCardMap.get(normWord);
    const dbCard = dbCardMap.get(normWord);

    const cefrLevel = local?.cefrLevel || dbCard?.cefrLevel || levelMap[normWord] || null;
    const pos = local?.pos || dbCard?.pos || null;
    const translation = data.translation || local?.translation || dbCard?.translation || normWord;

    const previousReps = local?.repetitions ?? dbCard?.repetitions ?? 0;
    const previousStatus = local?.status ?? dbCard?.status ?? "new";

    // Per-word SRS update. When the practice carries a graded `quality`
    // (translation exercises grade the whole sentence 0–100 → quality 1–5),
    // drive the schedule with SM-2 so a low score actually demotes words
    // (knocks a "learned" card back to "learning") instead of the
    // all-or-nothing binary used by the flashcard / chat path.
    let easeFactor = local?.easeFactor ?? dbCard?.easeFactor ?? 2.5;
    let repetitions: number;
    let finalStatus: CardStatus;

    if (typeof data.quality === "number") {
      const sm = calculateNextReview(
        {
          easeFactor,
          interval: local?.interval ?? dbCard?.interval ?? 0,
          repetitions: previousReps,
          status: previousStatus as CardStatus,
        },
        data.quality as Quality
      );
      repetitions = sm.repetitions;
      easeFactor = sm.easeFactor;
      // SM-2 has a "review" state; fold it into "learned" for the store's
      // four-state model (new / learning / learned), matching the binary path.
      const rawStatus = sm.status;
      finalStatus = rawStatus === "review" ? "learned" : rawStatus;
    } else {
      const isAllCorrect = data.correctCount === data.totalCount;
      repetitions = isAllCorrect ? previousReps + 1 : previousReps;
      if (previousStatus === "learned" || repetitions >= 3) {
        finalStatus = "learned";
        repetitions = Math.max(repetitions, 3);
      } else {
        finalStatus = "learning";
      }
    }

    if (finalStatus === "learned") {
      repetitions = Math.max(repetitions, 3);
    }

    // Track transitions caused by THIS lesson so the lesson-complete screen can
    // show meaningful numbers instead of an opaque XP total.
    if (previousStatus === "new" && finalStatus === "learning") learningAdded++;
    if (previousStatus !== "learned" && finalStatus === "learned") masteredAdded++;
    // Every distinct word this lesson touched is now in the active set
    // ("learning" or "learned"), so count it as a word added to the learner's
    // vocabulary. This never collapses to a misleading 0 just because the words
    // were already past "new".
    if (finalStatus === "learning" || finalStatus === "learned") activeCount++;

    const nextReviewAt = new Date(now);
    if (finalStatus === "learned") {
      nextReviewAt.setDate(nextReviewAt.getDate() + 30);
    } else {
      nextReviewAt.setDate(nextReviewAt.getDate() + 1);
    }

    localUpdatesToSave.push({
      word: normWord,
      language: primaryLang,
      userId,
      translation,
      cefrLevel,
      pos,
      status: finalStatus,
      easeFactor,
      interval: finalStatus === "learned" ? 36500 : 1,
      repetitions,
      nextReviewAt: nextReviewAt.toISOString(),
      lastReviewedAt: now.toISOString(),
    });

    dbInsertsToSave.push({
      word: normWord,
      language: primaryLang,
      userId,
      translation,
      cefrLevel,
      pos,
      status: finalStatus,
      easeFactor,
      interval: finalStatus === "learned" ? 36500 : 1,
      repetitions,
      nextReviewAt,
      lastReviewedAt: now,
    });
  }

  try {
    await upsertLocalCardsBatch(localUpdatesToSave);
  } catch (err) {
    console.error("recordWordPracticeBatch local store error:", err);
  }

  // Gate the Postgres write on hasDbConfig (DB URL present), NOT on the flaky
  // isDbAvailable() probe. On a cold serverless invocation the probe can time
  // out before the 10s connect handshake, return false, and silently drop every
  // learning/mastered upsert — which is exactly the "new shows up but
  // learning/mastered stay 0" bug. If the URL is set we attempt the write and
  // let the try/catch absorb a genuine failure instead of guessing.
  if (hasDbConfig && dbInsertsToSave.length > 0) {
    const upsertRows = async (rows: (typeof srsCard.$inferInsert)[]) => {
      await db
        .insert(srsCard)
        .values(rows)
        .onConflictDoUpdate({
          target: [srsCard.word, srsCard.language, srsCard.userId],
          set: {
            status: sql`excluded.status`,
            cefrLevel: sql`COALESCE(excluded.cefr_level, ${srsCard.cefrLevel})`,
            repetitions: sql`excluded.repetitions`,
            interval: sql`excluded.interval`,
            nextReviewAt: sql`excluded.next_review_at`,
            lastReviewedAt: sql`excluded.last_reviewed_at`,
          },
        });
    };

    try {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < dbInsertsToSave.length; i += CHUNK_SIZE) {
        const chunk = dbInsertsToSave.slice(i, i + CHUNK_SIZE);
        await upsertRows(chunk);
      }
      console.log(
        `[srs] recordWordPracticeBatch: upserted ${dbInsertsToSave.length} card(s) for user ${userId}`,
      );
    } catch (err) {
      // One rejected row used to discard the ENTIRE batch, so a completed
      // lesson recorded zero words and the Progress page kept reporting every
      // word as "new". Retry row-by-row so the rest survive, and report both
      // counts so the failure is visible instead of silent.
      console.warn(
        `[srs] recordWordPracticeBatch: batch upsert failed for ${dbInsertsToSave.length} card(s):`,
        err,
      );
      let ok = 0;
      const failures: string[] = [];
      for (const row of dbInsertsToSave) {
        try {
          await upsertRows([row]);
          ok++;
        } catch (rowErr) {
          failures.push(`${row.word} (${row.language}): ${String(rowErr)}`);
        }
      }
      console.warn(
        `[srs] recordWordPracticeBatch: per-row retry -> ${ok} ok, ${failures.length} failed`,
      );
      if (failures.length > 0) {
        console.warn("[srs] recordWordPracticeBatch failures:", failures.slice(0, 10));
      }
    }
  }

  return {
    learningAdded,
    masteredAdded,
    totalPracticed: wordMap.size,
    activeCount,
  };
}

export async function addAllLevelWordsToMyWords(
  level: string,
  language: string = "en"
): Promise<{
  success: boolean;
  message: string;
  addedCount: number;
  totalInLevel: number;
}> {
  const session = await getSession();
  if (!session?.user?.email) {
    return { success: false, message: "Authentication required", addedCount: 0, totalInLevel: 0 };
  }
  const { isAdminEmail } = await import("@/lib/ai/models");
  if (!isAdminEmail(session.user.email)) {
    return {
      success: false,
      message: "Only Alan P can bulk add level words directly to My Words.",
      addedCount: 0,
      totalInLevel: 0,
    };
  }

  const userId = session.user.id;
  const normLevel = level.toUpperCase().trim();
  const { loadEnLevelWords } = await import("@/lib/words");
  const words = await loadEnLevelWords(normLevel);

  if (!words || words.length === 0) {
    return {
      success: false,
      message: `No words found for level ${normLevel}`,
      addedCount: 0,
      totalInLevel: 0,
    };
  }

  const aliases = getLanguageAliases(language);
  const existingCards = await getLocalCards(userId, aliases);
  const existingMap = new Map<string, (typeof existingCards)[0]>();
  for (const c of existingCards) {
    existingMap.set(c.word.toLowerCase().trim(), c);
  }

  let addedCount = 0;
  const now = new Date();
  const nextReview = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Batch add to local store
  for (const w of words) {
    const wordLower = w.word.toLowerCase().trim();
    const existing = existingMap.get(wordLower);

    if (!existing) {
      await upsertLocalCard({
        word: wordLower,
        language: aliases[0] || "en",
        userId,
        translation: w.english_translation || w.definition_zh || w.word,
        cefrLevel: normLevel,
        pos: w.pos || "noun",
        status: "learning",
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        nextReviewAt: nextReview,
        createdAt: now.toISOString(),
      });
      addedCount++;
    }
  }

  // Also bulk insert to DB if available
  if (await isDbAvailable()) {
    try {
      const recordsToInsert = words
        .filter((w) => !existingMap.has(w.word.toLowerCase().trim()))
        .map((w) => ({
          word: w.word.toLowerCase().trim(),
          language: aliases[0] || "en",
          userId,
          translation: w.english_translation || w.definition_zh || w.word,
          cefrLevel: normLevel,
          pos: w.pos || "noun",
          status: "learning",
          easeFactor: 2.5,
          interval: 1,
          repetitions: 0,
          nextReviewAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          createdAt: now,
        }));

      const chunkSize = 200;
      for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
        const chunk = recordsToInsert.slice(i, i + chunkSize);
        if (chunk.length > 0) {
          await db.insert(srsCard).values(chunk).onConflictDoNothing();
        }
      }
    } catch (err) {
      console.error("DB batch insert error:", err);
    }
  }

  try {
    revalidatePath("/progress");
    revalidatePath("/words");
  } catch {}

  return {
    success: true,
    message: `Added ${addedCount} words from ${normLevel} to My Words (${words.length - addedCount} were already in My Words)!`,
    addedCount,
    totalInLevel: words.length,
  };
}

export async function recordChatExerciseResult(
  exercise: Exercise,
  correct: boolean,
  language: string
) {
  const userId = await getSafeUserId();
  const words = extractSrsWords(exercise);
  if (words.length > 0) {
    await recordWordPracticeBatch(
      userId,
      words.map((w) => ({ word: w, correct })),
      language
    );
  }
}

export async function syncOwnerLibraryToSrs(userId: string) {
  const { loadLanguageRaw } = await import("@/lib/words");
  const allDictWords = await loadLanguageRaw("en");
  if (!allDictWords || allDictWords.length === 0) return;

  const aliases = getLanguageAliases("en");
  const dbUp = await isDbAvailable();
  if (!dbUp) return;

  try {
    // 1. Fetch all words already in Alan's SRS deck
    const existingRows = await db
      .select({ word: srsCard.word })
      .from(srsCard)
      .where(and(eq(srsCard.userId, userId), inArray(srsCard.language, aliases)));

    const existingSet = new Set(existingRows.map((r) => r.word.toLowerCase().trim()));

    // 2. Identify newly added words from english_merged.json
    const missingWords = allDictWords.filter(
      (w) => !existingSet.has(w.word.toLowerCase().trim())
    );

    if (missingWords.length === 0) return;

    // 3. Batch insert missing words with status: "new"
    const now = new Date();
    const recordsToInsert = missingWords.map((w) => ({
      word: w.word.toLowerCase().trim(),
      language: "en",
      userId,
      translation: w.english_translation || w.definition_zh || w.word,
      cefrLevel: (w.cefr_level || "A1").toUpperCase().trim(),
      pos: w.pos || "noun",
      status: "new",
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewAt: null,
      createdAt: now,
    }));

    const CHUNK_SIZE = 500;
    for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
      const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
      await db.insert(srsCard).values(chunk).onConflictDoNothing();
    }
  } catch (err) {
    console.error("syncOwnerLibraryToSrs error:", err);
  }
}


const userSyncMap = new Map<string, number>();
const inFlightSync = new Map<string, Promise<void>>();

export async function syncUserCourseWordsToSrs(userId: string, force = false, overrideEmail?: string): Promise<void> {
  if (!userId || userId === "default_user") return;

  // Deduplicate concurrent calls (e.g. from Promise.all([getAllCards, getSrsStats]))
  if (inFlightSync.has(userId)) {
    return inFlightSync.get(userId);
  }

  // Throttle repeated calls for the same user within 60 seconds (unless forced)
  if (!force) {
    const lastSync = userSyncMap.get(userId) || 0;
    if (Date.now() - lastSync < 60000) return;
  }

  const promise = (async () => {
    try {
      const { getLocalCourseEnrollments, addLocalCourseEnrollment, upsertLocalCardsBatch } = await import("@/lib/srs-store");
      // Gate on hasDbConfig, NOT the isDbAvailable() probe. A cold-start
      // false-negative here used to make dbUp=false, which pushed this function
      // down the "no enrollments" branch and DELETED the user's new/0-rep
      // cards (see the delete below) even though they were perfectly valid.
      // hasDbConfig cannot lie: the DB URL is present or it isn't.
      const dbUp = hasDbConfig;

      // Automatically purge junk / non-word scraped entries from database
      if (dbUp) {
        const JUNK_WORDS = [
          "est", "dev", "md", "vol", "src", "dsl", "pda", "faqs", 
          "zum", "diff", "trackback", "kentucky", "eric", "taylor", "webmaster"
        ];
        try {
          await db.delete(srsCard).where(inArray(srsCard.word, JUNK_WORDS));
        } catch (err) {
          console.warn("Junk words purge warning:", err);
        }
      }

      // 1. Resolve the user's enrolled courses + standalone units. These three
      // DB reads are independent, so run them concurrently — on a cold
      // serverless instance the old serial round-trips added up and the
      // 2412-word sync timed out mid-insert, which is why "New" only trickled
      // in across several manual refreshes. The existing-card read is also
      // independent, so kick it off in parallel too.
      const enrolledCourseIds = new Set<string>();
      const standaloneUnitIds = new Set<string>();
      // Tracks whether the enrollment lookups actually succeeded, so the
      // destructive prune further down only runs on trustworthy emptiness.
      let enrollmentLookupOk = false;
      // Pre-declared so the parallel existing-rows read can populate it.
      const existingSet = new Set<string>();

      const localEnrollments = await getLocalCourseEnrollments(userId);

      const existingRowsPromise = dbUp
        ? db
            .select({ word: srsCard.word })
            .from(srsCard)
            .where(eq(srsCard.userId, userId))
            .catch(() => [])
        : Promise.resolve([] as { word: string }[]);

      if (dbUp) {
        try {
          const { SYSTEM_COURSE_IDS } = await import("@/lib/db/queries/courses");
          const [enrollments, createdCourses, libraryUnitRows] = await Promise.all([
            db
              .select({ courseId: userCourseEnrollment.courseId })
              .from(userCourseEnrollment)
              .where(eq(userCourseEnrollment.userId, userId)),
            db
              .select({ id: course.id })
              .from(course)
              .where(eq(course.createdBy, userId)),
            db
              .select({ unitId: userUnitLibrary.unitId, courseId: unit.courseId })
              .from(userUnitLibrary)
              .innerJoin(unit, eq(unit.id, userUnitLibrary.unitId))
              .where(eq(userUnitLibrary.userId, userId)),
          ]);
          enrollments.forEach((e) => enrolledCourseIds.add(e.courseId));
          createdCourses.forEach((c) => {
            if (!SYSTEM_COURSE_IDS.includes(c.id)) enrolledCourseIds.add(c.id);
          });
          libraryUnitRows.forEach((u) => {
            if (u.courseId) enrolledCourseIds.add(u.courseId);
            else standaloneUnitIds.add(u.unitId);
          });
          enrollmentLookupOk = true;
        } catch {}
      }

      localEnrollments.forEach((id) => enrolledCourseIds.add(id));

      if (enrolledCourseIds.size === 0 && standaloneUnitIds.size === 0) {
        // Only prune if we can trust the emptiness — i.e. the DB was reachable
        // and the enrollment queries actually succeeded. A swallowed query error
        // would otherwise look identical to "user has no courses" and wipe the
        // user's new cards.
        if (dbUp && enrollmentLookupOk) {
          try {
            await db.delete(srsCard).where(
              and(
                eq(srsCard.userId, userId),
                eq(srsCard.status, "new"),
                eq(srsCard.repetitions, 0)
              )
            );
          } catch {}
        }
        return;
      }

      // 2. Fetch all units for enrolled courses or standalone library units from DB and filesystem
      const unitConditions = [];
      if (enrolledCourseIds.size > 0) {
        unitConditions.push(inArray(unit.courseId, Array.from(enrolledCourseIds)));
      }
      if (standaloneUnitIds.size > 0) {
        unitConditions.push(inArray(unit.id, Array.from(standaloneUnitIds)));
      }

      let activeUnits: { id: string; markdown: string; level: string | null; targetLanguage: string | null }[] = [];
      if (dbUp && unitConditions.length > 0) {
        try {
          activeUnits = await db
            .select({
              id: unit.id,
              markdown: unit.markdown,
              level: unit.level,
              targetLanguage: unit.targetLanguage,
            })
            .from(unit)
            .where(or(...unitConditions));
        } catch (err) {
          console.warn("Error fetching units from DB in syncUserCourseWordsToSrs:", err);
        }
      }

      // Also merge filesystem units for enrolled courses to prevent missing SRS cards if DB is out of sync
      const { loadContentDir, getUnitLessonsSafe } = await import("@/lib/content/loader");
      const { units: fsUnits } = loadContentDir();
      const dictLevelMap = (await getWordToLevelMap().catch(() => ({}))) as Record<string, string>;

      const unitMap = new Map<string, { id: string; markdown: string; level: string; targetLanguage: string }>();

      for (const u of activeUnits) {
        if (u.id && u.markdown) {
          unitMap.set(u.id, {
            id: u.id,
            markdown: u.markdown,
            level: u.level || "A1",
            targetLanguage: u.targetLanguage || "en",
          });
        }
      }

      for (const fsu of fsUnits) {
        const cId = fsu.parsed.courseId;
        if (cId && enrolledCourseIds.has(cId)) {
          const match = fsu.parsed.title.match(/Unit\s+(\d+)/i);
          const unitNum = match ? parseInt(match[1], 10) : null;
          const uId = unitNum ? `${cId}-unit-${unitNum}` : `${cId}-${fsu.parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          unitMap.set(uId, {
            id: uId,
            markdown: fsu.markdown,
            level: fsu.parsed.level || "A1",
            targetLanguage: fsu.parsed.targetLanguage || "en",
          });
        }
      }

      const allActiveUnits = Array.from(unitMap.values());
      if (allActiveUnits.length === 0) return;

      // Resolve the existing-card read we kicked off in parallel above, then
      // fold in the local store so cards written there (but not yet replicated
      // to Postgres) still count.
      if (dbUp) {
        try {
          const existingRows = await existingRowsPromise;
          existingRows.forEach((r) => existingSet.add(r.word.toLowerCase().trim()));
        } catch {}
      }

      const localCards = await getLocalCards(userId);
      localCards.forEach((c) => existingSet.add(c.word.toLowerCase().trim()));

      const activeLibraryWords = new Set<string>();
      const now = new Date();
      const recordsToInsert: {
        word: string;
        language: string;
        userId: string;
        translation: string;
        cefrLevel: string;
        pos: string;
        status: "new";
        easeFactor: number;
        interval: number;
        repetitions: number;
        nextReviewAt: null;
        createdAt: Date;
      }[] = [];

      const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

      for (const u of allActiveUnits) {
        if (!u.markdown) continue;
        const { lessons } = getUnitLessonsSafe(u.markdown);
        const unitLvl = (u.level || "A1").toUpperCase().trim();
        const maxLvlRank = LEVEL_ORDER[unitLvl] || 6;
        const lang = u.targetLanguage || "en";

        for (const lesson of lessons) {
          for (const ex of lesson.exercises) {
            const exAny = ex as unknown as Record<string, unknown>;
            const words = extractSrsWords(ex);
            const frontWord = typeof exAny.front === "string" ? exAny.front.toLowerCase().trim() : null;
            const targetWords = words.length > 0 ? words : frontWord ? [frontWord] : [];

            for (const w of targetWords) {
              const normWord = w.toLowerCase().trim();
              if (!normWord) continue;
              const dictLvl = dictLevelMap[normWord];
              // Count every valid word that belongs to the enrolled course/unit:
              // a dictionary word OR an explicit flashcard/unit front word.
              // We no longer skip words whose dictionary CEFR level is above the
              // course level — the user expects every word in their library to
              // surface as "new", and skipping them also broke the reset-to-new
              // flow (those cards were treated as "not in library" and removed).
              if (!dictLvl && frontWord !== normWord) {
                continue;
              }
              activeLibraryWords.add(normWord);
              if (!existingSet.has(normWord)) {
                existingSet.add(normWord);
                const translationStr = typeof exAny.translation === "string" ? exAny.translation : typeof exAny.meaning === "string" ? exAny.meaning : normWord;
                const rawCefrLevel = typeof exAny.cefrLevel === "string" ? exAny.cefrLevel.toUpperCase().trim() : unitLvl;
                const cefrLevelStr = dictLvl || rawCefrLevel;
                const posStr = typeof exAny.pos === "string" ? exAny.pos : "noun";

                recordsToInsert.push({
                  word: normWord,
                  language: lang,
                  userId,
                  translation: translationStr,
                  cefrLevel: cefrLevelStr,
                  pos: posStr,
                  status: "new",
                  easeFactor: 2.5,
                  interval: 0,
                  repetitions: 0,
                  nextReviewAt: null,
                  createdAt: now,
                });
              }
            }
          }
        }
      }

      // Clean up any stale "new" cards that are NOT in activeLibraryWords (e.g. from removed courses or previous full-dictionary imports)
      if (dbUp) {
        try {
          const activeWordsArr = Array.from(activeLibraryWords);
          // Never delete a word the learner has actually practised. A card can
          // legitimately sit at status="new" with repetitions=0 in the DB while
          // the local store holds real progress for it (the Postgres write is
          // best-effort). Purging on the DB alone would destroy that progress,
          // so only words that are un-practised in BOTH stores are removed.
          const practisedLocally = new Set<string>();
          for (const lc of await getLocalCards(userId)) {
            if (lc.status !== "new" || (lc.repetitions ?? 0) > 0 || lc.lastReviewedAt) {
              practisedLocally.add(lc.word.toLowerCase().trim());
            }
          }
          // Both guards must apply to the SAME statement. Running them as two
          // separate deletes ORs the conditions instead of ANDing them, which
          // means every un-practised new card gets wiped — including the words
          // of courses still sitting on the learner's shelf. A card is only
          // stale when it is un-practised in BOTH stores AND no longer backed
          // by an enrolled course/unit.
          const staleConditions = [
            eq(srsCard.userId, userId),
            eq(srsCard.status, "new"),
            eq(srsCard.repetitions, 0),
          ];
          if (activeWordsArr.length > 0) {
            staleConditions.push(notInArray(srsCard.word, activeWordsArr));
          }
          if (practisedLocally.size > 0) {
            staleConditions.push(notInArray(srsCard.word, Array.from(practisedLocally)));
          }
          await db.delete(srsCard).where(and(...staleConditions));
        } catch (err) {
          console.warn("Cleanup stale new words warning:", err);
        }
      }

      if (recordsToInsert.length > 0) {
        if (dbUp) {
          try {
            // Larger chunks = fewer round-trips. 500 rows × ~11 cols stays well
            // under Postgres' parameter limit, so the full 2412-word insert
            // finishes in ~5 statements instead of ~12.
            const CHUNK_SIZE = 500;
            for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
              const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
              await db.insert(srsCard).values(chunk).onConflictDoNothing();
            }
          } catch (err) {
            console.error("Error inserting cards to Postgres:", err);
          }
        }

        // Always save to local store as well so cards are accessible offline/in preview
        try {
          await upsertLocalCardsBatch(
            recordsToInsert.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            }))
          );
        } catch (err) {
          console.error("Error inserting cards to local store:", err);
        }
      }

      userSyncMap.set(userId, Date.now());
    } catch (err) {
      console.error("syncUserCourseWordsToSrs error:", err);
    } finally {
      inFlightSync.delete(userId);
    }
  })();

  inFlightSync.set(userId, promise);
  return promise;
}

export async function cleanupUnstudiedCourseWordsFromSrs(userId: string): Promise<void> {
  if (!userId || userId === "default_user") return;

  // Let any in-flight sync finish before forcing a rebuild.
  // syncUserCourseWordsToSrs dedupes on inFlightSync, so calling it while a
  // sync is still running hands back that promise — computed from the
  // before-removal library state — meaning the words of the course the user
  // just deleted would survive the cleanup.
  const running = inFlightSync.get(userId);
  if (running) {
    await running.catch(() => {});
  }

  userSyncMap.delete(userId);
  await syncUserCourseWordsToSrs(userId, true);
}

