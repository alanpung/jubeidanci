import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markTranslation } from "@/lib/marking";
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
 * Two grading backends, one response shape:
 *
 *   - **AI** (preferred): Gemini compares the learner's essay with the model
 *     essay and returns a score, what the learner did well, what to fix, and
 *     the exact wrong phrases copied out of the learner's text.
 *   - **Fallback** (rule-based): when no API key is configured, the model
 *     errors out, or its answer is not valid JSON, we fall back to the local
 *     `markTranslation` grader from `lib/marking.ts`. The learner always gets
 *     a score — the app never dead-ends on a failed request.
 *
 * Both backends additionally return `errorSpans`: character ranges into the
 * trimmed essay that the client paints red in "Your writing". Ranges (rather
 * than word lists) keep the learner's original formatting intact and avoid
 * fuzzy client-side matching. The `source` field tells the client which
 * backend produced the result so the UI can label an offline/basic score
 * honestly.
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
  /** "ai" = Gemini feedback, "fallback" = local rule-based grading. */
  source: "ai" | "fallback";
}

/**
 * Rule-based fallback: reuse the translation grader on the whole essay.
 *
 * `markTranslation` takes an array of *tokens*, not a string, so the essay is
 * split on whitespace first. Its deductions are per-word, which is strict for
 * a 50–80 word essay — that is why the client labels this mode as a basic
 * score rather than a full review.
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
  const marking = markTranslation(tokens, accepted);

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

  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  // No key configured — go straight to the local grader.
  if (!apiKey) {
    return NextResponse.json(
      gradeWithRules(essay, modelAnswer, acceptAlso),
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are grading an English essay written by a ${level || "A1"} level Chinese-speaking learner.

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

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const text = response.text?.trim() || "";
    const jsonStr = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");
    const raw = JSON.parse(jsonStr);

    const validated = aiResultSchema.safeParse(raw);
    if (!validated.success) {
      // The model answered but not in the shape we need — use the local grader.
      return NextResponse.json(
        gradeWithRules(essay, modelAnswer, acceptAlso),
      );
    }

    const { score, passed, strengths, corrections, errors } = validated.data;
    return NextResponse.json({
      score: Math.round(score),
      passed,
      strengths,
      corrections,
      errorSpans: spansFromPhrases(essay.trim(), errors),
      source: "ai",
    } satisfies GradeResponse);
  } catch {
    // Any failure at all (network, quota, malformed JSON) falls back to the
    // local grader so the learner always gets a result.
    return NextResponse.json(
      gradeWithRules(essay, modelAnswer, acceptAlso),
    );
  }
}
