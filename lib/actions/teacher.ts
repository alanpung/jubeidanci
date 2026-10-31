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
    // DB unavailable: don't surface the owner (author) as a student.
    return [];
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
      WHERE u.id <> ${session.user.id}
        AND LOWER(u.email) <> LOWER(${session.user.email})
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

  // Compute level stats for the Student Inspector. This MUST mirror the
  // learner's own Progress page (progress-view.tsx) so the teacher sees the
  // exact numbers the student sees:
  //   - Mastered / Learning come from the FULL SRS deck (M ∪ L), independent of
  //     whether a word is still in My Books. Removing a book must NOT erase
  //     earned progress, so previously-studied words stay counted.
  //   - My Words = M ∪ L ∪ My Books: the union of mastered, learning and the
  //     student's CURRENT library vocabulary.
  //   - New = My Books words that are NOT yet mastered/learning. A My Books
  //     word that has been studied is folded into M/L and excluded from New.
  //     Stale "new" rows a removed course left behind are NOT part of My Books,
  //     so they never count as New (syncUserCourseWordsToSrs physically deletes
  //     them). This is what makes "New" drop to zero the moment My Books empties
  //     — instead of the old behaviour where every deck row (incl. orphans)
  //     was counted as My Words and every status='new' row as New.
  // The inspector always views a *student* (never the owner), so we use the
  // student branch of progress-view's logic.
  const normalizeLevel = (level?: string | null): string => {
    const raw = (level || "A1").toUpperCase().trim();
    return (CEFR_LEVELS as readonly string[]).includes(raw) ? raw : "A1";
  };

  const { getLibraryWordsWithLevels } = await import("@/lib/actions/srs");
  const libWordsWithLevels = await getLibraryWordsWithLevels(studentUserId).catch(
    () => [] as { word: string; level: string }[],
  );

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

  // Studied status per distinct word from the full deck (drives M/L totals).
  const studiedByWord = new Map<string, "learned" | "learning">();
  const learnedByLevel: Record<string, number> = {};
  const learningByLevel: Record<string, number> = {};
  CEFR_LEVELS.forEach((lvl) => {
    learnedByLevel[lvl] = 0;
    learningByLevel[lvl] = 0;
  });

  for (const c of rawCards) {
    const w = (c.word || "").toLowerCase().trim();
    if (!w) continue;
    const lvl = normalizeLevel(c.cefrLevel);
    if (c.status === "learning") {
      studiedByWord.set(w, "learning");
      learningByLevel[lvl]++;
    } else if (
      c.status === "learned" ||
      c.status === "review" ||
      (c.repetitions && c.repetitions >= 3)
    ) {
      studiedByWord.set(w, "learned");
      learnedByLevel[lvl]++;
    }
  }

  // My Words = M ∪ L ∪ My Books.
  const myWordsSets: Record<string, Set<string>> = {};
  const newByLevel: Record<string, number> = {};
  CEFR_LEVELS.forEach((lvl) => {
    myWordsSets[lvl] = new Set<string>();
    newByLevel[lvl] = 0;
  });

  // Start from My Books (current library vocabulary).
  for (const lw of libWordsWithLevels || []) {
    const w = (lw.word || "").toLowerCase().trim();
    if (!w) continue;
    const lvl = normalizeLevel(lw.level);
    myWordsSets[lvl].add(w);
    if (!studiedByWord.has(w)) newByLevel[lvl]++; // unstudied library word = New
  }
  // Fold in every Mastered/Learning word from the deck — even if its source
  // book was removed, earned progress stays counted as "my words".
  for (const c of rawCards) {
    const w = (c.word || "").toLowerCase().trim();
    if (!w || !studiedByWord.has(w)) continue;
    const lvl = normalizeLevel(c.cefrLevel);
    myWordsSets[lvl].add(w);
  }

  CEFR_LEVELS.forEach((lvl) => {
    levelStats[lvl].myWords = myWordsSets[lvl].size;
    levelStats[lvl].learned = learnedByLevel[lvl];
    levelStats[lvl].learning = learningByLevel[lvl];
    levelStats[lvl].new = newByLevel[lvl];
  });

  const now = new Date();
  let dueCount = 0;
  for (const c of rawCards) {
    if (
      (c.status === "learning" || c.status === "review") &&
      c.nextReviewAt &&
      new Date(c.nextReviewAt) <= now
    ) {
      dueCount++;
    }
  }

  const totalMyWords = Object.values(levelStats).reduce((a, b) => a + b.myWords, 0);
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
