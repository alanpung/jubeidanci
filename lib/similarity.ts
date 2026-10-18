/**
 * String similarity checking with normalization and character-level diff.
 *
 * Normalization: lowercases, strips diacritics (ä→a, é→e, ñ→n, …),
 * strips punctuation (.,;:!?¿¡), normalizes curly quotes/apostrophes,
 * collapses whitespace, and treats ß as "ss" — so "Straße" ≈ "strasse".
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

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

interface NormalizedMapping {
  normalized: string;
  /** For each normalized char, the index in the original string it came from */
  origIndices: number[];
}

/**
 * Pre-normalize: curly quotes → straight, collapse whitespace → single space, trim.
 * Returns the cleaned string so downstream normalization can work on it.
 */
function preNormalize(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'") // curly single quotes → straight
    .replace(/[\u201C\u201D\u2033]/g, '"') // curly double quotes → straight
    .replace(/\s+/g, " ") // collapse all whitespace (tabs, newlines, multi-space) → single space
    .trim();
}

function normalizeWithMapping(s: string): NormalizedMapping {
  const origIndices: number[] = [];
  let normalized = "";

  // Use Array.from to iterate by code point (surrogate-safe)
  const codePoints = Array.from(s);
  let charIdx = 0; // index in the original string (by code unit)

  for (const char of codePoints) {
    const origIdx = charIdx;
    charIdx += char.length; // surrogate pairs have length 2

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

// ---------------------------------------------------------------------------
// Levenshtein with backtrace
// ---------------------------------------------------------------------------

interface LevenshteinResult {
  distance: number;
  /** One entry per character in `correct` */
  ops: ("match" | "bold")[];
  /** For each op, the corresponding index in `user` (null for insertions) */
  userIndices: (number | null)[];
}

function levenshteinOps(
  user: string,
  correct: string,
): LevenshteinResult {
  const m = user.length;
  const n = correct.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (user[i - 1] === correct[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 +
          Math.min(
            dp[i - 1][j], // delete (extra char in user input)
            dp[i][j - 1], // insert (user missed a char from correct)
            dp[i - 1][j - 1], // substitute
          );
      }
    }
  }

  // Backtrace — one entry per character in `correct`
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
    } else if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      // substitution
      ops.unshift("bold");
      userIndices.unshift(i - 1);
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      // insertion — char in correct is missing from user
      ops.unshift("bold");
      userIndices.unshift(null);
      j--;
    } else {
      // deletion — extra char in user, skip
      i--;
    }
  }

  // -----------------------------------------------------------------------
  // Post-process: improve bold contiguity.
  //
  // The backward backtrace greedily matches from the right, which can split
  // bold regions when duplicate characters exist. For example, "go" → "good"
  // produces [match g, bold o, match o, bold d] — bolding is non-contiguous.
  //
  // If we find a (bold-insertion, match) pair on the same character where
  // shifting the match left would merge into a contiguous bold run, swap them.
  // -----------------------------------------------------------------------
  for (let k = 0; k < ops.length - 1; k++) {
    if (
      ops[k] === "bold" &&
      userIndices[k] === null && // insertion (not substitution)
      ops[k + 1] === "match" &&
      correct[k] === correct[k + 1] // same char in correct
    ) {
      // Check if swapping creates or extends a contiguous bold region:
      // there must be a bold at k+2 (or k+1 is the last position).
      const hasBoldAfter = k + 2 < ops.length && ops[k + 2] === "bold";
      const isAtEnd = k + 2 >= ops.length;
      if (hasBoldAfter || isAtEnd) {
        // Swap: move the match earlier, push the bold later
        ops[k] = "match";
        ops[k + 1] = "bold";
        userIndices[k] = userIndices[k + 1];
        userIndices[k + 1] = null;
      }
    }
  }

  return { distance: dp[m][n], ops, userIndices };
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compare a single user input against one correct answer. */
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

  // For equality check, also strip spaces so "ichlerne" ≈ "ich lerne"
  const userSpaceless = userMapping.normalized.replace(/ /g, "");
  const correctSpaceless = correctMapping.normalized.replace(/ /g, "");

  if (userSpaceless === correctSpaceless) {
    return { isCorrect: true, similarity: 1, correctedMarkdown: correctTrimmed };
  }

  // Strict check for essential functional words
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
        correctedMarkdown: `**Missing word:** ${word}` 
      };
    }
  }

  const { distance, ops, userIndices } = levenshteinOps(
    userMapping.normalized,
    correctMapping.normalized,
  );
  const maxLen = Math.max(
    userMapping.normalized.length,
    correctMapping.normalized.length,
  );
  const similarity = maxLen === 0 ? 1 : 1 - distance / maxLen;

  console.log(`Checking: "${userInput}" vs "${correctAnswer}"`);
  console.log(`Similarity: ${similarity}, isCorrect: ${similarity >= minSimilarity}`);

  const boldIndices = new Set<number>();
  for (let k = 0; k < ops.length; k++) {
    const correctOrigIdx = correctMapping.origIndices[k];
    if (ops[k] === "bold") {
      boldIndices.add(correctOrigIdx);
    } else {
      // "match" in normalized form — also check if originals differ (case, diacritics)
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
    isCorrect: similarity >= 0.8,
    similarity,
    correctedMarkdown: buildMarkdown(correctTrimmed, boldIndices),
  };
}
/** Compare user input against multiple accepted answers; return the best match. */
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

    if (!best) {
      best = result;
    } else if (result.isCorrect && !best.isCorrect) {
      best = result;
    } else if (result.isCorrect === best.isCorrect && result.similarity > best.similarity) {
      best = result;
    }
  }

  return best!;
}

/**
 * Automatically generates natural English variations (contractions, expansions, common modal/phrasal synonyms)
 * so translation exercises always have multiple rich accepted alternatives.
 */
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

  // Synonym paraphrases of the target sentence ("I wish …" -> "I hope …").
  // These come first so learners can see the swaps the checker also accepts.
  for (const variant of synonymSentenceVariants(baseAnswer, 2)) {
    add(variant);
  }

  for (const alt of existingList) {
    if (alt) add(alt);
  }

  const base = baseAnswer.trim();
  const trailingPunct = base.match(/[.!?]$/)?.[0] || "";
  const core = base.replace(/[.!?]$/, "").trim();

  // Contraction / Expansion pairs
  const contractions: [RegExp, string][] = [
    [/\bI'm\b/g, "I am"],
    [/\bI am\b/g, "I'm"],
    [/\bcan't\b/g, "cannot"],
    [/\bcannot\b/g, "can't"],
    [/\bdon't\b/g, "do not"],
    [/\bdo not\b/g, "don't"],
    [/\bdoesn't\b/g, "does not"],
    [/\bdoes not\b/g, "doesn't"],
    [/\bdidn't\b/g, "did not"],
    [/\bdid not\b/g, "didn't"],
    [/\bwon't\b/g, "will not"],
    [/\bwill not\b/g, "won't"],
    [/\bit's\b/g, "it is"],
    [/\bit is\b/g, "it's"],
    [/\bthat's\b/g, "that is"],
    [/\bthat is\b/g, "that's"],
    [/\bthere's\b/g, "there is"],
    [/\bthere is\b/g, "there's"],
    [/\bthey're\b/g, "they are"],
    [/\bthey are\b/g, "they're"],
    [/\bwe're\b/g, "we are"],
    [/\bwe are\b/g, "we're"],
    [/\byou're\b/g, "you are"],
    [/\byou are\b/g, "you're"],
    [/\bhe's\b/g, "he is"],
    [/\bhe is\b/g, "he's"],
    [/\bshe's\b/g, "she is"],
    [/\bshe is\b/g, "she's"],
    [/\bI've\b/g, "I have"],
    [/\bI have\b/g, "I've"],
    [/\bwe've\b/g, "we have"],
    [/\bwe have\b/g, "we've"],
    [/\bthey've\b/g, "they have"],
    [/\bthey have\b/g, "they've"],
    [/\byou've\b/g, "you have"],
    [/\byou have\b/g, "you've"],
    [/\bI'd\b/g, "I would"],
    [/\bI would\b/g, "I'd"],
    [/\bI'll\b/g, "I will"],
    [/\bI will\b/g, "I'll"],
  ];

  for (const [regex, replacement] of contractions) {
    if (regex.test(core)) {
      add(core.replace(regex, replacement) + trailingPunct);
    }
  }

  // Common synonym / phrased alternatives
  const phrasingVariants: [RegExp, string][] = [
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
    if (regex.test(core)) {
      add(core.replace(regex, replacement) + trailingPunct);
    }
  }

  // Ensure we always have up to 3 acceptable variations
  if (result.length < 3) {
    if (!trailingPunct && baseAnswer) {
      add(baseAnswer + ".");
    }
    if (baseAnswer.endsWith(".")) {
      add(baseAnswer.slice(0, -1));
    }
    // Add lowercase/capitalization or punctuation variation
    if (baseAnswer) {
      add(baseAnswer.charAt(0).toUpperCase() + baseAnswer.slice(1));
    }
  }

  return result.slice(0, 4);
}

export interface WordMatchResult {
  isCorrect: boolean;
  score: number; // 0 to 1, e.g. 0.8
  percentage: number; // 0 to 100, e.g. 80
  matchCount: number; // e.g. 4
  totalCount: number; // e.g. 5
  matchedWordIndices: boolean[]; // array of boolean per target word
  matchedAnswer: string;
}

/**
 * Word-level accuracy checker:
 * Compares user input words to target answer words.
 * Score = (matched words / total target words).
 * Example: "Did you get my message" vs "Did you got my message" => 4/5 = 80%.
 * 80% (0.80) and above is considered correct.
 *
 * The returned `matchedWordIndices` is aligned to the primary answer's token
 * length — that's the slot count the UI renders, and the number shown in the
 * "MATCH: 80% (4/5 words)" footer. Each position is independently evaluated:
 * a position is "matched" if the user's token at that index normalises equal
 * to the corresponding token in **any** accepted answer (so an alt with a
 * different surface form still credits the user for that slot).
 *
 * Equality is `isEquivalentToken()` rather than plain string equality: an
 * accepted synonym counts as a match, so "I hope …" passes a target of
 * "I wish …". Inflections are compared separately, so "hoping" does not
 * satisfy a slot expecting "wish".
 *
 * This guards against two failure modes that bit us before:
 *   1. The best-scoring alt answer was shorter than the primary answer, so
 *      its `matchedWordIndices` array was shorter than the UI's slot count;
 *      trailing slots fell back to `undefined` in React state and were
 *      rendered as "matched" (green) by default.
 *   2. An alt answer had a stray single-letter word that normalised to "a"
 *      and produced a single false positive, hiding the real result.
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

  // Pre-compute each accepted answer's token list once.
  const answerTokenLists = acceptedAnswers.map(
    (a) => a.trim().split(/\s+/).filter(Boolean),
  );

  // The UI renders one slot per primary-answer token. Align everything to
  // that length so the per-slot boolean array matches what the user sees.
  const primaryTw = answerTokenLists[0];
  const totalCount = primaryTw.length;
  const alignedMatched: boolean[] = new Array(totalCount).fill(false);

  let matchCount = 0;
  for (let i = 0; i < totalCount; i++) {
    const u = userTokens[i] || "";
    if (!normalize(u)) continue;
    for (const tw of answerTokenLists) {
      const t = tw[i] || "";
      if (normalize(t) && isEquivalentToken(u, t)) {
        alignedMatched[i] = true;
        matchCount++;
        break;
      }
    }
  }

  const score = totalCount > 0 ? matchCount / totalCount : 0;
  const percentage = Math.round(score * 100);

  // Bonus credit: if the user fully matches any single accepted answer (same
  // length, every position matches), the exercise is correct regardless of
  // percentage — this lets a learner answer with a shorter acceptable
  // paraphrase without being marked wrong for not typing the longer form.
  let fullyMatchedAnyAnswer = false;
  for (const tw of answerTokenLists) {
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
      break;
    }
  }

  const isCorrect = fullyMatchedAnyAnswer || score >= 0.8;

  // Pick the best-aligned answer as `matchedAnswer` (the one with the most
  // token-overlap with the user, breaking ties by closeness in length to the
  // user's input so the UI feels natural).
  let bestAnswer = acceptedAnswers[0];
  let bestOverlap = -1;
  for (let ai = 0; ai < acceptedAnswers.length; ai++) {
    const tw = answerTokenLists[ai];
    let overlap = 0;
    const limit = Math.min(tw.length, userTokens.length);
    for (let i = 0; i < limit; i++) {
      const u = userTokens[i] || "";
      const t = tw[i] || "";
      if (normalize(u) && normalize(t) && isEquivalentToken(u, t)) overlap++;
    }
    const lengthPenalty = Math.abs(tw.length - userTokens.length);
    const scoreForAnswer = overlap * 1000 - lengthPenalty;
    if (scoreForAnswer > bestOverlap) {
      bestOverlap = scoreForAnswer;
      bestAnswer = acceptedAnswers[ai];
    }
  }

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

