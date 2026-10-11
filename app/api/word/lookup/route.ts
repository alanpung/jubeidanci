import { NextRequest, NextResponse } from "next/server";
import { lookupWord } from "@/lib/words";
import { getSession } from "@/lib/auth-server";
import { getNativeLanguage } from "@/lib/actions/profile";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const word = searchParams.get("word");
  const language = searchParams.get("language");
  let nativeLanguage = searchParams.get("nativeLanguage");

  if (!word || !language) {
    return NextResponse.json(
      { error: "Missing word or language parameter" },
      { status: 400 }
    );
  }

  if (!nativeLanguage) {
    try {
      const session = await getSession();
      if (session?.user?.id) {
        nativeLanguage = await getNativeLanguage(session.user.id);
      }
    } catch {
      // Session optional
    }
  }

  const result = await lookupWord(word, language, nativeLanguage || undefined);
  return NextResponse.json(result);
}
