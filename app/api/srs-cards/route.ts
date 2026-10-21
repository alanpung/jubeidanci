import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getAllCards } from "@/lib/actions/srs";
import { db, hasDbConfig } from "@/lib/db";
import { srsCard } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Lightweight endpoint the Progress page polls via its "Refresh SRS Data"
// button. It returns the merged SRS cards (local + DB) exactly like the page
// does, plus the raw DB row count for the current user and whether the DB was
// reachable — both of which make a "zero count" diagnosable instead of silent.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", cards: [] },
      { status: 401 },
    );
  }

  // Raw DB row count for this user (no language filter) — the ground truth we
  // compare the merged deck against, so "0 cards" is always diagnosable.
  const dbUp = hasDbConfig;
  let dbRowCount: number | null = null;
  let dbError: string | null = null;
  if (dbUp) {
    try {
      const rows = await db
        .select({ c: sql<number>`count(*)` })
        .from(srsCard)
        .where(eq(srsCard.userId, userId));
      dbRowCount = Number(rows[0]?.c ?? 0);
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }

  // Read the learner's whole deck (every language), identical to the Progress
  // page render, so the two paths cannot diverge. We deliberately do NOT filter
  // by ?lang= here: the SRS rows were written with the unit's targetLanguage
  // while this endpoint used to filter by the user's global preference, so a
  // mismatch returned an empty deck even though Postgres had the rows. Omitting
  // the language makes the deck authoritative and language-agnostic, so it can
  // never disagree with the page.
  const cards = await getAllCards(undefined, userId).catch((err) => {
    console.error("[srs-cards] getAllCards failed:", err);
    return [];
  });

  return NextResponse.json({
    ok: true,
    dbUp,
    dbError,
    userId,
    dbRowCount,
    fetchedAt: new Date().toISOString(),
    count: cards.length,
    cards,
  });
}
