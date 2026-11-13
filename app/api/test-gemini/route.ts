import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic-only endpoint (delete after debugging):
 *
 *   GET /api/test-gemini            -> ping Gemini with the configured model
 *   GET /api/test-gemini?list=1     -> list Gemini models this key can use
 *
 * Both use the SAME server environment the writing scorer runs in, so the
 * result is definitive for each deployment (Vercel / EdgeOne).
 *
 * Responses:
 *   { ok: true, model, reply }                 -> Gemini works here
 *   { ok: false, stage: "no_key", error }      -> GEMINI_API_KEY not in env
 *   { ok: false, stage: "call_failed", error } -> key present but call failed
 *   { ok: true, models: [...] }                -> list of available models
 */
export async function GET(req: NextRequest) {
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

  // --- List mode: enumerate models this key can access ---
  if (req.nextUrl.searchParams.get("list") === "1") {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        models?: {
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        const safe = (data.error?.message || `HTTP ${res.status}`)
          .split(apiKey)
          .join("[REDACTED]");
        return NextResponse.json({
          ok: false,
          stage: "list_failed",
          error: safe,
        });
      }
      const models = (data.models || [])
        .filter(
          (m) =>
            /gemini/i.test(m.name || "") &&
            (m.supportedGenerationMethods || []).includes("generateContent"),
        )
        .map((m) => ({
          id: (m.name || "").replace(/^models\//, ""),
          displayName: m.displayName || "",
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return NextResponse.json({ ok: true, models });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({
        ok: false,
        stage: "list_failed",
        error: msg.split(apiKey).join("[REDACTED]").slice(0, 400),
      });
    }
  }

  // --- Ping mode: confirm the configured model actually works ---
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      timeout: 20_000,
    });
    const completion = await client.chat.completions.create({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      temperature: 0.2,
    });
    const reply = completion.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      ok: true,
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
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
