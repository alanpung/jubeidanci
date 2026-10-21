/**
 * Scan a unit's raw markdown and return the line/character range of each
 * lesson so the markdown editor can offer a "jump to Lesson N" filter and
 * highlight which lesson a given line belongs to.
 *
 * Lesson delimiters in the unit markdown are the front-matter lines of the
 * form `lessonTitle: "Lesson N: ..."` (optionally `lesson N`). Lines between
 * two `lessonTitle:` lines belong to the earlier lesson; the first lesson
 * starts at line 0, and the last lesson extends to the end of the file.
 */

export interface LessonBlockRange {
  /** 1-based lesson number as it appears in the markdown. */
  lessonIndex: number;
  /** Display title, e.g. "Lesson 3: Morning Habits". */
  title: string;
  /** 0-based start line (inclusive). */
  startLine: number;
  /** 0-based end line (exclusive). */
  endLine: number;
  /** Character offset of the start line in the markdown. */
  charStart: number;
  /** Character offset of the line right after `endLine`. */
  charEnd: number;
}

const LESSON_HEADER = /^[ \t]*lesson(?:Title)?\s*:\s*["']?(?:[Ll]esson\s*)?(\d+)(?:\s*[:\-.][^"']*?)?["']?\s*$/;

export function getLessonLineRanges(markdown: string): LessonBlockRange[] {
  const lines = markdown.split(/\r?\n/);
  // Map line index -> char offset of that line's start
  const lineOffsets: number[] = [];
  let acc = 0;
  for (const ln of lines) {
    lineOffsets.push(acc);
    acc += ln.length + 1; // +1 for the newline
  }

  const ranges: LessonBlockRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LESSON_HEADER);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    let title = `Lesson ${n}`;
    const tq = lines[i].match(/^[^"]*["']([^"']+)["']/);
    if (tq) title = tq[1];
    else {
      const after = lines[i].slice(lines[i].indexOf(String(n)) + String(n).length).replace(/^[\s:.\-]+/, "").trim();
      if (after) title = `Lesson ${n}: ${after}`;
    }
    ranges.push({
      lessonIndex: n,
      title,
      startLine: i,
      endLine: lines.length, // filled in below
      charStart: lineOffsets[i],
      charEnd: markdown.length,
    });
  }

  if (ranges.length === 0) return ranges;

  // Close each range: the start of the NEXT header is the previous range's end.
  for (let r = 0; r < ranges.length - 1; r++) {
    const next = ranges[r + 1];
    ranges[r].endLine = next.startLine;
    ranges[r].charEnd = next.charStart;
  }

  return ranges.sort((a, b) => a.lessonIndex - b.lessonIndex);
}

/**
 * Given a character offset into the markdown and the parsed lesson ranges,
 * return the 1-based lesson index the offset belongs to. If the offset sits
 * before the first lesson header, returns 0 (the unit-introduction preamble).
 */
export function lessonIndexAtChar(charOffset: number, ranges: LessonBlockRange[]): number {
  if (ranges.length === 0) return 0;
  for (const r of ranges) {
    if (charOffset >= r.charStart && charOffset < r.charEnd) return r.lessonIndex;
  }
  return ranges[ranges.length - 1].lessonIndex;
}
