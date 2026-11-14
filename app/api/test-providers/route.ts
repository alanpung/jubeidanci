import OpenAI from "openai";
import { NextResponse } from "next/server";

/**
 * Diagnostic-only endpoint (delete after debugging):
 *
 *   GET /api/test-providers
 *
 * Reports, for every supported AI provider, whether its API key is
 * configured in this environment and whether a minimal chat call succeeds.
 * The response never includes the key itself (it is redacted from errors).
 *
 * This lets you verify which provider will actually be used by the writing
 * scorer without inspecting Network traffic or submitting an essay.
 */
interface ProviderResult {
  id: string;
  label: string;
  model: string;
  /** true when the env var for this provider is set */
  keyConfigured: boolean;
  /** true when a minimal chat call succeeded */
  ok?: boolean;
  /** the model's reply, present only on success */
  reply?: string;
  /** sanitized error text, present only on failure */
  error?: string;
}

export async function GET() {
  const defs = [
    {
      id: "deepseek",
      label: "DeepSeek",
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
    },
    {
      id: "qwen",
      label: "Qwen",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey:
        process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "",
      model: process.env.QWEN_MODEL || "qwen-plus",
    },
    {
      id: "gemini",
      label: "Gemini",
      baseURL:
        "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey:
        process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    },
  ];

  const results: ProviderResult[] = [];

  for (const p of defs) {
    const base: ProviderResult = {
      id: p.id,
      label: p.label,
      model: p.model,
      keyConfigured: Boolean(p.apiKey && p.apiKey.trim()),
    };

    if (!base.keyConfigured) {
      results.push(base);
      continue;
    }

    try {
      const client = new OpenAI({
        apiKey: p.apiKey,
        baseURL: p.baseURL,
        timeout: 20_000,
      });
      const completion = await client.chat.completions.create({
        model: p.model,
        messages: [
          { role: "user", content: "Reply with the single word: ok" },
        ],
        temperature: 0.2,
      });
      const reply =
        completion.choices?.[0]?.message?.content?.trim() || "";
      results.push({ ...base, ok: true, reply });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const safe = msg.split(p.apiKey).join("[REDACTED]").slice(0, 400);
      results.push({ ...base, ok: false, error: safe });
    }
  }

  return NextResponse.json({
    ok: true,
    /** the order the writing scorer will actually try providers in */
    orderEnv: process.env.AI_PROVIDER_ORDER || null,
    providers: results,
  });
}
