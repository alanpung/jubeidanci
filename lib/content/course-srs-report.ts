/**
 * Owner-only report: SRS-word counts per course, bucketed by the dictionary's
 * real CEFR level (A1–C2) plus an "Unknown" bucket for words/phrases that are
 * not found in the bundled English dictionary.
 *
 * This reads the committed `content/*.md` unit files directly (the source of
 * truth for `srsWords`) rather than the DB-backed course copies, so it reflects
 * what will ship. It is gated to the owner in the page that calls it.
 */

import { readdirSync, readFileSync } from "fs";
import path from "path";

import { parseUnitMarkdown } from "./unit-parser";

const CONTENT_DIR = path.join(process.cwd(), "content");
const DICT_PATH = path.join(process.cwd(), "words", "english_merged.json");

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_ORDER: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface CourseSrsRow {
  courseId: string;
  /** The course's own declared level (A1–C2). */
  level: string;
  kind: "flashcard" | "translation";
  /** Total srsWords across every exercise in the course. */
  total: number;
  byLevel: Record<Cefr, number>;
  /** srsWords (or their tokens) not found in the dictionary. */
  unknown: number;
}

function buildDictionary(): Map<string, string> {
  try {
    const raw = JSON.parse(readFileSync(DICT_PATH, "utf8")) as Array<Record<string, unknown>>;
    const m = new Map<string, string>();
    for (const it of raw) {
      const w = String(it.word ?? it.baseForm ?? "")
        .toLowerCase()
        .trim();
      const lvl = String(it.cefr_level ?? it.level ?? "")
        .toUpperCase()
        .trim();
      if (w && lvl && !m.has(w)) m.set(w, lvl);
    }
    return m;
  } catch {
    return new Map();
  }
}

/**
 * Resolve one srsWord to a CEFR level.
 *  - exact phrase match in the dictionary wins;
 *  - otherwise take the highest CEFR level among its alphabetical tokens;
 *  - if nothing is found, return null (counted as Unknown).
 */
function levelForWord(word: string, dict: Map<string, string>): Cefr | null {
  const norm = word.toLowerCase().trim();
  if (!norm) return null;

  const exact = dict.get(norm);
  if (exact && (CEFR_ORDER as string[]).includes(exact)) return exact as Cefr;

  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  let best: Cefr | null = null;
  for (const t of tokens) {
    const l = dict.get(t);
    if (l && (CEFR_ORDER as string[]).includes(l)) {
      if (!best || CEFR_ORDER.indexOf(l as Cefr) > CEFR_ORDER.indexOf(best)) {
        best = l as Cefr;
      }
    }
  }
  return best;
}

export function getCourseSrsReport(): CourseSrsRow[] {
  const dict = buildDictionary();

  const files = readdirSync(CONTENT_DIR).filter(
    (f) => /[^.]+\.md$/.test(f) && f.includes("unit"),
  );

  const byCourse = new Map<string, CourseSrsRow>();

  for (const f of files) {
    const src = readFileSync(path.join(CONTENT_DIR, f), "utf8");

    const cidMatch = src.match(/^courseId:\s*"([^"]+)"/m) ?? src.match(/^courseId:\s*(\S+)/m);
    const lvlMatch = src.match(/^level:\s*"([^"]+)"/m) ?? src.match(/^level:\s*(\S+)/m);
    const courseId = cidMatch ? cidMatch[1] : f.replace(/\.md$/, "");
    const level = lvlMatch ? lvlMatch[1].replace(/"/g, "") : "";

    let doc;
    try {
      doc = parseUnitMarkdown(src);
    } catch {
      continue;
    }

    if (!byCourse.has(courseId)) {
      byCourse.set(courseId, {
        courseId,
        level,
        kind: courseId.includes("flashcard") ? "flashcard" : "translation",
        total: 0,
        byLevel: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
        unknown: 0,
      });
    }
    const row = byCourse.get(courseId)!;

    for (const lesson of doc.lessons) {
      for (const ex of lesson.exercises) {
        const sw = (ex as { srsWords?: string | string[] }).srsWords;
        if (!sw) continue;
        const words = Array.isArray(sw) ? sw : [sw];
        for (const w of words) {
          row.total++;
          const lvl = levelForWord(w, dict);
          if (lvl) row.byLevel[lvl]++;
          else row.unknown++;
        }
      }
    }
  }

  const rows = Array.from(byCourse.values());
  rows.sort((a, b) => {
    const la = CEFR_ORDER.indexOf(a.level as Cefr);
    const lb = CEFR_ORDER.indexOf(b.level as Cefr);
    if (la !== lb) return la - lb;
    return a.kind.localeCompare(b.kind);
  });
  return rows;
}
