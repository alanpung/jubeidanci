"use server";

import { db, isDbAvailable } from "@/lib/db";
import { user, srsCard, userStats, userPreferences } from "@/lib/db/schema";
import { eq, desc, sql, count, and, or } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { getLocalCards } from "@/lib/srs-store";
import { getEnLevelCounts } from "@/lib/words";

export interface StudentSummary {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  createdAt: Date;
  currentStreak: number;
  totalLessonsCompleted: number;
  wordsLearned: number;
  wordsLearning: number;
  targetLanguage: string;
}

export interface StudentSrsDetail {
  student: StudentSummary;
  cards: Array<{
    word: string;
    language: string;
    translation: string;
    cefrLevel: string | null;
    pos: string | null;
    status: string;
    easeFactor: number;
    interval: number;
    repetitions: number;
    nextReviewAt: Date | null;
    lastReviewedAt: Date | null;
    lastRating: string | null;
    createdAt: Date;
  }>;
  levelStats: Record<
    string,
    {
      wordCount: number;
      myWords: number;
      learned: number;
      learning: number;
      new: number;
      totalWords: number;
    }
  >;
  summary: {
    totalWords: number;
    totalWordCount: number;
    totalMyWords: number;
    totalLearned: number;
    totalLearning: number;
    totalNew: number;
    totalDue: number;
  };
}

/**
 * Fetch all registered students for the Author's Inspector.
 */
export async function getStudentsList(): Promise<StudentSummary[]> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized: Only authors can view student decks");
  }

  const dbUp = await isDbAvailable();
  if (!dbUp) {
    // Return author as fallback preview
    return [
      {
        id: session.user.id,
        name: session.user.name || "Default Student",
        email: session.user.email,
        image: session.user.image,
        createdAt: new Date(),
        currentStreak: 1,
        totalLessonsCompleted: 3,
        wordsLearned: 0,
        wordsLearning: 0,
        targetLanguage: "en",
      },
    ];
  }

  try {
    type UserSummaryRow = {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      created_at: Date;
      current_streak: number;
      total_lessons_completed: number;
      target_language: string | null;
      words_learned: number;
      words_learning: number;
    };

    const rows = await db.execute<UserSummaryRow>(sql`
      SELECT
        u.id,
        u.name,
        u.email,
        u.image,
        u.created_at,
        COALESCE(us.current_streak, 0)::int AS current_streak,
        COALESCE(us.total_lessons_completed, 0)::int AS total_lessons_completed,
        COALESCE(up.target_language, 'en') AS target_language,
        COUNT(CASE WHEN sc.status IN ('learned', 'review') OR sc.repetitions >= 3 THEN 1 END)::int AS words_learned,
        COUNT(CASE WHEN sc.status = 'learning' OR (sc.status NOT IN ('learned', 'review', 'new') AND sc.repetitions < 3) THEN 1 END)::int AS words_learning
      FROM "user" u
      LEFT JOIN user_stats us ON us.user_id = u.id
      LEFT JOIN user_preferences up ON up.user_id = u.id
      LEFT JOIN srs_card sc ON (sc.user_id = u.id OR LOWER(sc.user_id) = LOWER(u.email))
      GROUP BY u.id, u.name, u.email, u.image, u.created_at, us.current_streak, us.total_lessons_completed, up.target_language
      ORDER BY u.created_at DESC
    `);

    return Promise.all(
      rows.map(async (r) => {
        let learned = Number(r.words_learned) || 0;
        let learning = Number(r.words_learning) || 0;

        if (learned === 0 && learning === 0) {
          try {
            const allLocalCards = await getLocalCards();
            const localCards = allLocalCards.filter(
              (c) =>
                c.userId === r.id ||
                (r.email && c.userId?.toLowerCase() === r.email.toLowerCase())
            );
            learned = localCards.filter(
              (c) => c.status === "learned" || c.status === "review" || (c.repetitions && c.repetitions >= 3)
            ).length;
            learning = localCards.filter(
              (c) => c.status === "learning" || (c.status !== "learned" && c.status !== "review" && (!c.repetitions || c.repetitions < 3) && c.status !== "new")
            ).length;
          } catch {}
        }

        return {
          id: r.id,
          name: r.name || r.email.split("@")[0],
          email: r.email,
          image: r.image,
          createdAt: new Date(r.created_at),
          currentStreak: Number(r.current_streak) || 0,
          totalLessonsCompleted: Number(r.total_lessons_completed) || 0,
          wordsLearned: learned,
          wordsLearning: learning,
          targetLanguage: r.target_language || "en",
        };
      })
    );
  } catch (err) {
    console.error("Failed to fetch students list:", err);
    return [];
  }
}

/**
 * Fetch a specific student's complete SRS card deck and CEFR analytics.
 */
export async function getStudentSrsDeck(
  studentUserId: string,
  language: string = "en"
): Promise<StudentSrsDetail | null> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized: Only authors can view student decks");
  }

  try {
    const { syncUserCourseWordsToSrs } = await import("@/lib/actions/srs");
    await syncUserCourseWordsToSrs(studentUserId, true);
  } catch (err) {
    console.warn("getStudentSrsDeck sync warning:", err);
  }

  const dbUp = await isDbAvailable();
  let studentData: StudentSummary;
  let rawCards: Array<{
    word: string;
    language: string;
    translation: string;
    cefrLevel: string | null;
    pos: string | null;
    status: string;
    easeFactor: number;
    interval: number;
    repetitions: number;
    nextReviewAt: Date | null;
    lastReviewedAt: Date | null;
    lastRating: string | null;
    createdAt: Date;
  }> = [];

  const levelCounts = getEnLevelCounts();
  const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

  if (dbUp) {
    try {
      const [foundUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, studentUserId));

      const [stat] = await db
        .select()
        .from(userStats)
        .where(eq(userStats.userId, studentUserId));

      const [pref] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, studentUserId));

      const studentEmail = foundUser?.email?.toLowerCase();
      const isDefault = studentUserId === "default_user";
      const cards = await db
        .select()
        .from(srsCard)
        .where(
          isDefault
            ? eq(srsCard.userId, "default_user")
            : studentEmail
            ? or(
                eq(srsCard.userId, studentUserId),
                eq(sql`LOWER(${srsCard.userId})`, studentEmail)
              )
            : eq(srsCard.userId, studentUserId)
        )
        .orderBy(desc(srsCard.createdAt));

      if (cards.length > 0) {
        rawCards = cards.map((c) => ({
          word: c.word,
          language: c.language,
          translation: c.translation,
          cefrLevel: c.cefrLevel,
          pos: c.pos,
          status: c.status,
          easeFactor: c.easeFactor,
          interval: c.interval,
          repetitions: c.repetitions,
          nextReviewAt: c.nextReviewAt,
          lastReviewedAt: c.lastReviewedAt,
          lastRating: null,
          createdAt: c.createdAt,
        }));
      } else {
        const allLocal = await getLocalCards();
        const local = allLocal.filter((c) =>
          isDefault
            ? c.userId === "default_user"
            : c.userId === studentUserId ||
              (studentEmail && c.userId?.toLowerCase() === studentEmail)
        );
        rawCards = local.map((c) => ({
          word: c.word,
          language: c.language,
          translation: c.translation,
          cefrLevel: c.cefrLevel,
          pos: c.pos,
          status: c.status,
          easeFactor: c.easeFactor,
          interval: c.interval,
          repetitions: c.repetitions,
          nextReviewAt: c.nextReviewAt ? new Date(c.nextReviewAt) : null,
          lastReviewedAt: c.lastReviewedAt ? new Date(c.lastReviewedAt) : null,
          lastRating: c.lastRating,
          createdAt: new Date(c.createdAt),
        }));
      }

      studentData = {
        id: foundUser?.id || studentUserId,
        name: foundUser?.name || foundUser?.email?.split("@")[0] || "Student",
        email: foundUser?.email || "student@example.com",
        image: foundUser?.image || null,
        createdAt: foundUser?.createdAt || new Date(),
        currentStreak: stat?.currentStreak || 0,
        totalLessonsCompleted: stat?.totalLessonsCompleted || 0,
        wordsLearned: rawCards.filter((c) => c.status === "learned" || c.status === "review" || (c.repetitions && c.repetitions >= 3)).length,
        wordsLearning: rawCards.filter((c) => c.status === "learning" || (c.status !== "learned" && c.status !== "review" && (!c.repetitions || c.repetitions < 3) && c.status !== "new")).length,
        targetLanguage: pref?.targetLanguage || language,
      };
    } catch (err) {
      console.error("Failed to fetch student deck from DB:", err);
      // Fallback
      studentData = {
        id: studentUserId,
        name: "Student",
        email: "student@example.com",
        createdAt: new Date(),
        currentStreak: 0,
        totalLessonsCompleted: 0,
        wordsLearned: 0,
        wordsLearning: 0,
        targetLanguage: language,
      };
    }
  } else {
    // Local fallback
    const local = await getLocalCards(studentUserId);
    rawCards = local.map((c) => ({
      word: c.word,
      language: c.language,
      translation: c.translation,
      cefrLevel: c.cefrLevel,
      pos: c.pos,
      status: c.status,
      easeFactor: c.easeFactor,
      interval: c.interval,
      repetitions: c.repetitions,
      nextReviewAt: c.nextReviewAt ? new Date(c.nextReviewAt) : null,
      lastReviewedAt: c.lastReviewedAt ? new Date(c.lastReviewedAt) : null,
      lastRating: c.lastRating,
      createdAt: new Date(c.createdAt),
    }));

    studentData = {
      id: studentUserId,
      name: "Student",
      email: "student@example.com",
      createdAt: new Date(),
      currentStreak: 0,
      totalLessonsCompleted: 0,
      wordsLearned: rawCards.filter((c) => c.status === "learned" || c.status === "review" || (c.repetitions && c.repetitions >= 3)).length,
      wordsLearning: rawCards.filter((c) => c.status === "learning" || (c.status !== "learned" && c.status !== "review" && (!c.repetitions || c.repetitions < 3) && c.status !== "new")).length,
      targetLanguage: language,
    };
  }

  // Compute level stats strictly from the student's personal SRS deck
  const levelStats: Record<
    string,
    {
      wordCount: number;
      myWords: number;
      learned: number;
      learning: number;
      new: number;
      totalWords: number;
    }
  > = {};

  CEFR_LEVELS.forEach((lvl) => {
    const dictCount = levelCounts[lvl] || 0;
    levelStats[lvl] = {
      wordCount: dictCount,
      totalWords: dictCount,
      myWords: 0,
      learned: 0,
      learning: 0,
      new: 0,
    };
  });

  const now = new Date();
  let dueCount = 0;

  rawCards.forEach((c) => {
    const lvl = (c.cefrLevel || "").toUpperCase().trim();
    const targetLvl = CEFR_LEVELS.includes(lvl as (typeof CEFR_LEVELS)[number])
      ? lvl
      : "A1";

    const isLearned =
      c.status === "learned" ||
      c.status === "review" ||
      (c.repetitions && c.repetitions >= 3);

    const isLearning =
      c.status === "learning" ||
      (!isLearned && c.status !== "new" && (!c.repetitions || c.repetitions < 3));

    const isNew = c.status === "new";

    levelStats[targetLvl].myWords++;

    if (isLearned) {
      levelStats[targetLvl].learned++;
    } else if (isLearning) {
      levelStats[targetLvl].learning++;
    } else if (isNew) {
      levelStats[targetLvl].new++;
    }

    if (
      (c.status === "learning" || c.status === "review") &&
      c.nextReviewAt &&
      new Date(c.nextReviewAt) <= now
    ) {
      dueCount++;
    }
  });

  const totalMyWords = rawCards.length;
  const totalLearned = Object.values(levelStats).reduce((a, b) => a + b.learned, 0);
  const totalLearning = Object.values(levelStats).reduce((a, b) => a + b.learning, 0);
  const totalNew = Object.values(levelStats).reduce((a, b) => a + b.new, 0);
  const totalWordCount = Object.values(levelCounts).reduce((a, b) => a + b, 0);

  return {
    student: studentData,
    cards: rawCards,
    levelStats,
    summary: {
      totalWords: totalWordCount,
      totalWordCount,
      totalMyWords,
      totalLearned,
      totalLearning,
      totalNew,
      totalDue: dueCount,
    },
  };
}
