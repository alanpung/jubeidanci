import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// Gemini STT transcription can take several seconds; allow up to 60s.
export const maxDuration = 60;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
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

async function transcribeWithOpenAI(audio: Blob, language: string): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OPENAI_API_KEY not configured");
  const file = new File([audio], "recording.webm", { type: audio.type || "audio/webm" });
  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: toIso6391(language),
  });
  return transcription.text;
}

async function transcribeWithGemini(audio: Blob, language: string): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) throw new Error("GEMINI_API_KEY not configured");

  const arrayBuffer = await audio.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const langHint = language || "the target language";

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        parts: [
          {
            text: `Transcribe the spoken audio clip into ${langHint}. Respond with only the transcribed text and no additional commentary.`,
          },
          {
            inlineData: {
              mimeType: audio.type || "audio/webm",
              data: base64,
            },
          },
        ],
      },
    ],
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned empty transcription");
  return text.trim();
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

    let text: string | null = null;
    const errors: string[] = [];

    // 1. Primary: Gemini speech-to-text. Gemini is the only provider with active
    //    credits on this deployment (OpenAI returns 429 "no credits remaining").
    if (process.env.GEMINI_API_KEY) {
      try {
        text = await transcribeWithGemini(audio, language);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Gemini STT failed";
        errors.push(`Gemini: ${message}`);
        console.warn("Gemini STT failed, falling back to OpenAI Whisper...", err);
      }
    }

    // 2. Fallback: OpenAI Whisper (used if GEMINI is unavailable or the user
    //    later adds OpenAI credits).
    if (!text && process.env.OPENAI_API_KEY) {
      try {
        text = await transcribeWithOpenAI(audio, language);
      } catch (err) {
        const message = err instanceof Error ? err.message : "OpenAI Whisper failed";
        errors.push(`OpenAI: ${message}`);
        console.warn("OpenAI Whisper STT failed", err);
      }
    }

    if (!text) {
      const detail = errors.length
        ? errors.join("; ")
        : "No speech provider configured — set OPENAI_API_KEY or GEMINI_API_KEY";
      return NextResponse.json({ error: `Speech-to-text failed. ${detail}` }, { status: 500 });
    }

    return NextResponse.json({ text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Speech-to-text transcription failed";
    console.error("STT error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
