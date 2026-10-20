import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { db, isDbAvailable } from "@/lib/db";
import { srsCard, lessonCompletion, exerciseAttempt } from "@/lib/db/schema";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { getLocalCards } from "@/lib/srs-store";
import { getUnitWithContent } from "@/lib/db/queries/courses";
import { extractSrsWords } from "@/lib/srs-words";

export const dynamic = "force-dynamic";

/**
 * Admin-only diagnostic for the "Learning count stays at 0" bug.
 *
 * It answers, in one response, the three questions that are otherwise only
 * visible in scattered Vercel logs:
 *   1. Is Postgres reachable at all, and what does srs_card actually hold?
 *   2. Were lessons really completed, and were per-exercise attempts recorded?
 *   3. For the most recent completed lesson, which words SHOULD have been
 *      written, and what is their real status in srs_card right now?
 */
export async function GET() {
  const session = await getSession();
  const email = session?.user?.email ?? null;

  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const userId = session!.user!.id;
  const dbUp = await isDbAvailable();
  const out: Record<string, unknown> = { userId, email, dbUp };

  if (dbUp) {
    try {
      const byStatus = await db
        .select({ status: srsCard.status, n: sql<number>`count(*)::int` })
        .from(srsCard)
        .where(eq(srsCard.userId, userId))
        .groupBy(srsCard.status);

      const byLanguage = await db
        .select({ language: srsCard.language, n: sql<number>`count(*)::int` })
        .from(srsCard)
        .where(eq(srsCard.userId, userId))
        .groupBy(srsCard.language);

      const attempts = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(exerciseAttempt)
        .where(eq(exerciseAttempt.userId, userId));

      const completions = await db
        .select()
        .from(lessonCompletion)
        .where(eq(lessonCompletion.userId, userId))
        .orderBy(desc(lessonCompletion.completedAt))
        .limit(5);

      out.dbByStatus = byStatus;
      out.dbByLanguage = byLanguage;
      out.exerciseAttempts = attempts?.[0]?.n ?? 0;
      out.lastCompletions = completions.map((c) => ({
        unitId: c.unitId,
        lessonIndex: c.lessonIndex,
        perfectScore: c.perfectScore,
        completedAt: c.completedAt,
      }));

      // For the newest completed lesson, show what should have been written
      // and what the card really looks like now.
      const last = completions[0];
      if (last) {
        const unitData = await getUnitWithContent(last.unitId);
        const lesson = unitData?.lessons?.[last.lessonIndex];
        const words = lesson
          ? lesson.exercises.flatMap((ex) => extractSrsWords(ex))
          : [];
        const unique: string[] = Array.from(
          new Set<string>(
            (words as string[]).map((w) => String(w).toLowerCase().trim()),
          ),
        ).filter(Boolean);

        const rows = unique.length
          ? await db
              .select({
                word: srsCard.word,
                status: srsCard.status,
                repetitions: srsCard.repetitions,
              })
              .from(srsCard)
              .where(
                and(eq(srsCard.userId, userId), inArray(srsCard.word, unique)),
              )
          : [];
        const statusOf = new Map<string, { status: string; repetitions: number }>();
        rows.forEach((r) => {
          statusOf.set(r.word.toLowerCase(), {
            status: r.status,
            repetitions: r.repetitions,
          });
        });

        out.lastLesson = {
          unitId: last.unitId,
          lessonIndex: last.lessonIndex,
          unitFound: Boolean(unitData),
          lessonFound: Boolean(lesson),
          exerciseCount: lesson?.exercises?.length ?? 0,
          extractedWordCount: unique.length,
          sample: unique.slice(0, 12).map((w) => ({
            word: w,
            inDb: statusOf.has(w),
            status: statusOf.get(w)?.status ?? null,
            repetitions: statusOf.get(w)?.repetitions ?? null,
          })),
        };
      }
    } catch (e) {
      out.dbError = String(e);
    }
  }

  // ── Live write probe ────────────────────────────────────────────────
  // Every static-code explanation has been ruled out (no status filter on the
  // read, PK matches the ON CONFLICT target, translation is never null,
  // completeLesson is called with results). So ask Postgres directly: run the
  // exact upsert recordWordPracticeBatch runs, on a throwaway row, and report
  // the raw error. Then delete it again.
  if (dbUp) {
    const probeWord = "__srs_probe__";
    try {
      await db
        .insert(srsCard)
        .values({
          word: probeWord,
          language: "en",
          userId,
          translation: probeWord,
          status: "learning",
          easeFactor: 2.5,
          interval: 1,
          repetitions: 1,
          nextReviewAt: new Date(),
          lastReviewedAt: new Date(),
        })
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

      const readBack = await db
        .select({
          status: srsCard.status,
          repetitions: srsCard.repetitions,
        })
        .from(srsCard)
        .where(and(eq(srsCard.userId, userId), eq(srsCard.word, probeWord)));

      out.probe = { ok: true, readBack };
    } catch (e) {
      const err = e as { code?: string; detail?: string; message?: string };
      out.probe = {
        ok: false,
        message: err?.message ?? String(e),
        code: err?.code ?? null,
        detail: err?.detail ?? null,
      };
    } finally {
      try {
        await db
          .delete(srsCard)
          .where(and(eq(srsCard.userId, userId), eq(srsCard.word, probeWord)));
        (out.probe as Record<string, unknown>).cleanedUp = true;
      } catch {
        (out.probe as Record<string, unknown>).cleanedUp = false;
      }
    }
  }

  try {
    const local = await getLocalCards(userId);
    const byStatus: Record<string, number> = {};
    for (const c of local) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }
    out.localTotal = local.length;
    out.localByStatus = byStatus;
  } catch (e) {
    out.localError = String(e);
  }

  return NextResponse.json(out);
}
