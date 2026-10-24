/**
 * String similarity checking with normalization and character-level diff.
 *
 * Normalization: lowercases, strips diacritics (ä→a, é→e, ñ→n, …),
 * strips punctuation (.,;:!?¿¡), normalizes curly quotes/apostrophes,
 * collapses whitespace, and treats ß as "ss" — so "Strasse" ≈ "strasse".
 *
 * The correctedMarkdown bolds every character in the correct answer
 * that the user got wrong or missed.
 */

export interface SimilarityResult {
  isCorrect: boolean;
  similarity: number;
  /** Correct answer with wrong/missing chars wrapped in **bold** */
  correctedMarkdown: string;
  /** The specific accepted answer that matched best */
  matchedAnswer?: string;
}

export interface SimilarityOptions {
  /** Min similarity (0 to 1) to count as correct. Default: 0.8 */
  minSimilarity?: number;
}

interface NormalizedMapping {
  normalized: string;
  origIndices: number[];
}

function preNormalize(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWithMapping(s: string): NormalizedMapping {
  const origIndices: number[] = [];
  let normalized = "";
  const codePoints = Array.from(s);
  let charIdx = 0;
  for (const char of codePoints) {
    const origIdx = charIdx;
    charIdx += char.length;
    if (char === "ß") {
      normalized += "ss";
      origIndices.push(origIdx, origIdx);
    } else {
      const base = char
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,;:!?¿¡]/g, "");
      for (let k = 0; k < base.length; k++) {
        normalized += base[k];
        origIndices.push(origIdx);
      }
    }
  }
  return { normalized, origIndices };
}

import { isEquivalentToken, synonymSentenceVariants } from "@/lib/synonyms";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?¿¡]/g, "");
}

interface LevenshteinResult {
  distance: number;
  ops: ("match" | "bold")[];
  userIndices: (number | null)[];
}

function levenshteinOps(user: string, correct: string): LevenshteinResult {
  const m = user.length;
  const n = correct.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (user[i - 1] === correct[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  const ops: ("match" | "bold")[] = [];
  const userIndices: (number | null)[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && user[i - 1] === correct[j - 1]) {
      ops.unshift("match");
      userIndices.unshift(i - 1);
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.unshift("bold");
      userIndices.unshift(i - 1);
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      ops.unshift("bold");
      userIndices.unshift(null);
      j--;
    } else {
      i--;
    }
  }
  for (let k = 0; k < ops.length - 1; k++) {
    if (
      ops[k] === "bold" &&
      userIndices[k] === null &&
      ops[k + 1] === "match" &&
      correct[k] === correct[k + 1]
    ) {
      const hasBoldAfter = k + 2 < ops.length && ops[k + 2] === "bold";
      const isAtEnd = k + 2 >= ops.length;
      if (hasBoldAfter || isAtEnd) {
        ops[k] = "match";
        ops[k + 1] = "bold";
        userIndices[k] = userIndices[k + 1];
        userIndices[k + 1] = null;
      }
    }
  }
  return { distance: dp[m][n], ops, userIndices };
}

function buildMarkdown(original: string, boldIndices: Set<number>): string {
  let result = "";
  let inBold = false;
  for (let i = 0; i < original.length; i++) {
    const shouldBold = boldIndices.has(i);
    if (shouldBold && !inBold) {
      result += "**";
      inBold = true;
    } else if (!shouldBold && inBold) {
      result += "**";
      inBold = false;
    }
    result += original[i];
  }
  if (inBold) result += "**";
  return result;
}

export function checkSimilarity(
  userInput: string,
  correctAnswer: string,
  options: SimilarityOptions = {},
): SimilarityResult {
  const { minSimilarity = 0.8 } = options;
  const userTrimmed = preNormalize(userInput);
  const correctTrimmed = preNormalize(correctAnswer);
  const userMapping = normalizeWithMapping(userTrimmed);
  const correctMapping = normalizeWithMapping(correctTrimmed);
  const userSpaceless = userMapping.normalized.replace(/ /g, "");
  const correctSpaceless = correctMapping.normalized.replace(/ /g, "");
  if (userSpaceless === correctSpaceless) {
    return { isCorrect: true, similarity: 1, correctedMarkdown: correctTrimmed };
  }
  const essentialWords = ["to", "in", "at", "on", "of", "for", "with", "is", "are", "was", "were", "do", "does", "did", "the", "a", "an"];
  const cleanTokens = (str: string) =>
    str
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, ""))
      .filter(Boolean);
  const userTokens = cleanTokens(userTrimmed);
  const correctTokens = cleanTokens(correctTrimmed);
  for (const word of essentialWords) {
    if (correctTokens.includes(word) && !userTokens.includes(word)) {
      return {
        isCorrect: false,
        similarity: 0,
        correctedMarkdown: `**Missing word:** ${word}`,
      };
    }
  }
  const { distance, ops, userIndices } = levenshteinOps(
    userMapping.normalized,
    correctMapping.normalized,
  );
  const maxLen = Math.max(userMapping.normalized.length, correctMapping.normalized.length);
  const similarity = maxLen === 0 ? 1 : 1 - distance / maxLen;
  const boldIndices = new Set<number>();
  for (let k = 0; k < ops.length; k++) {
    const correctOrigIdx = correctMapping.origIndices[k];
    if (ops[k] === "bold") {
      boldIndices.add(correctOrigIdx);
    } else {
      const uNormIdx = userIndices[k];
      if (uNormIdx !== null) {
        const userOrigIdx = userMapping.origIndices[uNormIdx];
        if (userTrimmed[userOrigIdx] !== correctTrimmed[correctOrigIdx]) {
          boldIndices.add(correctOrigIdx);
        }
      }
    }
  }
  return {
    isCorrect: similarity >= minSimilarity,
    similarity,
    correctedMarkdown: buildMarkdown(correctTrimmed, boldIndices),
  };
}

export function checkBestMatch(
  userInput: string,
  correctAnswers: string[],
  options: SimilarityOptions = {},
): SimilarityResult {
  if (correctAnswers.length === 0) {
    throw new Error("checkBestMatch requires at least one correct answer");
  }
  let best: SimilarityResult | null = null;
  for (const answer of correctAnswers) {
    const result = { ...checkSimilarity(userInput, answer, options), matchedAnswer: answer };
    if (result.isCorrect && result.similarity === 1) return result;
    if (!best) best = result;
    else if (result.isCorrect && !best.isCorrect) best = result;
    else if (result.isCorrect === best.isCorrect && result.similarity > best.similarity) best = result;
  }
  return best!;
}

export function generateAlternativeTranslations(baseAnswer: string, existingList: string[] = []): string[] {
  const result: string[] = [];
  const add = (str: string) => {
    const s = str.trim();
    if (!s) return;
    if (!result.some((r) => r.toLowerCase().replace(/[.,!?;:]/g, "") === s.toLowerCase().replace(/[.,!?;:]/g, ""))) {
      result.push(s);
    }
  };
  add(baseAnswer);
  for (const variant of synonymSentenceVariants(baseAnswer, 2)) add(variant);
  for (const alt of existingList) if (alt) add(alt);
  const base = baseAnswer.trim();
  const trailingPunct = base.match(/[.!?]$/)?.[0] || "";
  const core = base.replace(/[.!?]$/, "").trim();
  const contractions: [RegExp, string][] = [
    [/\bI'm\b/g, "I am"], [/\bI am\b/g, "I'm"],
    [/\bcan't\b/g, "cannot"], [/\bcannot\b/g, "can't"],
    [/\bdon't\b/g, "do not"], [/\bdo not\b/g, "don't"],
    [/\bdoesn't\b/g, "does not"], [/\bdoes not\b/g, "doesn't"],
    [/\bdidn't\b/g, "did not"], [/\bdid not\b/g, "didn't"],
    [/\bwon't\b/g, "will not"], [/\bwill not\b/g, "won't"],
    [/\bit's\b/g, "it is"], [/\bit is\b/g, "it's"],
    [/\bthat's\b/g, "that is"], [/\bthat is\b/g, "that's"],
    [/\bthere's\b/g, "there is"], [/\bthere is\b/g, "there's"],
    [/\bthey're\b/g, "they are"], [/\bthey are\b/g, "they're"],
    [/\bwe're\b/g, "we are"], [/\bwe are\b/g, "we're"],
    [/\byou're\b/g, "you are"], [/\byou are\b/g, "you're"],
    [/\bhe's\b/g, "he is"], [/\bhe is\b/g, "he's"],
    [/\bshe's\b/g, "she is"], [/\bshe is\b/g, "she's"],
    [/\bI've\b/g, "I have"], [/\bI have\b/g, "I've"],
    [/\bwe've\b/g, "we have"], [/\bwe have\b/g, "we've"],
    [/\bthey've\b/g, "they have"], [/\bthey have\b/g, "they've"],
    [/\byou've\b/g, "you have"], [/\byou have\b/g, "you've"],
    [/\bI'd\b/g, "I would"], [/\bI would\b/g, "I'd"],
    [/\bI'll\b/g, "I will"], [/\bI will\b/g, "I'll"],
  ];
  for (const [regex, replacement] of contractions) {
    if (regex.test(core)) add(core.replace(regex, replacement) + trailingPunct);
  }
  const phrasingVariants: [RegExp, string][] = [
    // 起床 — get up ≈ wake up
    [/\bget up\b/gi, "wake up"],
    [/\bwake up\b/gi, "get up"],
    [/\bgetting up\b/gi, "waking up"],
    [/\bwaking up\b/gi, "getting up"],
    [/\bgot up\b/gi, "woke up"],
    [/\bwoke up\b/gi, "got up"],
    // 很高兴认识你
    [/\bnice to meet you\b/gi, "happy to meet you"],
    [/\bnice to meet you\b/gi, "glad to meet you"],
    [/\bnice to meet you\b/gi, "pleased to meet you"],
    [/\bhappy to meet you\b/gi, "nice to meet you"],
    [/\bglad to meet you\b/gi, "nice to meet you"],
    [/\bpleased to meet you\b/gi, "nice to meet you"],
    [/\bit is nice to meet you\b/gi, "nice to meet you"],
    [/\bit's nice to meet you\b/gi, "nice to meet you"],
    [/\bit is a pleasure to meet you\b/gi, "nice to meet you"],
    [/\bit's a pleasure to meet you\b/gi, "nice to meet you"],
    [/\bwant to eat\b/gi, "would like to eat"],
    [/\bwant to eat\b/gi, "want to have"],
    [/\bwould like to eat\b/gi, "want to eat"],
    [/\bwant to\b/gi, "would like to"],
    [/\bwould like to\b/gi, "want to"],
    [/\bhave to\b/gi, "need to"],
    [/\bneed to\b/gi, "have to"],
    [/\ba lot of\b/gi, "lots of"],
    [/\blots of\b/gi, "a lot of"],
    [/\bkids\b/gi, "children"],
    [/\bchildren\b/gi, "kids"],
    [/\bhard to\b/gi, "difficult to"],
    [/\bdifficult to\b/gi, "hard to"],
    [/\bstart\b/gi, "begin"],
    [/\bbegin\b/gi, "start"],
    [/\btalk to\b/gi, "speak with"],
    [/\bspeak with\b/gi, "talk to"],
  ];
  for (const [regex, replacement] of phrasingVariants) {
    if (regex.test(core)) add(core.replace(regex, replacement) + trailingPunct);
  }
  if (result.length < 3) {
    if (!trailingPunct && baseAnswer) add(baseAnswer + ".");
    if (baseAnswer.endsWith(".")) add(baseAnswer.slice(0, -1));
    if (baseAnswer) add(baseAnswer.charAt(0).toUpperCase() + baseAnswer.slice(1));
  }
  return result.slice(0, 4);
}

export interface WordMatchResult {
  isCorrect: boolean;
  score: number;
  percentage: number;
  matchCount: number;
  totalCount: number;
  matchedWordIndices: boolean[];
  matchedAnswer: string;
}

/**
 * Word-level accuracy checker.
 * Percentage = best score across all accepted answers.
 * Full match on any alternative → 100%.
 * Synonyms via isEquivalentToken (nice≈happy, etc.).
 * Phrasal variants (get up≈wake up) come from generateAlternativeTranslations.
 */
export function checkWordMatch(
  userInputWords: string[] | string,
  acceptedAnswers: string[],
): WordMatchResult {
  const userTokens = Array.isArray(userInputWords)
    ? userInputWords.map((w) => w.trim())
    : userInputWords.trim().split(/\s+/).filter(Boolean);

  if (acceptedAnswers.length === 0) {
    return {
      isCorrect: false,
      score: 0,
      percentage: 0,
      matchCount: 0,
      totalCount: 1,
      matchedWordIndices: [false],
      matchedAnswer: "",
    };
  }

  const answerTokenLists = acceptedAnswers.map((a) => a.trim().split(/\s+/).filter(Boolean));
  const primaryTw = answerTokenLists[0];
  let totalCount = primaryTw.length;
  const slotComparableLists = answerTokenLists.filter((tw) => tw.length === totalCount);
  const alignedMatched: boolean[] = new Array(totalCount).fill(false);

  let matchCount = 0;
  for (let i = 0; i < totalCount; i++) {
    const u = userTokens[i] || "";
    if (!normalize(u)) continue;
    for (const tw of slotComparableLists) {
      const t = tw[i] || "";
      if (normalize(t) && isEquivalentToken(u, t)) {
        alignedMatched[i] = true;
        matchCount++;
        break;
      }
    }
  }

  let score = totalCount > 0 ? matchCount / totalCount : 0;
  let percentage = Math.round(score * 100);

  let fullyMatchedAnyAnswer = false;
  let fullyMatchedAnswerIdx = -1;
  for (let ai = 0; ai < answerTokenLists.length; ai++) {
    const tw = answerTokenLists[ai];
    if (tw.length !== userTokens.length) continue;
    let allMatch = true;
    for (let i = 0; i < tw.length; i++) {
      if (!isEquivalentToken(userTokens[i] || "", tw[i] || "")) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      fullyMatchedAnyAnswer = true;
      fullyMatchedAnswerIdx = ai;
      break;
    }
  }

  let bestBagHits = matchCount;
  let bestBagTotal = totalCount;
  let bestBagScore = score;
  let bestAnswer = acceptedAnswers[0];

  for (let ai = 0; ai < answerTokenLists.length; ai++) {
    const tw = answerTokenLists[ai];
    if (tw.length === 0) continue;
    const usedUser = new Array(userTokens.length).fill(false);
    let hits = 0;
    for (const t of tw) {
      if (!normalize(t)) continue;
      for (let ui = 0; ui < userTokens.length; ui++) {
        if (usedUser[ui]) continue;
        if (isEquivalentToken(userTokens[ui] || "", t)) {
          usedUser[ui] = true;
          hits++;
          break;
        }
      }
    }
    const ansScore = hits / tw.length;
    if (
      ansScore > bestBagScore ||
      (ansScore === bestBagScore &&
        Math.abs(tw.length - userTokens.length) < Math.abs(bestBagTotal - userTokens.length))
    ) {
      bestBagScore = ansScore;
      bestBagHits = hits;
      bestBagTotal = tw.length;
      bestAnswer = acceptedAnswers[ai];
    }
  }

  if (fullyMatchedAnyAnswer && fullyMatchedAnswerIdx >= 0) {
    bestAnswer = acceptedAnswers[fullyMatchedAnswerIdx];
    bestBagHits = answerTokenLists[fullyMatchedAnswerIdx].length;
    bestBagTotal = bestBagHits;
    bestBagScore = 1;
  }

  if (bestBagScore > score) {
    score = bestBagScore;
    percentage = Math.round(score * 100);
    matchCount = bestBagHits;
    totalCount = bestBagTotal;
  }

  if (fullyMatchedAnyAnswer) {
    score = 1;
    percentage = 100;
    matchCount = bestBagTotal;
    totalCount = bestBagTotal;
    for (let i = 0; i < alignedMatched.length; i++) alignedMatched[i] = true;
  }

  const isCorrect = fullyMatchedAnyAnswer || score >= 0.8;

  return {
    isCorrect,
    score,
    percentage,
    matchCount,
    totalCount,
    matchedWordIndices: alignedMatched,
    matchedAnswer: bestAnswer,
  };
}
