import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getAllCards } from "@/lib/actions/srs";
import { db, isDbAvailable } from "@/lib/db";
import { srsCard } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Lightweight endpoint the Progress page polls via its "Refresh SRS Data"
// button. It returns the merged SRS cards (local + DB) exactly like the page
// does, plus the raw DB row count for the current user and whether the DB was
// reachable — both of which make a "zero count" diagnosable instead of silent.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", cards: [] },
      { status: 401 },
    );
  }

  const dbUp = await isDbAvailable();
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

  const cards = await getAllCards().catch((err) => {
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
