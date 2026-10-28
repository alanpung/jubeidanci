import { describe, expect, test } from "bun:test";
import {
  markTranslation,
  scoreToQuality,
  PASS_LINE,
  type MarkingResult,
} from "./marking";

// ---------------------------------------------------------------------------
// Table-driven test cases for the unified translation grader.
//
// To add a case: append an object to `markingCases`. When it fails, the error
// message prints the label, the input, the accepted answer, the expected vs
// actual score/stars/grade, and the full MarkingResult for debugging.
// ---------------------------------------------------------------------------

interface MarkingCase {
  label: string;
  input: string[];
  answers: string[];
  expected: {
    score?: number;
    stars?: 0 | 1 | 2 | 3;
    grade?: "perfect" | "good" | "pass" | "retry";
    passed?: boolean;
    /** exact slot states, length === answer words */
    slots?: ("hit" | "moved" | "typo" | "miss")[];
  };
}

const markingCases: MarkingCase[] = [
  {
    label: "perfect sentence → 100 / ★★★ / perfect",
    input: ["He", "decided", "to", "change", "jobs", "to", "develop", "his", "career"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 100, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "fully scrambled (9-word reverse) → 55 / ☆ / retry (displaced cap 45)",
    input: ["career", "his", "develop", "to", "jobs", "change", "to", "decided", "He"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 55, stars: 0, grade: "retry", passed: false },
  },
  {
    // A substitution (wrong word in place of a right one) must NOT be
    // double-counted as both a missing word and an extra word.
    label: "two substituted words → 76 / ★★ / good",
    input: ["He", "decided", "to", "change", "xxx", "to", "develop", "his", "zzz"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 76, stars: 2, grade: "good", passed: true },
  },
  {
    // Dropping one word must not cascade into spurious "displaced" penalties
    // for every word after the gap.
    label: "one omitted word → 88 / ★★ / good",
    input: ["He", "decided", "to", "change", "to", "develop", "his", "career"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 88, stars: 2, grade: "good", passed: true },
  },
  {
    label: "one spelling slip (decide → decided) → 97 / ★★★ / perfect",
    input: ["He", "decide", "to", "change", "jobs", "to", "develop", "his", "career"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 97, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "one adjacent swap → 84 / ★★ / good",
    input: ["He", "decided", "to", "change", "jobs", "to", "develop", "career", "his"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 84, stars: 2, grade: "good", passed: true },
  },
  {
    // Synonyms must count as a hit and must NOT be penalised by a whole-sentence
    // residual comparison.
    label: "synonym (hope → wish) → 100",
    input: ["I", "hope", "to", "see", "you", "soon"],
    answers: ["I wish to see you soon."],
    expected: { score: 100, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "empty input → 0 / ☆ / retry",
    input: ["", "", "", "", "", "", "", "", ""],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 0, stars: 0, grade: "retry", passed: false },
  },
  {
    // Phrasal variants across alternative answers must both count as hits.
    label: "phrasal variant (get up ↔ wake up) → 100",
    input: ["I", "wake", "up", "at", "seven"],
    answers: ["I get up at seven.", "I wake up at seven."],
    expected: { score: 100, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "two insertion words (no omissions) → 76 / ★★ / good",
    input: ["He", "decided", "to", "change", "jobs", "to", "develop", "his", "career", "now", "daily"],
    answers: ["He decided to change jobs to develop his career."],
    expected: { score: 76, stars: 2, grade: "good", passed: true },
  },
];

function failMsg(c: MarkingCase, field: string, expected: unknown, actual: unknown, full: MarkingResult): string {
  return [
    "",
    `  Case:     "${c.label}"`,
    `  Input:    ${JSON.stringify(c.input)}`,
    `  Answer:   ${JSON.stringify(c.answers)}`,
    `  Field:    ${field}`,
    `  Expected: ${JSON.stringify(expected)}`,
    `  Actual:   ${JSON.stringify(actual)}`,
    `  Full:     ${JSON.stringify(full)}`,
    "",
  ].join("\n");
}

describe("markTranslation", () => {
  for (const c of markingCases) {
    test(c.label, () => {
      const r = markTranslation(c.input, c.answers);
      const e = c.expected;

      if (e.score !== undefined && r.score !== e.score) {
        throw new Error(failMsg(c, "score", e.score, r.score, r));
      }
      if (e.stars !== undefined && r.stars !== e.stars) {
        throw new Error(failMsg(c, "stars", e.stars, r.stars, r));
      }
      if (e.grade !== undefined && r.grade !== e.grade) {
        throw new Error(failMsg(c, "grade", e.grade, r.grade, r));
      }
      if (e.passed !== undefined && r.passed !== e.passed) {
        throw new Error(failMsg(c, "passed", e.passed, r.passed, r));
      }
      if (e.slots !== undefined) {
        expect(r.slots, failMsg(c, "slots", e.slots, r.slots, r)).toEqual(e.slots);
      }

      // Invariant: slots always line up with the primary answer word count.
      const answerWords = c.answers[0].trim().split(/\s+/).filter(Boolean).length;
      expect(r.slots.length, `slots.length ${r.slots.length} != ${answerWords}`).toBe(answerWords);
      // Invariant: score stays within [0, 100].
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    });
  }

  test("scoreToQuality maps bands onto SM-2 quality 0–5", () => {
    expect(scoreToQuality(100)).toBe(5);
    expect(scoreToQuality(90)).toBe(5);
    expect(scoreToQuality(89)).toBe(4);
    expect(scoreToQuality(75)).toBe(4);
    expect(scoreToQuality(74)).toBe(3);
    expect(scoreToQuality(PASS_LINE)).toBe(3);
    expect(scoreToQuality(PASS_LINE - 1)).toBe(1);
    expect(scoreToQuality(0)).toBe(1);
  });

  test("a fully correct answer yields no deductions", () => {
    const r = markTranslation(
      ["I", "wake", "up", "at", "seven"],
      ["I get up at seven.", "I wake up at seven."],
    );
    expect(r.deductions).toEqual([]);
    expect(r.score).toBe(100);
  });

  test("deductions report distinct kinds without double-counting substitutions", () => {
    const r = markTranslation(
      ["He", "decided", "to", "change", "xxx", "to", "develop", "his", "zzz"],
      ["He decided to change jobs to develop his career."],
    );
    // Only one "extra" deduction for the two wrong words — no "missing" line.
    expect(r.deductions).toHaveLength(1);
    expect(r.deductions[0].kind).toBe("extra");
    expect(r.deductions[0].count).toBe(2);
    expect(r.deductions[0].points).toBe(24);
  });
});
