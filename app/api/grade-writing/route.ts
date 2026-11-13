import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markWriting } from "@/lib/marking";
import {
  spansFromMarking,
  spansFromPhrases,
  type WritingErrorSpan,
} from "@/lib/writing-errors";

/**
 * Grade a whole-essay writing answer.
 *
 * The learner writes an entire English essay in one textarea; this route
 * compares it against the model essay and returns a score plus feedback.
 *
 * Multi-provider AI grading with graceful fallback:
 *
 *   - **AI (preferred):** we try a chain of OpenAI-compatible providers
 *     (Gemini → OpenAI → DeepSeek → Qwen → Groq → Hunyuan, in that order by
 *     default) and use the first one that returns a valid grade. This means
 *     if Gemini's free quota is exhausted (HTTP 429) or any provider fails,
 *     we automatically fall through to the next one instead of dead-ending.
 *     Only providers whose API key is configured are included in the chain.
 *   - **Fallback (rule-based):** when no API key is configured, every provider
 *     errors out, or none returns valid JSON, we fall back to the local
 *     `markWriting` grader from `lib/marking.ts` (grammar-only, so free
 *     writing is scored openly). The learner always gets a score.
 *
 * Both backends additionally return `errorSpans`: character ranges into the
 * trimmed essay that the client paints red in "Your writing". The `source`
 * field tells the client which backend produced the result, and `provider`
 * names the AI that actually graded it (for transparency/debugging).
 */

const requestSchema = z.object({
  essay: z.string().min(1, "Essay is required"),
  /** The Chinese prompt — needed so the AI can judge meaning coverage. */
  promptZh: z.string().optional(),
  /** The model English essay, used as the reference for comparison. */
  modelAnswer: z.string().optional(),
  /** Alternative acceptable model essays. */
  acceptAlso: z.array(z.string()).optional(),
  level: z.string().optional(),
});

const aiResultSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  strengths: z.array(z.string()).default([]),
  corrections: z.array(z.string()).default([]),
  /** Verbatim wrong words / phrases from the learner's essay. */
  errors: z.array(z.string()).default([]),
});

interface GradeResponse {
  score: number;
  passed: boolean;
  strengths: string[];
  corrections: string[];
  /** Char ranges into the trimmed learner essay to highlight in red. */
  errorSpans: WritingErrorSpan[];
  /** "ai" = a provider graded it, "fallback" = local rule-based grading. */
  source: "ai" | "fallback";
  /** Which AI actually graded it (gemini, deepseek, qwen, ...). Omitted on fallback. */
  provider?: string;
  /** Why we fell back to local grading (only present when source === "fallback"). */
  fallbackReason?: "no_provider" | "all_failed";
  /** Sanitized error text from the failed AI call(s), for diagnosis. */
  fallbackError?: string;
}

/**
 * Read the first non-empty value from a list of env var names.
 */
function readEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Build the ordered chain of providers to try.
 *
 * Every provider speaks the OpenAI Chat Completions protocol, so a single
 * client implementation works for all of them — only the `baseURL`, key and
 * model differ. A provider is only included if its API key is set, so the
 * route degrades cleanly when only some keys are configured.
 *
 * Override the preferred order with the `AI_PROVIDER_ORDER` env var
 * (comma-separated ids, e.g. "gemini,deepseek,qwen"). This is a *preferred
 * order*, not a whitelist: listed providers are tried first, but any keyed
 * provider you omitted is still appended as a backup. This guarantees the
 * chain is never empty as long as at least one key is configured — so a
 * partial list like "deepseek,qwen" (with only GEMINI_API_KEY set) can no
 * longer silently fall back to local grading.
 */
function buildProviders(): Provider[] {
  const defs: Provider[] = [
    {
      id: "gemini",
      label: "Gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: readEnv("GEMINI_API_KEY", "GOOGLE_AI_API_KEY") ?? "",
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    },
    {
      id: "openai",
      label: "OpenAI",
      baseURL: "https://api.openai.com/v1",
      apiKey: readEnv("OPENAI_API_KEY") ?? "",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      baseURL: "https://api.deepseek.com/v1",
      apiKey: readEnv("DEEPSEEK_API_KEY") ?? "",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    },
    {
      id: "qwen",
      label: "Qwen",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: readEnv("QWEN_API_KEY", "DASHSCOPE_API_KEY") ?? "",
      model: process.env.QWEN_MODEL || "qwen-plus",
    },
    {
      id: "groq",
      label: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: readEnv("GROQ_API_KEY") ?? "",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    },
    {
      id: "hunyuan",
      label: "Hunyuan",
      baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
      apiKey: readEnv("HUNYUAN_API_KEY") ?? "",
      model: process.env.HUNYUAN_MODEL || "hunyuan-turbo",
    },
  ];

  // Only keep providers that have a key configured.
  const keyed = defs.filter((p) => p.apiKey);

  // Optional: let the deployer pin the *preferred* order of providers.
  const order = process.env.AI_PROVIDER_ORDER
    ?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let active: Provider[];
  if (order && order.length > 0) {
    const ordered = order
      .map((id) => keyed.find((p) => p.id === id))
      .filter((p): p is Provider => Boolean(p));
    // Never drop a configured provider just because it was omitted from the
    // order list. Append any leftover keyed providers so the chain is never
    // empty when at least one key exists. This prevents a partial
    // AI_PROVIDER_ORDER (e.g. "deepseek,qwen" with only GEMINI_API_KEY set)
    // from silently falling back to local grading.
    const orderedIds = new Set(ordered.map((p) => p.id));
    const leftovers = keyed.filter((p) => !orderedIds.has(p.id));
    active = [...ordered, ...leftovers];
  } else {
    active = keyed;
  }

  return active;
}

interface Provider {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * Ask a single provider to grade the essay.
 *
 * Returns the validated grade, or `null` when the provider answered but the
 * response was not valid grading JSON (so the caller can try the next
 * provider). Throws on transport errors (network, 401, 429, timeout) so the
 * caller's loop can fall through to the next provider.
 */
async function gradeWithProvider(
  p: Provider,
  prompt: string,
): Promise<{
  score: number;
  passed: boolean;
  strengths: string[];
  corrections: string[];
  errors: string[];
} | null> {
  const client = new OpenAI({
    apiKey: p.apiKey,
    baseURL: p.baseURL,
    timeout: 20_000,
  });

  const completion = await client.chat.completions.create({
    model: p.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  });

  const text = completion.choices?.[0]?.message?.content?.trim() || "";
  const jsonStr = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const validated = aiResultSchema.safeParse(raw);
  if (!validated.success) return null;
  return validated.data;
}

/**
 * Rule-based fallback: reuse the *writing* grader on the whole essay.
 *
 * `markWriting` takes an array of *tokens*, not a string, so the essay is
 * split on whitespace first. Unlike the translation grader it is grammar-only
 * — it only deducts for spelling / inflection slips, never for word choice,
 * omissions or reordering — which matches how open free-writing should be
 * scored. The client labels this mode as a basic score rather than a full AI
 * review.
 */
function gradeWithRules(
  essay: string,
  modelAnswer: string,
  acceptAlso: string[],
): GradeResponse {
  const accepted = [modelAnswer, ...acceptAlso].filter(Boolean);
  if (accepted.length === 0) {
    return {
      score: 0,
      passed: false,
      strengths: [],
      corrections: [],
      errorSpans: [],
      source: "fallback",
    };
  }

  const text = essay.trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  const marking = markWriting(tokens, accepted);

  return {
    score: marking.score,
    passed: marking.passed,
    strengths: [],
    corrections: marking.deductions.map(
      (d) => `${d.label} ×${d.count}（−${d.points} 分）`,
    ),
    errorSpans: spansFromMarking(text, marking, accepted),
    source: "fallback",
  };
}

/** Build the grading prompt shared by every provider. */
function buildPrompt(
  essay: string,
  promptZh: string,
  modelAnswer: string,
  level: string,
): string {
  return `You are grading an English essay written by a ${level || "A1"} level Chinese-speaking learner.

The learner was asked to write an English essay based on this Chinese prompt:
"""
${promptZh || "(not provided)"}
"""

Here is the MODEL essay (the reference answer):
"""
${modelAnswer || "(not provided)"}
"""

Here is the LEARNER's essay:
"""
${essay}
"""

Grade the learner's essay on a 0-100 scale, comparing it against the model essay:
- Content coverage: does it express the same ideas as the Chinese prompt?
- Accuracy: grammar, spelling, word choice and sentence structure.
- Fluency and completeness: does it read like natural English at this level?

The pass line is 70.

CRITICAL OPEN-WRITING POLICY:
- This is OPEN writing practice for a beginner. Only penalize GRAMMATICAL mistakes: spelling, verb tense/agreement, prepositions, articles, and word order that actually breaks grammar.
- Do NOT penalize for using different words, paraphrasing, or omitting some content from the model essay. Reward clear communication and correct grammar even when the wording differs from the model.
- Grammar errors are the ONLY thing that should lower the score. A grammatically correct but differently-worded essay should score high (80+).

CRITICAL INSTRUCTIONS:
1. Give the learner ENCOURAGING but HONEST feedback. This is a practice tool for a beginner.
2. "strengths" = 1-3 short bullet strings naming what the learner did well (in English).
3. "corrections" = 1-5 short bullet strings naming specific mistakes and how to fix them (in English). Do NOT repeat the learner's whole essay.
4. Write the feedback for a Chinese-speaking learner: keep sentences short and plain.
5. Do not include Chinese characters in "strengths" or "corrections" — write them in English.
6. "passed" must be true when score >= 70.
7. "errors" = the EXACT wrong words or short phrases copied verbatim from the LEARNER's essay (wrong word, misspelling, wrong verb form, wrong preposition, redundant word). Each entry must be a substring that really appears in the learner's essay — they are used to highlight the text in red, so invented strings will not match. Keep each entry to 1-4 words. Return [] if there are no errors. Do not include words that are already correct.

Return ONLY valid JSON without markdown code blocks:
{
  "score": 85,
  "passed": true,
  "strengths": ["Short point", "Another point"],
  "corrections": ["Specific error and how to fix it"],
  "errors": ["footballs", "on question"]
}`;
}

/**
 * Turn a caught error into a short, safe diagnostic string. We strip any
 * configured API key values so the message can be shown/logged without
 * leaking secrets.
 */
function sanitizeError(e: unknown, providers: Provider[]): string | undefined {
  if (!e) return undefined;
  let msg = e instanceof Error ? e.message : String(e);
  for (const p of providers) {
    if (p.apiKey) msg = msg.split(p.apiKey).join("[REDACTED]");
  }
  return msg.slice(0, 400);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { essay, promptZh = "", modelAnswer = "", acceptAlso = [], level } =
    parsed.data;

  // No provider configured at all — go straight to the local grader.
  const providers = buildProviders();
  if (providers.length === 0) {
    return NextResponse.json({
      ...gradeWithRules(essay, modelAnswer, acceptAlso),
      fallbackReason: "no_provider",
    });
  }

  const prompt = buildPrompt(essay, promptZh, modelAnswer, level || "A1");

  // Try each provider in order; use the first that returns a valid grade.
  let lastError: unknown;
  for (const p of providers) {
    try {
      const result = await gradeWithProvider(p, prompt);
      if (!result) continue; // bad/invalid response, try the next provider

      const { score, passed, strengths, corrections, errors } = result;
      return NextResponse.json({
        score: Math.round(score),
        passed,
        strengths,
        corrections,
        errorSpans: spansFromPhrases(essay.trim(), errors),
        source: "ai",
        provider: p.id,
      } satisfies GradeResponse);
    } catch (e) {
      // Network error, 401, 429 (quota exhausted), timeout, etc. — fall
      // through to the next provider instead of failing the request.
      lastError = e;
      continue;
    }
  }

  // Every provider failed — always return a local rule-based grade so the
  // learner never dead-ends on a failed request.
  return NextResponse.json({
    ...gradeWithRules(essay, modelAnswer, acceptAlso),
    fallbackReason: "all_failed",
    fallbackError: sanitizeError(lastError, providers),
  });
}
