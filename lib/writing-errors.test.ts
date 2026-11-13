import { describe, expect, test } from "bun:test";
import { markTranslation } from "./marking";
import {
  normalizeSpans,
  spansFromMarking,
  spansFromPhrases,
  splitBySpans,
  tokenizeWithOffsets,
} from "./writing-errors";

const MODEL =
  "I have a good friend at school. His name is Xiao Ming. We sit at the same desk. After class we play together. He runs very fast. I like to play football with him. He is good at math and often helps me. We go home together every day. We are best friends.";

const LEARNER =
  "I have a very good friend at school. His name is Xiao Ming. We sit together in a same table. We play together after school. He runs very fast. I like to play footballs with him. He is good at Math, and always helps me on question. We go back home together everyday. We are best friends.";

describe("tokenizeWithOffsets", () => {
  test("keeps exact offsets including punctuation and newlines", () => {
    const text = "Hello,  world\nagain";
    const toks = tokenizeWithOffsets(text);
    expect(toks.map((t) => t.token)).toEqual(["Hello,", "world", "again"]);
    for (const t of toks) {
      expect(text.slice(t.start, t.end)).toBe(t.token);
    }
  });
});

describe("normalizeSpans", () => {
  test("clamps, sorts and merges overlapping ranges", () => {
    expect(
      normalizeSpans(
        [
          { start: 10, end: 14 },
          { start: 2, end: 6 },
          { start: 5, end: 9 },
          { start: -3, end: 999 },
        ],
        20,
      ),
    ).toEqual([{ start: 0, end: 20 }]);
  });

  test("drops empty / out-of-bounds ranges", () => {
    expect(
      normalizeSpans([{ start: 5, end: 5 }, { start: 50, end: 60 }], 10),
    ).toEqual([]);
  });
});

describe("spansFromMarking", () => {
  test("marks only extra/typo learner words and never breaks the text", () => {
    const marking = markTranslation(LEARNER.split(/\s+/), [MODEL]);
    const spans = spansFromMarking(LEARNER, marking, [MODEL]);

    expect(marking.userTokens.length).toBe(LEARNER.split(/\s+/).length);
    expect(spans.length).toBeGreaterThan(0);

    const highlighted = spans.map((s) => LEARNER.slice(s.start, s.end));
    // Punctuation is left outside the highlight.
    expect(highlighted.every((w) => /^[\p{L}\p{N}'-]+$/u.test(w))).toBe(true);
    // Obvious wrong words are caught, while correct duplicates such as the
    // "He" / "very" in "He runs very fast" must NOT be painted red.
    expect(highlighted).toContain("footballs");
    expect(highlighted).toContain("table");
    expect(highlighted).toContain("everyday");
    expect(highlighted).not.toContain("He");
    expect(highlighted).not.toContain("very");
    // Reassembling the segments must reproduce the original essay exactly.
    expect(splitBySpans(LEARNER, spans).map((s) => s.text).join("")).toBe(LEARNER);
  });

  test("a perfect answer produces no highlighted words", () => {
    const marking = markTranslation(MODEL.split(/\s+/), [MODEL]);
    expect(spansFromMarking(MODEL, marking, [MODEL])).toEqual([]);
  });
});

describe("spansFromPhrases", () => {
  test("matches case-insensitively and ignores invented phrases", () => {
    const text = "I like to play footballs with him.";
    const spans = spansFromPhrases(text, ["FOOTBALLS", "not in the essay"]);
    expect(spans).toEqual([{ start: 15, end: 24 }]);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("footballs");
  });

  test("does not match a short word inside a longer word", () => {
    const text = "We sit at the same table.";
    // "he" only occurs inside "the" — the boundary guard must reject it.
    expect(spansFromPhrases(text, ["he"])).toEqual([]);
    expect(spansFromPhrases(text, ["at"])).toEqual([{ start: 7, end: 9 }]);
  });

  test("supports multi-word phrases", () => {
    const text = "He always helps me on question.";
    const spans = spansFromPhrases(text, ["on question"]);
    expect(spans).toEqual([{ start: 19, end: 30 }]);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("on question");
  });
});

describe("splitBySpans", () => {
  test("returns one plain segment when there are no errors", () => {
    expect(splitBySpans("all good", [])).toEqual([
      { text: "all good", error: false },
    ]);
  });

  test("preserves newlines and whitespace outside the marked ranges", () => {
    const text = "line one\nline two";
    const spans = [{ start: 5, end: 8 }];
    const segs = splitBySpans(text, spans);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.error).map((s) => s.text)).toEqual(["one"]);
  });
});
