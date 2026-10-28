/**
 * Unified translation grading — demerit (扣分) model.
 *
 * Why this file exists
 * -------------------
 * The old `checkWordMatch` in `similarity.ts` produced *two* contradictory
 * numbers for the same answer: a bag-of-words `percentage` (ignore order) that
 * drove the "100% Correct" badge, and a position-aligned `matchedWordIndices`
 * that drove the per-word red/green. A fully-scrambled sentence could read
 * "100% Correct" while showing eight red boxes. This module replaces both with
 * a single, self-consistent grade:
 *
 *   - one `score` (0–100) for the whole sentence, and
 *   - one `slots[]` array (one entry per answer word) that *derives* the
 *     per-word colour from the very same pass through the data.
 *
 * So the badge and the boxes can never disagree again.
 *
 * The model borrows from familiar education rubrics (research in the plan doc):
 *   - 高考 English essay: per-dimension deductions with independent caps, and a
 *     fixed pass line (9/15 ≈ 60) rather than a curve.
 *   - SM-2 / Anki `Quality` 0–5: the score maps onto the existing SRS quality
 *     scale, so a shaky pass and a perfect run get different memory schedules.
 *
 * Reuses `normalize` (char normalisation) and `isEquivalentToken` (synonym /
 * same-inflection equivalence) — no new dependencies.
 */

import { normalize } from "@/lib/similarity";
import { isEquivalentToken } from "@/lib/synonyms";
import type { Quality } from "@/lib/srs";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SlotState = "hit" | "moved" | "typo" | "miss";

export type MarkingGrade = "perfect" | "good" | "pass" | "retry";

export interface MarkingDeduction {
  kind: "missing" | "extra" | "displaced" | "typo";
  /** Chinese label for the result screen, e.g. "漏词". */
  label: string;
  count: number;
  /** Points actually removed (after the cap). */
  points: number;
}

export interface MarkingResult {
  /** Whole-sentence score, 0–100. */
  score: number;
  /** Per-answer-word state, length === number of answer words. */
  slots: SlotState[];
  /** 0–3 stars. */
  stars: 0 | 1 | 2 | 3;
  grade: MarkingGrade;
  /** Mastery label shown to the learner. */
  label: string;
  /** SM-2 quality, 1 (retry) … 5 (perfect). */
  quality: Quality;
  /** score >= PASS_LINE. */
  passed: boolean;
  /** Non-zero deductions, for the breakdown line. */
  deductions: MarkingDeduction[];
}

// ---------------------------------------------------------------------------
// Tunable rules — everything that controls scoring lives here.
// ---------------------------------------------------------------------------

export const PASS_LINE = 60;

export const MARKING_RULES = {
  /** Omitted answer words (learner wrote fewer words than the target). */
  missing: { per: 12, cap: 36, label: "漏词" },
  /** Wrong / extra words written (substitutions + insertions). */
  extra: { per: 12, cap: 36, label: "错词" },
  /** Reordering — only charged when the sentence length matches exactly, so a
   *  missing/extra word can't cascade into spurious "displaced" penalties. */
  displaced: { per: 8, cap: 45, label: "词序错位" },
  /** Spelling / inflection slips (close-enough match, e.g. "decide"→"decided"). */
  typo: { per: 3, cap: 12, label: "拼写/形态" },
} as const;

// ---------------------------------------------------------------------------
// Tokenisation + character-level similarity helpers
// ---------------------------------------------------------------------------

function tokenize(s: string): string[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Classic Levenshtein edit distance over normalised strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Normalised character similarity in [0,1]. Uses `normalize` so case,
 * diacritics, punctuation and ß/ss are ignored — the same normalisation the
 * rest of the app uses for word matching.
 */
function charSim(aRaw: string, bRaw: string): number {
  const a = normalize(aRaw);
  const b = normalize(bRaw);
  if (a === b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// ---------------------------------------------------------------------------
// Score → grade / stars / quality / label
// ---------------------------------------------------------------------------

export function scoreToQuality(score: number): Quality {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= PASS_LINE) return 3;
  // Below the pass line we map to quality 1 (incorrect, but the learner
  // recognised it once shown the answer) rather than 0/2, which keeps the SRS
  // from treating a near-miss as a total blackout.
  return 1;
}

function deriveBand(score: number): {
  stars: 0 | 1 | 2 | 3;
  grade: MarkingGrade;
  label: string;
  quality: Quality;
  passed: boolean;
} {
  if (score >= 90) {
    return { stars: 3, grade: "perfect", label: "完美掌握", quality: 5, passed: true };
  }
  if (score >= 75) {
    return { stars: 2, grade: "good", label: "记得但不牢", quality: 4, passed: true };
  }
  if (score >= PASS_LINE) {
    return { stars: 1, grade: "pass", label: "勉强通过", quality: 3, passed: true };
  }
  return { stars: 0, grade: "retry", label: "需要重练", quality: 1, passed: false };
}

// ---------------------------------------------------------------------------
// Core grader
// ---------------------------------------------------------------------------

/**
 * Grade a learner's translation against one or more acceptable full sentences.
 *
 * Algorithm (single pass, one source of truth):
 *   1. For each answer word, find an unconsumed user word that is equivalent
 *      (synonym or same inflection) → HIT; record its position.
 *   2. Else find an unconsumed user word with normalised char similarity ≥ 0.6
 *      → TYPO (spelling / inflection slip).
 *   3. Else → MISS (the answer word is missing).
 *   4. Any unconsumed, non-blank user word → EXTRA (a wrong word).
 *   5. Every HIT whose position differs from its answer position → DISPLACED
 *      (counts once for the word-order penalty).
 *
 * Deductions are summed with independent caps; the score is 100 − Σ, clamped
 * to [0,100].
 */
export function markTranslation(
  userTokensRaw: string[],
  acceptedAnswers: string[],
): MarkingResult {
  const userTokens = userTokensRaw.map((t) => t.trim());

  const primary = acceptedAnswers[0] ?? "";
  const primaryTokens = tokenize(primary);

  if (primaryTokens.length === 0) {
    return {
      score: 0,
      slots: [],
      ...deriveBand(0),
      deductions: [],
    };
  }

  // Answer words at the same length as the primary contribute alternative
  // acceptable tokens per slot (so phrasal variants like "wake up" ≈ "get up"
  // still count as a hit even though they aren't in the synonym dictionary).
  const sameLenAnswers = acceptedAnswers
    .map(tokenize)
    .filter((toks) => toks.length === primaryTokens.length);

  const acceptableAt = (i: number): string[] => {
    const set = new Set<string>();
    for (const toks of sameLenAnswers) {
      if (toks[i]) set.add(toks[i]);
    }
    return Array.from(set);
  };

  const usedUser = new Array<boolean>(userTokens.length).fill(false);
  const slots: SlotState[] = [];

  // Reordering is only a genuine error when the sentence length matches
  // exactly. If lengths differ, any "shift" is caused by an omission or
  // insertion, not a scramble — so we must not charge displaced penalties then.
  const userNonBlank = userTokens.filter((t) => normalize(t)).length;
  const countsEqual = userNonBlank === primaryTokens.length;

  let hitCount = 0;
  let movedCount = 0;
  let typoCount = 0;
  let missCount = 0;
  let displacedCount = 0;

  for (let i = 0; i < primaryTokens.length; i++) {
    const ansTok = primaryTokens[i];
    const acceptable = acceptableAt(i);

    // 1. HIT — equivalent token among unused user words.
    let hitJ = -1;
    for (let j = 0; j < userTokens.length; j++) {
      if (usedUser[j]) continue;
      const u = userTokens[j];
      const matches =
        isEquivalentToken(u, ansTok) ||
        acceptable.some((a) => isEquivalentToken(u, a));
      if (matches) {
        hitJ = j;
        break;
      }
    }
    if (hitJ >= 0) {
      usedUser[hitJ] = true;
      if (hitJ === i) {
        slots.push("hit");
        hitCount++;
      } else {
        // Word is present but at a different position. Only flag it as a
        // reordering error when the sentence length matches exactly; otherwise
        // the shift is just a side-effect of an omission/insertion, so colour
        // it green (hit) and charge no displaced penalty.
        movedCount++;
        if (countsEqual) {
          slots.push("moved");
          displacedCount++;
        } else {
          slots.push("hit");
        }
      }
      continue;
    }

    // 2. TYPO — close-enough word among unused user words.
    let typoJ = -1;
    for (let j = 0; j < userTokens.length; j++) {
      if (usedUser[j]) continue;
      const u = userTokens[j];
      const sim = Math.max(
        charSim(u, ansTok),
        ...acceptable.map((a) => charSim(u, a)),
      );
      if (sim >= 0.6) {
        typoJ = j;
        break;
      }
    }
    if (typoJ >= 0) {
      usedUser[typoJ] = true;
      slots.push("typo");
      typoCount++;
      continue;
    }

    // 3. MISS — the answer word is not present in the user's input.
    slots.push("miss");
    missCount++;
  }

  // 4. EXTRA — unused, non-blank user words (blank boxes do not count).
  let extraCount = 0;
  for (let j = 0; j < userTokens.length; j++) {
    if (!usedUser[j] && normalize(userTokens[j])) extraCount++;
  }

  // Degenerate case: the learner wrote nothing at all → total fail.
  const userProvided = userTokens.some((t) => normalize(t));
  if (!userProvided) {
    return {
      score: 0,
      slots: primaryTokens.map(() => "miss" as SlotState),
      ...deriveBand(0),
      deductions: [],
    };
  }

  // 5. Deductions (independent caps). To avoid double-counting a *substitution*
  //    (a wrong word written where a right word should be), split the unmatched
  //    answer words (misses) and unmatched user words (extras) into:
  //      - substitution = min(miss, extra)  → one wrong word swapped in
  //      - omission      = miss - substitution → answer word simply absent
  //      - insertion     = extra - substitution → a word the answer doesn't have
  //    "错词" charges substitution + insertion; "漏词" charges omission only.
  const substitution = Math.min(missCount, extraCount);
  const omission = missCount - substitution;
  const insertion = extraCount - substitution;

  const A = Math.min(MARKING_RULES.missing.cap, omission * MARKING_RULES.missing.per);
  const B = Math.min(MARKING_RULES.extra.cap, (substitution + insertion) * MARKING_RULES.extra.per);
  const C = Math.min(MARKING_RULES.displaced.cap, displacedCount * MARKING_RULES.displaced.per);
  const D = Math.min(MARKING_RULES.typo.cap, typoCount * MARKING_RULES.typo.per);

  const score = Math.max(0, 100 - (A + B + C + D));

  const deductions: MarkingDeduction[] = [];
  if (A > 0) deductions.push({ kind: "missing", label: MARKING_RULES.missing.label, count: omission, points: A });
  if (B > 0) deductions.push({ kind: "extra", label: MARKING_RULES.extra.label, count: substitution + insertion, points: B });
  if (C > 0) deductions.push({ kind: "displaced", label: MARKING_RULES.displaced.label, count: displacedCount, points: C });
  if (D > 0) deductions.push({ kind: "typo", label: MARKING_RULES.typo.label, count: typoCount, points: D });

  return {
    score,
    slots,
    ...deriveBand(score),
    deductions,
  };
}
