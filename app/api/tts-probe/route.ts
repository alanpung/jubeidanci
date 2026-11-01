import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";

export async function POST(req: Request) {
  const { text = "hello world", language = "en" } = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no GEMINI_API_KEY" }, { status: 500 });

  const ai = new GoogleGenAI({ apiKey });

  const candidates = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-preview-tts",
    "gemini-3.8-flash-preview-tts",
    "gemini-3-flash-preview-tts",
    "gemini-2.5-flash-preview-tts",
  ];

  const results: Record<string, unknown>[] = [];
  for (const model of candidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: text,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
        },
      });
      const part = response.candidates?.[0]?.content?.parts?.[0];
      const data = part?.inlineData?.data;
      results.push({
        model,
        audio: Boolean(data),
        bytes: data ? data.length : 0,
        mimeType: part?.inlineData?.mimeType,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ model, error: message.slice(0, 300) });
    }
  }

  return NextResponse.json({ text, language, results });
}
