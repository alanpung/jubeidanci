import OpenAI from "openai";
import { NextResponse } from "next/server";

/**
 * Diagnostic-only endpoint: confirms whether the Gemini API is reachable and
 * the configured key works, using the SAME server environment the writing
 * scorer runs in. Visit this in a browser (GET) — no terminal or key handling
 * needed. Safe to delete after debugging.
 *
 *   GET /api/test-gemini
 *
 * Response:
 *   { ok: true, model, reply }                 -> Gemini works here
 *   { ok: false, stage: "no_key", error }      -> GEMINI_API_KEY not in env
 *   { ok: false, stage: "call_failed", error } -> key present but call failed
 */
export async function GET() {
  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      stage: "no_key",
      error:
        "GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is not set in this environment.",
    });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      timeout: 20_000,
    });
    const completion = await client.chat.completions.create({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      temperature: 0.2,
    });
    const reply = completion.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      ok: true,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      reply,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = msg.split(apiKey).join("[REDACTED]").slice(0, 400);
    return NextResponse.json({
      ok: false,
      stage: "call_failed",
      error: safe,
    });
  }
}
