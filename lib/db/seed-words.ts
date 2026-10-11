import fs from "fs/promises";
import path from "path";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./index";
import { dictionaryWord } from "./schema";
import { supportedLanguages } from "../languages";

interface RawWord {
  word: string;
  pos?: string;
  cefr_level?: string;
  english_translation: string;
  definition_zh?: string;
  example_sentence_native?: string;
  example_sentence_english?: string;
  example_zh?: string;
  ipa?: string;
  domain_tags?: string;
  gender?: string;
  word_frequency?: number;
  useful_for_flashcard?: boolean;
  goethe_b1_wordlist?: boolean;
}

async function backfillGoetheB1Wordlist(langCode: string, filePath: string) {
  const raw = await fs.readFile(filePath, "utf-8");
  const allWords: RawWord[] = JSON.parse(raw);

  const goetheWordMap = new Map<string, RawWord>();
  for (const word of allWords) {
    if (!word.word || !word.english_translation || word.goethe_b1_wordlist !== true) continue;
    if (!goetheWordMap.has(word.word)) {
      goetheWordMap.set(word.word, word);
    }
  }
  const goetheWords = Array.from(goetheWordMap.values());

  if (goetheWords.length === 0) return;

  // 1) Insert missing Goethe words.
  const CHUNK = 500;
  for (let i = 0; i < goetheWords.length; i += CHUNK) {
    const chunk = goetheWords.slice(i, i + CHUNK);
    const rows = chunk.map((w) => ({
      word: w.word,
      language: langCode,
      pos: w.pos ?? null,
      cefrLevel: w.cefr_level ?? null,
      englishTranslation: w.english_translation,
      exampleSentenceNative: w.example_sentence_native ?? null,
      exampleSentenceEnglish: w.example_sentence_english ?? null,
      gender: w.gender ?? null,
      wordFrequency: w.word_frequency ?? null,
      usefulForFlashcard: w.useful_for_flashcard ?? true,
      goetheB1Wordlist: true,
    }));
    await db.insert(dictionaryWord).values(rows).onConflictDoNothing();
  }

  // 2) For existing rows, set flag only when currently NULL.
  for (let i = 0; i < goetheWords.length; i += CHUNK) {
    const chunk = goetheWords.slice(i, i + CHUNK).map((w) => w.word);
    await db
      .update(dictionaryWord)
      .set({ goetheB1Wordlist: true })
      .where(
        and(
          eq(dictionaryWord.language, langCode),
          inArray(dictionaryWord.word, chunk),
          isNull(dictionaryWord.goetheB1Wordlist)
        )
      );
  }

  console.log(`  ${langCode}: synced goethe_b1_wordlist for ${goetheWords.length} words`);
}

export async function seedWords() {
  for (const [langCode, fileName] of Object.entries(supportedLanguages)) {
    const filePath = path.join(process.cwd(), "words", `${fileName}.json`);
    
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      console.log(`  Skipping ${langCode} — no file at ${filePath}`);
      continue;
    }

    const allWords: RawWord[] = JSON.parse(raw);
    const words = allWords.filter((w) => w.word && w.english_translation);

    const [{ n }] = await db
      .select({ n: count() })
      .from(dictionaryWord)
      .where(eq(dictionaryWord.language, langCode));

    console.log(`  ${langCode}: DB currently has ${n} words. Syncing ${words.length} file entries...`);

    // Batch insert in chunks of 500 with onConflictDoNothing
    const CHUNK = 500;
    for (let i = 0; i < words.length; i += CHUNK) {
      const chunk = words.slice(i, i + CHUNK);
      const rows = chunk.map((w) => ({
        word: w.word,
        language: langCode,
        pos: w.pos ?? null,
        cefrLevel: w.cefr_level ?? null,
        englishTranslation: w.english_translation,
        definitionZh: w.definition_zh ?? null,
        exampleSentenceNative: w.example_sentence_native ?? null,
        exampleSentenceEnglish: w.example_sentence_english ?? null,
        exampleZh: w.example_zh ?? null,
        ipa: w.ipa ?? null,
        domainTags: w.domain_tags ?? null,
        gender: w.gender ?? null,
        wordFrequency: w.word_frequency ?? null,
        usefulForFlashcard: w.useful_for_flashcard ?? true,
        goetheB1Wordlist: w.goethe_b1_wordlist ?? null,
      }));

      await db
        .insert(dictionaryWord)
        .values(rows)
        .onConflictDoNothing();
    }

    // Sync Goethe B1 wordlist flags if applicable
    try {
      await backfillGoetheB1Wordlist(langCode, filePath);
    } catch {
      // ignore
    }
  }
}
