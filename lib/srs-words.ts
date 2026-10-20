import type { Exercise } from "@/lib/content/types";

const PLACEHOLDER_SRS_KEY = "breakfast|get|morning|practice";

function tokenizeEnglishWords(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
  if (!matches) return [];
  const result: string[] = [];
  for (const raw of matches) {
    // Strip common contractions like 's, 't, 're, 've, 'll, 'd, 'm
    const base = raw.replace(/'(s|t|re|ve|ll|d|m)$/, "");
    if (base && base.length >= 2) {
      result.push(base);
    }
  }
  return result;
}

/**
 * Extract SRS words (target-language) from an exercise as a flat string array.
 */
export function extractSrsWords(exercise: Exercise): string[] {
  const explicitRaw = !exercise.srsWords
    ? []
    : typeof exercise.srsWords === "string"
    ? [exercise.srsWords]
    : exercise.srsWords;

  const explicit = explicitRaw
    .map((w) => w.toLowerCase().trim())
    .filter((w, i, arr) => w && arr.indexOf(w) === i);

  const isPlaceholder =
    explicit.length === 4 &&
    [...explicit].sort().join("|") === PLACEHOLDER_SRS_KEY;

  if (explicit.length > 0 && !isPlaceholder) {
    return explicit;
  }

  // Fallback: extract vocabulary tokens from exercise English target fields
  const exAny = exercise as unknown as Record<string, unknown>;
  const textParts: string[] = [];

  if (typeof exAny.answer === "string") textParts.push(exAny.answer);
  if (Array.isArray(exAny.acceptAlso)) {
    for (const alt of exAny.acceptAlso) {
      if (typeof alt === "string") textParts.push(alt);
    }
  }
  if (typeof exAny.accept === "string") textParts.push(exAny.accept);
  if (typeof exAny.front === "string") textParts.push(exAny.front);
  // free-text has neither answer nor front (srsWords is optional there), so
  // without these it silently yielded zero words and the lesson recorded no
  // practice at all.
  if (typeof exAny.sentence === "string") textParts.push(exAny.sentence);
  if (typeof exAny.text === "string") textParts.push(exAny.text);
  if (typeof exAny.prompt === "string") textParts.push(exAny.prompt);
  if (typeof exAny.term === "string") textParts.push(exAny.term);
  if (typeof exAny.word === "string") textParts.push(exAny.word);
  if (Array.isArray(exAny.pairs)) {
    for (const p of exAny.pairs as unknown[]) {
      if (p && typeof p === "object") {
        const rec = p as Record<string, unknown>;
        if (typeof rec.left === "string") textParts.push(rec.left);
        if (typeof rec.right === "string") textParts.push(rec.right);
        if (typeof rec.word === "string") textParts.push(rec.word);
      } else if (typeof p === "string") {
        textParts.push(p);
      }
    }
  }

  const combined = tokenizeEnglishWords(textParts.join(" "));
  const combinedWithExplicit = [...explicit, ...combined];
  return combinedWithExplicit.filter((w, i, arr) => w && arr.indexOf(w) === i);
}

