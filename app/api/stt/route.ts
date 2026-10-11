import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required for Whisper STT");
  }
  return new OpenAI({ apiKey });
}

// Convert language codes/names to ISO 639-1 format expected by OpenAI Whisper
function toIso6391(lang: string): string {
  const l = lang.toLowerCase().trim();
  if (l === "zh" || l.startsWith("zh") || l.includes("chinese")) return "zh";
  if (l === "en" || l.startsWith("en") || l.includes("english")) return "en";
  if (l === "es" || l.startsWith("es") || l.includes("spanish")) return "es";
  if (l === "fr" || l.startsWith("fr") || l.includes("french")) return "fr";
  if (l === "de" || l.startsWith("de") || l.includes("german")) return "de";
  if (l === "ja" || l.startsWith("ja") || l.includes("japanese")) return "ja";
  if (l === "ko" || l.startsWith("ko") || l.includes("korean")) return "ko";
  if (l === "it" || l.startsWith("it") || l.includes("italian")) return "it";
  if (l === "pt" || l.startsWith("pt") || l.includes("portuguese")) return "pt";
  if (l === "ru" || l.startsWith("ru") || l.includes("russian")) return "ru";
  return l.slice(0, 2);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const language = formData.get("language");

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }
    if (!language || typeof language !== "string") {
      return NextResponse.json({ error: "Language is required" }, { status: 400 });
    }

    const file = new File([audio], "recording.webm", { type: audio.type || "audio/webm" });

    const openai = getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: toIso6391(language),
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Speech-to-text transcription failed";
    console.error("OpenAI Whisper STT error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
