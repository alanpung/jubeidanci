import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { srsCard } from "@/lib/db/schema";
import { and, eq, or, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";

/**
 * Purge the deck's legacy `status='new'` rows.
 *
 * New is no longer a stored state — it is DERIVED from the learner's library
 * (the course catalog, plus the words they have already practised) as
 * All − Mastered − Learning. Every row still sitting at status='new' is a
 * leftover from the old seeding, which wrote one row per library word.
 *
 * Two kinds of row are handled differently, because "new" was also the column
 * default:
 *   - UNPRACTISED (repetitions = 0 AND no last_reviewed_at) → DELETE. The
 *     learner never studied the word; the derived New set still offers it.
 *   - PRACTISED (repetitions > 0 OR a review timestamp) → converted to
 *     "learning" instead of deleted, so real progress is never destroyed.
 *
 * The matching local JSON store (data/srs-cards.json) is purged with the same
 * rules, otherwise getAllCards' merge re-appends cards that exist only locally.
 *
 * Idempotent: re-running only touches rows that are still "new" today.
 * Admin-only (isAdminEmail). Time-boxed per maxUsers / budgetMs.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const IS_NEW = eq(srsCard.status, "new");
const PRACTISED = or(gt(srsCard.repetitions, 0), isNotNull(srsCard.lastReviewedAt));
const UNPRACTISED = and(eq(srsCard.repetitions, 0), isNull(srsCard.lastReviewedAt));

/** GET: inspect how many legacy "new" rows remain. Target is 0. */
export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [totals] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        unpractised: sql<number>`COUNT(CASE WHEN ${srsCard.repetitions} = 0 AND ${srsCard.lastReviewedAt} IS NULL THEN 1 END)::int`,
        practised: sql<number>`COUNT(CASE WHEN ${srsCard.repetitions} > 0 OR ${srsCard.lastReviewedAt} IS NOT NULL THEN 1 END)::int`,
      })
      .from(srsCard)
      .where(IS_NEW);

    const byUser = await db
      .select({
        userId: srsCard.userId,
        rows: sql<number>`COUNT(*)::int`,
      })
      .from(srsCard)
      .where(IS_NEW)
      .groupBy(srsCard.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(25);

    return NextResponse.json({
      ok: true,
      remainingNew: Number(totals?.total ?? 0),
      unpractised: Number(totals?.unpractised ?? 0),
      practised: Number(totals?.practised ?? 0),
      topUsers: byUser.map((r) => ({ userId: r.userId, rows: Number(r.rows) })),
      note:
        Number(totals?.total ?? 0) === 0
          ? "Clean — no stored 'new' rows remain."
          : "POST this endpoint with ?apply=1 to purge.",
    });
  } catch (err) {
    console.error("purge-new-cards: inspection failed:", err);
    return NextResponse.json(
      { error: "Failed to inspect", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getSession().catch(() => null);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const onlyUserId = url.searchParams.get("userId") || undefined;
  const maxUsers = Math.min(
    Math.max(parseInt(url.searchParams.get("maxUsers") || "500", 10) || 500, 1),
    5000,
  );
  const budgetMs = Math.min(
    Math.max(parseInt(url.searchParams.get("budgetMs") || "240000", 10) || 240000, 1000),
    290000,
  );

  if (url.searchParams.get("sql") === "1") {
    return NextResponse.json({
      ok: true,
      dryRunSql: [
        "-- Practised rows keep their progress: move them into the queue.",
        "UPDATE srs_card SET status = 'learning', next_review_at = COALESCE(next_review_at, NOW())",
        "  WHERE status = 'new' AND (repetitions > 0 OR last_reviewed_at IS NOT NULL);",
        "",
        "-- Unpractised rows are legacy seeding: delete them.",
        "DELETE FROM srs_card",
        "  WHERE status = 'new' AND repetitions = 0 AND last_review_at IS NULL;",
      ].join("\n"),
    });
  }

  const startedAt = Date.now();
  let usersSeen = 0;
  let deleted = 0;
  let converted = 0;
  let localDeleted = 0;
  let localConverted = 0;
  const errors: string[] = [];

  try {
    const userRows = await db
      .selectDistinct({ userId: srsCard.userId })
      .from(srsCard)
      .where(onlyUserId ? and(IS_NEW, eq(srsCard.userId, onlyUserId)) : IS_NEW)
      .limit(maxUsers);

    for (const { userId } of userRows) {
      if (Date.now() - startedAt > budgetMs) break;
      usersSeen++;
      try {
        // 1. Practised-but-"new" rows keep their progress → learning.
        const convertedRows = apply
          ? await db
              .update(srsCard)
              .set({ status: "learning" })
              .where(and(eq(srsCard.userId, userId), IS_NEW, PRACTISED))
              .returning({ word: srsCard.word })
          : await db
              .select({ word: srsCard.word })
              .from(srsCard)
              .where(and(eq(srsCard.userId, userId), IS_NEW, PRACTISED));

        // 2. Unpractised rows are legacy seeding → delete.
        const deletedRows = apply
          ? await db
              .delete(srsCard)
              .where(and(eq(srsCard.userId, userId), IS_NEW, UNPRACTISED))
              .returning({ word: srsCard.word })
          : await db
              .select({ word: srsCard.word })
              .from(srsCard)
              .where(and(eq(srsCard.userId, userId), IS_NEW, UNPRACTISED));

        converted += convertedRows.length;
        deleted += deletedRows.length;
      } catch (err) {
        errors.push(userId);
        console.warn("purge-new-cards: DB pass failed for", userId, err);
      }
    }

    // 3. Mirror into the local JSON store so the merged deck cannot resurrect
    //    rows that only ever existed locally.
    try {
      const { purgeAllLocalNewCards } = await import("@/lib/srs-store");
      const local = apply
        ? await purgeAllLocalNewCards(onlyUserId)
        : await countLocalNew(onlyUserId);
      localDeleted = local.deleted;
      localConverted = local.converted;
    } catch (err) {
      console.warn("purge-new-cards: local store pass failed:", err);
    }
  } catch (err) {
    console.error("purge-new-cards: failed to list users:", err);
    return NextResponse.json(
      { error: "Failed to list affected users", detail: String(err) },
      { status: 500 },
    );
  }

  let remainingNew = 0;
  try {
    const [row] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(srsCard)
      .where(onlyUserId ? and(IS_NEW, eq(srsCard.userId, onlyUserId)) : IS_NEW);
    remainingNew = Number(row?.total ?? 0);
  } catch {}

  const timedOut = Date.now() - startedAt > budgetMs || usersSeen >= maxUsers;

  return NextResponse.json({
    ok: true,
    applied: apply,
    usersProcessed: usersSeen,
    deleted,
    convertedToLearning: converted,
    localDeleted,
    localConvertedToLearning: localConverted,
    remainingNew,
    errors: errors.length,
    erroredUsers: errors.slice(0, 25),
    timedOut,
    note: !apply
      ? "Dry run — nothing was written. Add ?apply=1 to purge."
      : timedOut
        ? "Re-run to continue draining the remaining users (idempotent)."
        : "All affected users processed.",
  });
}

/** Dry-run counter for the local JSON half (no writes). */
async function countLocalNew(
  userId?: string
): Promise<{ deleted: number; converted: number }> {
  const { getLocalCards } = await import("@/lib/srs-store");
  const cards = await getLocalCards(userId);
  let deleted = 0;
  let converted = 0;
  for (const c of cards) {
    if (c.status !== "new") continue;
    if ((c.repetitions ?? 0) > 0 || c.lastReviewedAt) converted++;
    else deleted++;
  }
  return { deleted, converted };
}
