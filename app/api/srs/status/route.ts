import { NextRequest, NextResponse } from "next/server";
import { setWordStatus, getAllCards } from "@/lib/actions/srs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { word, language = "en", status, cefrLevel, translation, pos } = body;

    if (!word || !status) {
      return NextResponse.json(
        { error: "word and status are required" },
        { status: 400 }
      );
    }

    const updated = await setWordStatus(
      word,
      language,
      status as "new" | "learning" | "learned",
      { cefrLevel, translation, pos }
    );

    return NextResponse.json({ success: true, card: updated });
  } catch (err: unknown) {
    console.error("Error setting word status:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update status" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const language = searchParams.get("language") || "en";
    const cards = await getAllCards(language);
    return NextResponse.json({ cards });
  } catch (err: unknown) {
    console.error("Error fetching srs cards:", err);
    return NextResponse.json({ cards: [] });
  }
}
