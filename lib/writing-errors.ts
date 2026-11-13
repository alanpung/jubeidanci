import type { MarkingResult, UserTokenState } from "./marking";

/**
 * Word-level error highlighting for the whole-passage Writing exercise.
 *
 * The grading API returns character ranges into the *trimmed* essay rather
 * than colour names or word lists. That keeps both grading backends (Gemini
 * and the local rule-based fallback) behind one response shape, and lets the
 * client render the learner's own text verbatim — including newlines and
 * punctuation — while wrapping only the offending ranges in a red <mark>.
 *
 * All helpers here are pure functions so they can be unit-tested without a
 * DOM or a running Next.js server.
 */

export interface WritingErrorSpan {
  /** 0-based character offset into the trimmed essay (inclusive). */
  start: number;
  /** 0-based character offset into the trimmed essay (exclusive). */
  end: number;
}

export interface HighlightSegment {
  text: string;
  /** True when this slice should be rendered as a mistake. */
  error: boolean;
}

interface OffsetToken {
  token: string;
  start: number;
  end: number;
}

/** Split on whitespace while keeping exact character offsets. */
export function tokenizeWithOffsets(text: string): OffsetToken[] {
  const out: OffsetToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ token: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Clamp, sort, drop empty ranges and merge overlapping / adjacent ones. */
export function normalizeSpans(
  spans: WritingErrorSpan[],
  length: number,
): WritingErrorSpan[] {
  const valid = spans
    .map((s) => ({
      start: Math.max(0, Math.min(length, Math.floor(s.start))),
      end: Math.max(0, Math.min(length, Math.floor(s.end))),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: WritingErrorSpan[] = [];
  for (const s of valid) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

const isWordChar = (ch: string | undefined): boolean =>
  !!ch && /[\p{L}\p{N}_]/u.test(ch);

/** Lower-case and strip surrounding punctuation for vocabulary comparison. */
function bareWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");
}

/**
 * Build spans from the rule-based grader. `marking.userTokens` is parallel to
 * the learner's whitespace tokens, so we can map states straight back onto
 * the original text. Only words that actually cost points are marked:
 *   - "extra" → 错词 (wrong / redundant word)
 *   - "typo"  → 拼写/形态 (spelling or inflection slip)
 * "moved" words are real words in the wrong order; they are not individually
 * wrong, so they stay unmarked.
 *
 * `acceptedAnswers` is used for one guard: the grader is a bag-of-words
 * comparison, so with repeated words it can consume the wrong occurrence and
 * then label a *correct* duplicate as a "typo" for some unrelated answer
 * word (e.g. "He" being matched to "the"). A word that already appears
 * verbatim in the model vocabulary cannot be a spelling error, so those
 * alignment artefacts are dropped from the highlight. Scores and deductions
 * are untouched — this only affects which characters are painted red.
 */
export function spansFromMarking(
  text: string,
  marking: MarkingResult,
  acceptedAnswers: string[] = [],
): WritingErrorSpan[] {
  const tokens = tokenizeWithOffsets(text);
  const states: (UserTokenState | undefined)[] = marking.userTokens.map(
    (u) => u.state,
  );
  const modelWords = new Set(
    acceptedAnswers
      .flatMap((a) => tokenizeWithOffsets(a))
      .map((t) => bareWord(t.token))
      .filter(Boolean),
  );
  const spans: WritingErrorSpan[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const state = states[i];
    if (state !== "extra" && state !== "typo") continue;
    if (state === "typo" && modelWords.has(bareWord(tokens[i].token))) continue;

    // Do not paint trailing punctuation (e.g. "footballs," → "footballs")
    // or leading quotes/brackets red.
    let { start, end } = tokens[i];
    while (start < end && !isWordChar(text[start])) start++;
    while (end > start && !isWordChar(text[end - 1])) end--;
    if (end > start) spans.push({ start, end });
  }

  return normalizeSpans(spans, text.length);
}

/**
 * Build spans from the AI grader, which returns the exact wrong phrases
 * copied out of the learner's essay. Matching is case-insensitive and guarded
 * by word boundaries so a phrase like "at" cannot highlight the "at" inside
 * "table". Unmatched phrases are silently ignored — the essay is still shown.
 */
export function spansFromPhrases(
  text: string,
  phrases: string[],
): WritingErrorSpan[] {
  const lower = text.toLowerCase();
  const spans: WritingErrorSpan[] = [];

  for (const raw of phrases) {
    const phrase = raw.trim();
    if (phrase.length < 2 || phrase.length > 80) continue;
    const needle = phrase.toLowerCase();
    const phraseStartsWord = isWordChar(phrase[0]);
    const phraseEndsWord = isWordChar(phrase[phrase.length - 1]);

    let from = 0;
    // Guard against a pathological phrase producing an unbounded loop.
    for (let hits = 0; hits < 50; hits++) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      from = idx + needle.length;

      const before = text[idx - 1];
      const after = text[idx + needle.length];
      if (phraseStartsWord && isWordChar(before)) continue;
      if (phraseEndsWord && isWordChar(after)) continue;

      spans.push({ start: idx, end: idx + needle.length });
    }
  }

  return normalizeSpans(spans, text.length);
}

/** Turn the essay + spans into renderable segments for the client. */
export function splitBySpans(
  text: string,
  spans: WritingErrorSpan[],
): HighlightSegment[] {
  const clean = normalizeSpans(spans, text.length);
  if (clean.length === 0) return [{ text, error: false }];

  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const s of clean) {
    if (s.start > cursor) {
      out.push({ text: text.slice(cursor, s.start), error: false });
    }
    out.push({ text: text.slice(s.start, s.end), error: true });
    cursor = s.end;
  }
  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), error: false });
  }
  return out;
}
