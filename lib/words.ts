import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { db, isDbAvailable } from "@/lib/db";
import { dictionaryWord, wordCache } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getDefaultTemplate,
  interpolateTemplate,
  langCodeToName,
} from "@/lib/prompts";
import { detectTextLanguage } from "@/lib/language-detector";

// Fixed CEFR -> CSE table. Mirrors scripts/add-cse-levels.py so the seed
// script and runtime agree on the mapping, with a small bucket at the tails:
//   A1 -> CSE 2 (with the very top 10% most-frequent anchors promoted to CSE 1)
//   A2 -> CSE 3
//   B1 -> CSE 4
//   B2 -> CSE 5
//   C1 -> CSE 6
//   C2 -> CSE 7 (last 30% by frequency split into CSE 8 / CSE 9)
const CEFR_TO_CSE_TABLE: Record<string, string> = {
  A1: "2",
  A2: "3",
  B1: "4",
  B2: "5",
  C1: "6",
  C2: "7",
};

export function cefrToCse(cefr: string, _freqPct: number | undefined): string {
  const upper = (cefr || "").toUpperCase().trim();
  return CEFR_TO_CSE_TABLE[upper] ?? "";
}

export interface WordEntry {
  word: string;
  pos: string;
  cefr_level: string;
  cse_level?: string;
  english_translation: string;
  definition_zh?: string;
  example_sentence_native: string;
  example_sentence_english: string;
  example_zh?: string;
  ipa?: string;
  domain_tags?: string;
  gender: string;
  useful_for_flashcard?: boolean;
  word_frequency?: number;
  goethe_b1_wordlist?: boolean;
}

function rowToWordEntry(row: typeof dictionaryWord.$inferSelect): WordEntry {
  return {
    word: row.word,
    pos: row.pos ?? "",
    cefr_level: row.cefrLevel ?? "",
    cse_level: row.cseLevel ?? undefined,
    english_translation: row.englishTranslation,
    definition_zh: row.definitionZh ?? undefined,
    example_sentence_native: "",
    example_sentence_english: "",
    example_zh: undefined,
    ipa: row.ipa ?? undefined,
    domain_tags: row.domainTags ?? undefined,
    gender: row.gender ?? "",
    useful_for_flashcard: row.usefulForFlashcard ?? true,
    word_frequency: row.wordFrequency ?? undefined,
    goethe_b1_wordlist: row.goetheB1Wordlist ?? undefined,
  };
}

const memoryWordsCache = new Map<string, WordEntry[]>();

async function loadEnglishMergedWords(): Promise<WordEntry[]> {
  const cacheKey = "english_merged";
  if (memoryWordsCache.has(cacheKey)) {
    return memoryWordsCache.get(cacheKey)!;
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "words", "english_merged.json");
    const content = await fs.readFile(filePath, "utf-8");
    const list = JSON.parse(content);
    if (!Array.isArray(list)) return [];

    // english_merged.json is the single source of truth for English words —
    // it already carries definition_zh, ipa, example_sentence_english and
    // cefr_level for every entry, so we don't need to merge with the old
    // words/en/{a1..c2}.json or words/combined_a1_c2.json view files.
    const mapped: WordEntry[] = list.map((w: Record<string, unknown>) =>
      mapJsonToWordEntry(w),
    );

    memoryWordsCache.set(cacheKey, mapped);
    return mapped;
  } catch {
    return [];
  }
}

export function mapJsonToWordEntry(item: Record<string, unknown>): WordEntry {
  const exampleNative =
    (item.example_sentence_english as string) ||
    (item.example as string) ||
    (item.example_sentence_native as string) ||
    "";
  const exampleTranslation =
    (item.example_zh as string) ||
    (item.example_translation as string) ||
    "";

  return {
    word: (item.word as string) || "",
    pos: (item.pos as string) || "",
    cefr_level: (item.level as string) || (item.cefr_level as string) || "",
    cse_level: (item.cse_level as string) || "",
    english_translation: (item.meaning as string) || (item.english_translation as string) || "",
    definition_zh: (item.translation_zh as string) || (item.definition_zh as string) || "",
    example_sentence_native: exampleNative,
    example_sentence_english: exampleTranslation || "",
    example_zh: exampleTranslation,
    ipa: (item.ipa as string) || "",
    domain_tags: (item.domain_tags as string) || "",
    gender: (item.gender as string) || "",
    useful_for_flashcard: (item.useful_for_flashcard as boolean | undefined) ?? true,
    word_frequency: item.frequency !== undefined ? Number(item.frequency) : (Number(item.word_frequency) || 0),
    goethe_b1_wordlist: (item.goethe_b1_wordlist as boolean | undefined) ?? false,
  };
}

export async function getBundledWords(lang: string): Promise<WordEntry[]> {
  const normLang = lang === "english" ? "en" : (lang || "en");
  const cacheKey = `bundled_${normLang}`;
  if (memoryWordsCache.has(cacheKey)) {
    return memoryWordsCache.get(cacheKey)!;
  }

  try {
    if (normLang === "en") {
      const merged = await loadEnglishMergedWords();
      if (merged.length > 0) {
        memoryWordsCache.set(cacheKey, merged);
        return merged;
      }

      const files = ["a1", "a2", "b1", "b2", "c1", "c2"];
      const all: WordEntry[] = [];
      for (const file of files) {
        const levelWords = await loadEnLevelWords(file);
        all.push(...levelWords);
      }
      if (all.length > 0) {
        memoryWordsCache.set(cacheKey, all);
        return all;
      }
    }
    const fileName =
      normLang === "zh" || normLang === "mandarin"
        ? "mandarin"
        : normLang;
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "words", `${fileName}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    const list = JSON.parse(content);
    const mapped: WordEntry[] = list.map((w: Record<string, unknown>) => mapJsonToWordEntry(w));
    memoryWordsCache.set(cacheKey, mapped);
    return mapped;
  } catch (err) {
    console.error("Failed to load words JSON:", err);
  }
  return [];
}

export async function loadEnLevelWords(level: string): Promise<WordEntry[]> {
  const norm = level.toLowerCase().trim();
  const valid = ["a1", "a2", "b1", "b2", "c1", "c2"];
  if (!valid.includes(norm)) return [];

  const cacheKey = `en_level_${norm}`;
  if (memoryWordsCache.has(cacheKey)) {
    return memoryWordsCache.get(cacheKey)!;
  }

  try {
    const merged = await loadEnglishMergedWords();
    const upperLevel = norm.toUpperCase();
    const filtered = merged.filter(
      (word) => (word.cefr_level || "").toUpperCase() === upperLevel,
    );
    if (filtered.length > 0) {
      memoryWordsCache.set(cacheKey, filtered);
      return filtered;
    }
  } catch {
    // Fall back to the legacy per-level JSONs below.
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "words", "en", `${norm}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    const list = JSON.parse(content);
    const mapped: WordEntry[] = list.map((w: Record<string, unknown>) => mapJsonToWordEntry(w));
    memoryWordsCache.set(cacheKey, mapped);
    return mapped;
  } catch {
    return [];
  }
}

let cachedDynamicCounts: Record<string, number> | null = null;

export function getEnLevelCounts(): Record<string, number> {
  if (cachedDynamicCounts) return cachedDynamicCounts;

  const counts: Record<string, number> = {
    A1: 0,
    A2: 0,
    B1: 0,
    B2: 0,
    C1: 0,
    C2: 0,
  };

  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), "words", "english_merged.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const item of list) {
          const lvl = ((item.level as string) || (item.cefr_level as string) || "").toUpperCase().trim();
          if (lvl in counts) {
            counts[lvl]++;
          }
        }
        cachedDynamicCounts = counts;
        return counts;
      }
    }
  } catch (err) {
    console.error("Failed to dynamically count words by level from english_merged.json:", err);
  }

  // Last-known counts from words/english_merged.json after
  // scripts/rebuild-cefr-levels.py. Only used if the file cannot be read.
  return {
    A1: 1163,
    A2: 1642,
    B1: 3989,
    B2: 6069,
    C1: 4412,
    C2: 5049,
  };
}

let cachedWordLevelMap: Record<string, string> | null = null;

export async function getWordToLevelMap(): Promise<Record<string, string>> {
  if (cachedWordLevelMap) return cachedWordLevelMap;
  const map: Record<string, string> = {};
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
  for (const lvl of levels) {
    const words = await loadEnLevelWords(lvl);
    for (const w of words) {
      map[w.word.toLowerCase()] = lvl;
    }
  }
  cachedWordLevelMap = map;
  return map;
}

let cachedWordCseMap: Record<string, string> | null = null;

export async function getWordToCseMap(): Promise<Record<string, string>> {
  if (cachedWordCseMap) return cachedWordCseMap;
  const map: Record<string, string> = {};
  const all = await loadEnglishMergedWords();
  for (const w of all) {
    if (w.cse_level) map[w.word.toLowerCase()] = w.cse_level;
  }
  cachedWordCseMap = map;
  return map;
}

export async function loadLanguageRaw(langCode: string): Promise<WordEntry[]> {
  const normLang = langCode === "english" ? "en" : (langCode || "en");
  if (memoryWordsCache.has(normLang)) {
    return memoryWordsCache.get(normLang)!;
  }

  // Load from bundled JSON data first (instant in-memory / disk read)
  const bundled = await getBundledWords(normLang);
  if (Array.isArray(bundled) && bundled.length > 0) {
    memoryWordsCache.set(normLang, bundled);
    return bundled;
  }

  if (await isDbAvailable()) {
    try {
      const rows = await db
        .select()
        .from(dictionaryWord)
        .where(eq(dictionaryWord.language, normLang));

      if (rows && rows.length > 0) {
        const entries = rows.map(rowToWordEntry);
        memoryWordsCache.set(normLang, entries);
        return entries;
      }
    } catch (err) {
      console.error("Failed to load raw language words from db:", err);
    }
  }

  return [];
}

export async function loadLanguage(
  langCode: string,
): Promise<Map<string, WordEntry>> {
  const words = await loadLanguageRaw(langCode);
  const map = new Map<string, WordEntry>();
  for (const w of words) {
    map.set(w.word.toLowerCase(), w);
  }
  return map;
}

const wordAnalysisSchema = z.object({
  baseForm: z.string().describe("The dictionary/base form of the word"),
  translation: z.string().describe("English translation"),
  pos: z
    .string()
    .describe(
      "Part of speech (noun/verb/adjective/adverb/preposition/conjunction/article/pronoun)",
    ),
  gender: z
    .string()
    .nullable()
    .describe("Grammatical gender if applicable (masculine/feminine/neuter)"),
  cefrLevel: z.string().describe("CEFR level (A1/A2/B1/B2/C1/C2)"),
  cseLevel: z
    .string()
    .nullable()
    .optional()
    .describe("CSE level (1-9, China Standards of English). Optional if unknown."),
  exampleNative: z
    .string()
    .describe("A simple example sentence using this word"),
  exampleEnglish: z
    .string()
    .describe("English translation of the example sentence"),
});

export async function aiLookup(
  word: string,
  language: string,
  nativeLanguage?: string,
) {
  const normalizedWord = word.toLowerCase().trim();
  const wordLang = detectTextLanguage(word, { targetLanguage: language });
  const target_language = langCodeToName[wordLang] || wordLang;
  const native_language = nativeLanguage
    ? langCodeToName[nativeLanguage] || nativeLanguage
    : wordLang === "en"
      ? "Chinese"
      : "English";

  // Check DB cache first
  try {
    const cached = await db
      .select()
      .from(wordCache)
      .where(
        and(eq(wordCache.word, normalizedWord), eq(wordCache.language, wordLang)),
      )
      .limit(1);

    if (cached.length > 0) {
      const c = cached[0];
      return {
        found: true as const,
        source: "ai" as const,
        word: c.baseForm || normalizedWord,
        translation: c.translation,
        pos: c.pos || null,
        gender: c.gender || null,
        cefrLevel: c.cefrLevel || null,
        cseLevel: c.cseLevel || null,
        exampleNative: c.exampleNative || null,
        exampleEnglish: c.exampleEnglish || null,
      };
    }
  } catch {
    // Database connection optional, proceed to AI lookup
  }

  try {
    let prompt: string;
    if (wordLang === "en") {
      prompt = `Analyze the English word "${word}".
Return:
- baseForm: dictionary/base form of the word
- translation: accurate translation or definition in ${native_language}
- pos: part of speech (noun, verb, adjective, etc.)
- gender: null
- cefrLevel: CEFR level (A1, A2, B1, B2, C1, C2)
- exampleNative: a natural example sentence in English using this word
- exampleEnglish: translation of the example sentence in ${native_language}`;
    } else {
      prompt = `Analyze the ${target_language} word "${word}".
Return:
- baseForm: dictionary/base form of the word
- translation: accurate translation or definition in ${native_language}
- pos: part of speech (noun, verb, adjective, etc.)
- gender: grammatical gender if applicable (or null)
- cefrLevel: CEFR level (A1, A2, B1, B2, C1, C2)
- exampleNative: a natural example sentence in ${target_language} using this word
- exampleEnglish: translation of the example sentence in ${native_language}`;
    }

    const schema = wordAnalysisSchema;

    const model = getModel("gemini-3.5-flash-lite");
    const { object: analysis } = await generateObject({
      model,
      schema,
      prompt,
    });

    // Map AI-reported CEFR → CSE bucket (same fixed table as the seed script).
    // The AI may report a CSE level directly; only fall back to the table when
    // it produced something outside 1-9 or empty.
    const aiCse = (analysis.cseLevel ?? "") as string;
    const cseFromAi = /^[1-9]$/.test(aiCse) ? aiCse : cefrToCse(analysis.cefrLevel || "", undefined);

    // Cache in DB (fire and forget)
    db.insert(wordCache)
      .values({
        word: normalizedWord,
        language: wordLang,
        baseForm: analysis.baseForm || normalizedWord,
        translation: analysis.translation,
        pos: analysis.pos || null,
        gender: analysis.gender || null,
        cefrLevel: analysis.cefrLevel || null,
        cseLevel: analysis.cseLevel || null,
        exampleNative: analysis.exampleNative || null,
        exampleEnglish: analysis.exampleEnglish || null,
      })
      .onConflictDoNothing()
      .catch((err: unknown) => {
        console.error("Failed to cache word:", err);
      });

    return {
      found: true as const,
      source: "ai" as const,
      word: analysis.baseForm || word,
      translation: analysis.translation,
      pos: analysis.pos || null,
      gender: analysis.gender || null,
      cefrLevel: analysis.cefrLevel || null,
      cseLevel: analysis.cseLevel || null,
      exampleNative: analysis.exampleNative || null,
      exampleEnglish: analysis.exampleEnglish || null,
    };
  } catch (err) {
    console.error("AI lookup failed:", err);
    return null;
  }
}

export interface WordLookupResult {
  found: boolean;
  source?: "dictionary" | "ai";
  word: string;
  translation?: string;
  definitionZh?: string | null;
  ipa?: string | null;
  pos?: string | null;
  gender?: string | null;
  cefrLevel?: string | null;
  cseLevel?: string | null;
  exampleNative?: string | null;
  exampleEnglish?: string | null;
}

export async function lookupWord(
  word: string,
  language: string,
  nativeLanguage?: string,
): Promise<WordLookupResult> {
  const cleanLookup = word.toLowerCase().trim();
  const wordLang = detectTextLanguage(word, { targetLanguage: language });

  // 1. Fast in-memory bundled dictionary check (ismartcoding/endict + CEFR dictionary)
  if (wordLang === "en" || language === "en" || language === "english") {
    try {
      const enMap = await loadLanguage("en");
      let entry = enMap.get(cleanLookup);
      if (!entry && cleanLookup.endsWith("s") && cleanLookup.length > 3) {
        entry = enMap.get(cleanLookup.slice(0, -1)) || enMap.get(cleanLookup.slice(0, -2));
      }
      if (!entry && cleanLookup.endsWith("ed") && cleanLookup.length > 4) {
        entry = enMap.get(cleanLookup.slice(0, -2)) || enMap.get(cleanLookup.slice(0, -1));
      }
      if (!entry && cleanLookup.endsWith("ing") && cleanLookup.length > 5) {
        entry = enMap.get(cleanLookup.slice(0, -3)) || enMap.get(cleanLookup.slice(0, -3) + "e");
      }
      if (entry) {
        return {
          found: true,
          source: "dictionary",
          word: entry.word,
          translation: entry.definition_zh || entry.english_translation,
          definitionZh: entry.definition_zh || null,
          ipa: entry.ipa || null,
          pos: entry.pos || null,
          gender: entry.gender || null,
          cefrLevel: entry.cefr_level || null,
          cseLevel: entry.cse_level || null,
          exampleNative: entry.example_sentence_native || null,
          exampleEnglish: entry.example_zh || entry.example_sentence_english || null,
        };
      }
    } catch {}
  }

  // 2. Try dictionary database with wordLang or course language
  try {
    const entries = await db
      .select()
      .from(dictionaryWord)
      .where(
        and(
          eq(dictionaryWord.word, cleanLookup),
        ),
      )
      .limit(5);

    // Look for exact language match
    const exactMatch = entries.find(
      (e) => e.language === wordLang || e.language === language
    ) || entries[0];

    if (exactMatch) {
      return {
        found: true,
        source: "dictionary",
        word: exactMatch.word,
        translation: exactMatch.definitionZh || exactMatch.englishTranslation,
        definitionZh: exactMatch.definitionZh || null,
        ipa: exactMatch.ipa || null,
        pos: exactMatch.pos,
        gender: exactMatch.gender || null,
        cefrLevel: exactMatch.cefrLevel,
        cseLevel: exactMatch.cseLevel,
        exampleNative: exactMatch.exampleSentenceNative,
        exampleEnglish: exactMatch.exampleSentenceEnglish,
      };
    }
  } catch {
    // Fall back to AI if DB is unreachable
  }

  // 3. Try AI fallback with detected language
  const aiResult = await aiLookup(word, wordLang, nativeLanguage);
  if (aiResult) {
    return aiResult;
  }

  // 4. Not found
  return { found: false, word };
}

export async function getWordsByLevel(
  language: string,
  level: string,
): Promise<WordEntry[]> {
  const upperLevel = level.toUpperCase();
  const langKey = (language || "en").toLowerCase();

  if (langKey === "en" || langKey === "english") {
    try {
      const levelWords = await loadEnLevelWords(upperLevel);
      if (levelWords && levelWords.length > 0) {
        return levelWords;
      }
    } catch {}
  }

  if (await isDbAvailable()) {
    try {
      const rows = await db
        .select()
        .from(dictionaryWord)
        .where(
          and(
            eq(dictionaryWord.language, language),
            eq(dictionaryWord.cefrLevel, upperLevel),
          ),
        );

      if (rows && rows.length > 0) {
        return rows.filter((r) => r.usefulForFlashcard !== false).map(rowToWordEntry);
      }
    } catch (err) {
      console.error("Failed to get words by level from DB:", err);
    }
  }

  // Fallback to loading all words for language
  const allWords = await loadLanguageRaw(language);
  return allWords.filter(
    (w) => w.cefr_level?.toUpperCase() === upperLevel && w.useful_for_flashcard !== false
  );
}
