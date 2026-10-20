import { NextRequest, NextResponse } from "next/server";
import { loadEnLevelWords, loadEnCseLevelWords, getBundledWords, type WordEntry } from "@/lib/words";
import { cefrToCse } from "@/lib/cse";
import { db, isDbAvailable } from "@/lib/db";
import { dictionaryWord } from "@/lib/db/schema";

const POS_ALIASES: Record<string, string[]> = {
  noun: ["noun", "n", "n."],
  verb: ["verb", "v", "v.", "vt.", "vi.", "be-verb", "have-verb", "do-verb", "modal", "auxiliary", "aux."],
  adjective: ["adjective", "adj", "adj.", "a", "a.", "s."],
  adverb: ["adverb", "adv", "adv.", "r", "r."],
  preposition: ["preposition", "prep", "prep.", "pp"],
  conjunction: ["conjunction", "conj", "conj.", "cj"],
  pronoun: ["pronoun", "pron", "pron.", "pn"],
  determiner: ["determiner", "det", "det.", "article", "art", "art."],
  numeral: ["numeral", "num", "num.", "number"],
  interjection: ["interjection", "intj", "int", "interj."],
};

function extractPosSet(w: WordEntry): Set<string> {
  const set = new Set<string>();
  const rawPos = (w.pos || "").toLowerCase().trim();
  if (rawPos) {
    for (const [key, aliases] of Object.entries(POS_ALIASES)) {
      if (aliases.includes(rawPos) || rawPos.split(/[,/;\s]+/).some((p) => aliases.includes(p))) {
        set.add(key);
      }
    }
  }

  const combinedText = `${w.english_translation || ""} ； ${w.definition_zh || ""}`;
  const regex = /(?:^|[；;]\s*|\s+)([a-z]+)\./gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(combinedText)) !== null) {
    const token = `${match[1].toLowerCase()}.`;
    for (const [key, aliases] of Object.entries(POS_ALIASES)) {
      if (aliases.includes(token)) {
        set.add(key);
      }
    }
  }
  return set;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get("lang") || "en";
    const level = searchParams.get("level") || "";
    const cseLevel = (searchParams.get("cseLevel") || "").trim();
    const letter = (searchParams.get("letter") || "").trim().toUpperCase();
    const pos = (searchParams.get("pos") || "").trim().toLowerCase();
    const q = (searchParams.get("q") || "").toLowerCase().trim();
    const wordsParam = (searchParams.get("words") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "50", 10)));

    let allWords: WordEntry[];
    if ((lang === "en" || lang === "english") && level) {
      const levelWords = await loadEnLevelWords(level);
      allWords = levelWords.length > 0 ? levelWords : await getBundledWords(lang);
    } else if ((lang === "en" || lang === "english") && cseLevel) {
      const cseWords = await loadEnCseLevelWords(cseLevel);
      allWords = cseWords.length > 0 ? cseWords : await getBundledWords(lang);
    } else {
      allWords = await getBundledWords(lang);
    }

    let filtered: WordEntry[] = allWords;

    if (wordsParam) {
      const targetSet = new Set(
        wordsParam
          .split(",")
          .map((w) => w.toLowerCase().trim())
          .filter(Boolean)
      );
      filtered = filtered.filter((w) => targetSet.has(w.word.toLowerCase().trim()));
    }

    // Filter by CEFR Level
    if (level && allWords.length > 0 && allWords[0]?.cefr_level !== level) {
      filtered = filtered.filter((w: WordEntry) => w.cefr_level?.toUpperCase() === level.toUpperCase());
    }

    // Filter by CSE Level (China Standards of English) — derived from CEFR
    // now that the per-word `cse_level` field is gone from the dictionary.
    if (cseLevel) {
      const target =
        cseLevel === "5_6" || cseLevel === "5-6"
          ? ["5", "6"]
          : cseLevel === "8_9" || cseLevel === "8-9"
            ? ["8", "9"]
            : [cseLevel];
      filtered = filtered.filter((w: WordEntry) =>
        target.includes(cefrToCse(w.cefr_level || ""))
      );
    }

    // Filter by A-Z Letter
    if (letter && letter !== "ALL") {
      if (letter === "#") {
        filtered = filtered.filter((w: WordEntry) => {
          const firstChar = (w.word || "").trim().charAt(0);
          return !/[a-zA-Z]/.test(firstChar);
        });
      } else {
        filtered = filtered.filter((w: WordEntry) => {
          const cleanWord = (w.word || "").trim().replace(/^['"-]/, "").toUpperCase();
          return cleanWord.startsWith(letter);
        });
      }
    }

    // Filter by Part of Speech (POS)
    if (pos && pos !== "all") {
      filtered = filtered.filter((w: WordEntry) => {
        const posSet = extractPosSet(w);
        if (posSet.has(pos)) return true;
        const validAliases = POS_ALIASES[pos] || [pos];
        const itemPos = (w.pos || "").toLowerCase().trim();
        return validAliases.some((alias) => itemPos.includes(alias));
      });
    }

    // Filter by Search Query
    if (q) {
      filtered = filtered.filter(
        (w: WordEntry) =>
          w.word.toLowerCase().includes(q) ||
          w.english_translation.toLowerCase().includes(q) ||
          (Boolean(w.definition_zh) && w.definition_zh!.toLowerCase().includes(q))
      );
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const words = filtered.slice(startIndex, startIndex + limit);

    // ─── OPTIMIZED SELECTIVE DB OVERRIDES FETCH ───
    const dbAvailable = await isDbAvailable();
    if (dbAvailable && words.length > 0) {
      try {
        const { and, eq, inArray } = await import("drizzle-orm");
        const wordsMap = new Map<string, typeof dictionaryWord.$inferSelect>();
        const overrides = await db
          .select()
          .from(dictionaryWord)
          .where(
            and(
              eq(dictionaryWord.language, lang === "english" ? "en" : lang),
              inArray(dictionaryWord.word, words.map((w) => w.word.toLowerCase().trim()))
            )
          );
        overrides.forEach((o) => wordsMap.set(o.word.toLowerCase().trim(), o));

        // Overwrite JSON translation with the DB customized/enriched translation if available
        words.forEach((w) => {
          const match = wordsMap.get(w.word.toLowerCase().trim());
          if (match) {
            w.english_translation = match.englishTranslation || w.english_translation;
            w.definition_zh = match.definitionZh || w.definition_zh;
          }
        });
      } catch (dbErr) {
        console.error("DB overrides fetch failed:", dbErr);
      }
    }

    return NextResponse.json({
      words,
      total,
      hasMore: startIndex + limit < total,
    });
  } catch (err) {
    console.error("Error in /api/words:", err);
    return NextResponse.json({ words: [], total: 0, hasMore: false }, { status: 500 });
  }
}
