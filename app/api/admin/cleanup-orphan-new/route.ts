import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { srsCard } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";

/**
 * One-time bulk cleanup of orphaned "new" SRS cards.
 *
 * The orphan signature: a `srs_card` row with status='new' that is no longer
 * backed by any of the user's enrolled courses/units (a word left behind after
 * a course was removed from My Books) and has never been practised. These rows
 * are physically deleted by syncUserCourseWordsToSrs whenever the affected
 * user next loads their Progress page / is inspected — but thousands of users
 * have never been triggered, so they pile up (the ~6,485-row Supabase blob).
 *
 * This endpoint reuses the EXACT same, already-tested cleanup logic the app
 * uses per-user (syncUserCourseWordsToSrs), so it correctly resolves each
 * user's real library before deciding what is an orphan. We simply fan it out
 * across every distinct userId that currently has a status='new' row.
 *
 * Idempotent: re-running only deletes rows that are still orphans today.
 * Admin-only (isAdminEmail). Time-boxed: stops before the serverless function
 * timeout and reports how many users it processed so a second call finishes
 * the rest.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession().catch(() => null);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const maxUsers = Math.min(
    Math.max(parseInt(url.searchParams.get("maxUsers") || "200", 10) || 200, 1),
    2000,
  );
  // Budget (ms) to stay safely under typical serverless limits.
  const budgetMs = Math.min(
    Math.max(parseInt(url.searchParams.get("budgetMs") || "240000", 10) || 240000, 1000),
    290000,
  );

  let userIds: { userId: string }[] = [];
  try {
    userIds = await db
      .selectDistinct({ userId: srsCard.userId })
      .from(srsCard)
      .where(eq(srsCard.status, "new"));
  } catch (err) {
    console.error("cleanup-orphan-new: failed to list users:", err);
    return NextResponse.json(
      { error: "Failed to list affected users", detail: String(err) },
      { status: 500 },
    );
  }

  const { syncUserCourseWordsToSrs } = await import("@/lib/actions/srs");

  const startedAt = Date.now();
  let processed = 0;
  let errors = 0;
  const erroredUsers: string[] = [];

  for (const { userId } of userIds) {
    if (processed >= maxUsers) break;
    if (Date.now() - startedAt > budgetMs) break;
    try {
      // force=true skips the 60s throttle so the whole backlog is drained in
      // one pass. syncUserCourseWordsToSrs already protects the owner (early
      // return) and preserves practised words.
      await syncUserCourseWordsToSrs(userId, true, session.user.email);
      processed++;
    } catch (err) {
      errors++;
      if (erroredUsers.length < 25) erroredUsers.push(userId);
      console.warn("cleanup-orphan-new: sync failed for", userId, err);
    }
  }

  // Remaining orphan 'new' rows after this pass.
  let remainingNew = 0;
  try {
    const rows = await db
      .selectDistinct({ userId: srsCard.userId })
      .from(srsCard)
      .where(eq(srsCard.status, "new"));
    remainingNew = rows.length;
  } catch {}

  const timedOut = Date.now() - startedAt > budgetMs || processed >= maxUsers;

  return NextResponse.json({
    ok: true,
    totalAffectedUsers: userIds.length,
    processed,
    errors,
    erroredUsers,
    remainingNewUserCount: remainingNew,
    timedOut,
    note: timedOut
      ? "Re-run this endpoint to continue draining remaining users (idempotent)."
      : "All affected users processed.",
  });
}
