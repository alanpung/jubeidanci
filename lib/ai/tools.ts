import { tool } from "ai";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, client } from "@/lib/db";
import {
  userMemory,
  unit,
  userStats,
  userPreferences,
  dictionaryWord,
  srsCard,
  article,
} from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { parseExercise } from "@/lib/content/parser";
import { langCodeToName } from "@/lib/prompts";
import { supportedLanguages } from "@/lib/languages";
import { parseUnitMarkdown } from "@/lib/content/loader";
import { loadEnLevelWords, getBundledWords, type WordEntry } from "@/lib/words";
import { upsertLocalCard } from "@/lib/srs-store";

const ALLOWED_TABLE = /\bsrs_card\b/i;
const FORBIDDEN_TABLES =
  /\b(user|session|account|verification|user_stats|user_preferences|user_course_enrollment|lesson_completion|exercise_attempt|daily_activity|dictionary_word|word_cache|user_memory|course|unit|audio_cache|chat_conversation|article)\b/i;

export function createTools(userId: string, language?: string) {
  return {
    syncToGitHub: tool({
      description:
        "Sync and push the entire codebase to the user's configured GitHub repository. Uses the repository URL and token already configured in the user's Settings, so you don't need to ask for their token or repository URL if already configured.",
      inputSchema: z.object({
        commitMessage: z
          .string()
          .optional()
          .describe("Optional commit message describing what changes to push"),
      }),
      execute: async ({ commitMessage }) => {
        try {
          const { syncToGitHub: doSync } = await import(
            "@/lib/actions/github-sync"
          );
          const result = await doSync(commitMessage);
          return result;
        } catch (err) {
          return {
            success: false,
            message: `GitHub sync error: ${(err as Error).message}. You can configure your repository URL and Personal Access Token in Settings.`,
          };
        }
      },
    }),
    getCurriculumWords: tool({
      description:
        "Directly query and retrieve official CEFR curriculum vocabulary (from the comprehensive A1, A2, B1, B2, C1, C2 word bank JSON files). Use this tool whenever creating questions, quizzes, flashcards, exercises, or units so you have rich authentic vocabulary, translations, parts of speech, and example sentences without needing the user to have SRS cards.",
      inputSchema: z.object({
        level: z
          .enum(["A1", "A2", "B1", "B2", "C1", "C2"])
          .optional()
          .describe(
            "CEFR level to fetch words from (A1, A2, B1, B2, C1, C2). If omitted, can search across all levels.",
          ),
        query: z
          .string()
          .optional()
          .describe(
            "Search term or topic keyword (matches word, English translation, definition, or example sentence)",
          ),
        pos: z
          .enum([
            "noun",
            "verb",
            "adjective",
            "adverb",
            "preposition",
            "conjunction",
            "pronoun",
            "determiner",
          ])
          .optional()
          .describe("Filter by part of speech"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Number of words to return (default 10, max 50)"),
        random: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Whether to randomly shuffle matching words to give varied practice questions",
          ),
      }),
      execute: async ({ level, query, pos, limit = 10, random = true }) => {
        try {
          const normLang = language === "english" ? "en" : (language || "en");
          let entries: WordEntry[] = [];

          if (level) {
            entries = await loadEnLevelWords(level);
          } else {
            entries = await getBundledWords(normLang);
          }

          if (!entries || entries.length === 0) {
            entries = await getBundledWords(normLang);
          }

          let filtered = entries;

          if (level) {
            const targetLvl = level.toUpperCase().trim();
            filtered = filtered.filter(
              (w) => (w.cefr_level || "").toUpperCase().trim() === targetLvl,
            );
          }

          if (pos) {
            const targetPos = pos.toLowerCase().trim();
            filtered = filtered.filter((w) =>
              (w.pos || "").toLowerCase().includes(targetPos),
            );
          }

          if (query && query.trim()) {
            const q = query.toLowerCase().trim();
            filtered = filtered.filter(
              (w) =>
                w.word.toLowerCase().includes(q) ||
                (w.english_translation &&
                  w.english_translation.toLowerCase().includes(q)) ||
                (w.definition_zh &&
                  w.definition_zh.toLowerCase().includes(q)) ||
                (w.example_sentence_native &&
                  w.example_sentence_native.toLowerCase().includes(q)),
            );
          }

          const totalMatched = filtered.length;
          const pool = [...filtered];

          if (random && pool.length > 0) {
            for (let i = pool.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [pool[i], pool[j]] = [pool[j], pool[i]];
            }
          }

          const selected = pool.slice(0, limit).map((w) => ({
            word: w.word,
            cefr_level: w.cefr_level,
            pos: w.pos,
            english_translation: w.english_translation,
            definition_zh: w.definition_zh,
            example_sentence_native: w.example_sentence_native,
            example_sentence_english: w.example_sentence_english,
            ipa: w.ipa,
          }));

          return {
            success: true,
            totalMatched,
            count: selected.length,
            words: selected,
          };
        } catch (err) {
          console.error("getCurriculumWords failed:", err);
          return {
            success: false,
            error: (err as Error).message,
            words: [],
          };
        }
      },
    }),
    readMemory: tool({
      description:
        "Read everything stored in the user's memory. Returns free-text notes that accumulate over time.",
      inputSchema: z.object({}),
      execute: async () => {
        const [row] = await db
          .select()
          .from(userMemory)
          .where(
            and(eq(userMemory.userId, userId), eq(userMemory.key, "memory")),
          )
          .limit(1);
        return row
          ? { found: true, value: row.value }
          : { found: false, value: "" };
      },
    }),

    addMemory: tool({
      description:
        "Append a line to the user's memory. The text is added after a line break at the end of existing memory.",
      inputSchema: z.object({
        text: z.string().describe("The text to append to memory"),
      }),
      execute: async ({ text }) => {
        const [existing] = await db
          .select()
          .from(userMemory)
          .where(
            and(eq(userMemory.userId, userId), eq(userMemory.key, "memory")),
          )
          .limit(1);

        const newValue = existing ? existing.value + "\n" + text : text;

        await db
          .insert(userMemory)
          .values({ userId, key: "memory", value: newValue })
          .onConflictDoUpdate({
            target: [userMemory.userId, userMemory.key],
            set: { value: newValue, updatedAt: new Date() },
          });
        return { success: true };
      },
    }),

    rewriteAllMemory: tool({
      description:
        "Replace the user's entire memory with new content. Use when memory needs to be reorganized or cleaned up.",
      inputSchema: z.object({
        value: z
          .string()
          .describe("The new content to replace all existing memory"),
      }),
      execute: async ({ value }) => {
        await db
          .insert(userMemory)
          .values({ userId, key: "memory", value })
          .onConflictDoUpdate({
            target: [userMemory.userId, userMemory.key],
            set: { value, updatedAt: new Date() },
          });
        return { success: true };
      },
    }),

    srs: tool({
      description:
        "Execute SQL on the srs_card table. $1 is always bound to the current user's ID. Returns rows for SELECT, or affected row count for mutations. Only the srs_card table is accessible.",
      inputSchema: z.object({
        sql: z.string().describe("SQL query — use $1 for user_id"),
      }),
      execute: async ({ sql: query }) => {
        if (!ALLOWED_TABLE.test(query)) {
          return { error: "Query must reference the srs_card table." };
        }
        if (FORBIDDEN_TABLES.test(query)) {
          return {
            error: "Access denied: only the srs_card table is accessible.",
          };
        }

        try {
          const rows = await client.unsafe(query, [userId]);
          const isSelect = /^\s*select/i.test(query);
          if (isSelect) {
            return { rows: Array.from(rows), count: rows.length };
          }
          return { affected: rows.count ?? rows.length };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    presentExercise: tool({
      description:
        "Present an interactive exercise to the user. Pass the exercise as a markdown block (starting with the [type] tag) using the exercise syntax from the system prompt. The tool parses and renders it as an interactive widget. Present ONE exercise at a time and wait for the user to complete it before presenting another.",
      inputSchema: z.object({
        markdown: z
          .string()
          .describe(
            'Exercise markdown block starting with [type-tag], e.g. \'[multiple-choice]\\ntext: "What does gato mean?"\\n- "Cat" (correct)\\n- "Dog"\'',
          ),
      }),
      execute: async ({ markdown }) => {
        try {
          const exercise = parseExercise(markdown);
          return { success: true, exercise };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      },
    }),

    createUnit: tool({
      description:
        "Create a learning unit from exercise markdown. The markdown MUST include ALL metadata in YAML frontmatter: title, description, icon, color, targetLanguage, sourceLanguage, and level. Then ## Lesson sections with exercises. This tool parses, validates, and inserts into the DB.",
      inputSchema: z.object({
        markdown: z
          .string()
          .describe(
            "Complete unit markdown with YAML frontmatter (title, description, icon, color, targetLanguage, sourceLanguage, level) and ## Lesson sections containing exercises",
          ),
        courseId: z
          .string()
          .optional()
          .describe(
            "Optional course ID to assign this unit to. Overrides courseId from frontmatter if provided.",
          ),
      }),
      execute: async ({ markdown, courseId: courseIdParam }) => {
        // Read fresh from DB — the user may have switched languages mid-conversation
        const [prefRow] = await db
          .select({ targetLanguage: userPreferences.targetLanguage })
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);
        const fallbackLang = prefRow?.targetLanguage ?? language ?? "de";

        const cleaned = markdown
          .replace(/^```(?:markdown|md)?\n/m, "")
          .replace(/\n```\s*$/, "")
          .trim();

        let parsedUnit;
        const unitId = crypto.randomUUID();
        try {
          parsedUnit = parseUnitMarkdown(cleaned);
        } catch (err) {
          return {
            success: false,
            error: `Failed to parse markdown: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        // targetLanguage is required — fall back to user preference if missing from frontmatter
        const targetLanguage = parsedUnit.targetLanguage ?? fallbackLang;

        // Tool param overrides frontmatter courseId
        const courseId = courseIdParam ?? parsedUnit.courseId;

        await db.insert(unit).values({
          id: unitId,
          courseId,
          title: parsedUnit.title,
          description: parsedUnit.description,
          icon: parsedUnit.icon,
          color: parsedUnit.color,
          markdown: cleaned,
          targetLanguage,
          sourceLanguage: parsedUnit.sourceLanguage,
          level: parsedUnit.level,
          createdBy: userId,
        });

        await db.insert(userStats).values({ userId }).onConflictDoNothing();

        const exerciseCount = parsedUnit.lessons.reduce(
          (sum, l) => sum + l.exercises.length,
          0,
        );

        revalidatePath("/library", "page");
        revalidatePath("/units", "page");

        return {
          success: true,
          courseId: courseId ?? undefined,
          unitId,
          title: parsedUnit.title,
          description: parsedUnit.description,
          icon: parsedUnit.icon,
          color: parsedUnit.color,
          level: parsedUnit.level,
          lessonCount: parsedUnit.lessons.length,
          exerciseCount,
          lessonTitles: parsedUnit.lessons.map((l) => l.title),
          url: `/unit/${unitId}`,
        };
      },
    }),

    addWordsToSrs: tool({
      description:
        "Bulk-add words from the dictionary to the user's SRS deck. Filters by language (required), and optionally by CEFR level and/or word frequency range. Only adds words marked as useful for flashcards that aren't already in the user's deck.",
      inputSchema: z.object({
        language: z.string().describe("Language code, e.g. 'de', 'fr', 'es'"),
        cefrLevel: z
          .enum(["A1", "A2", "B1", "B2", "C1", "C2"])
          .optional()
          .describe("Filter by CEFR level (exact match)"),
        minFrequency: z
          .number()
          .int()
          .optional()
          .describe("Minimum word frequency (inclusive)"),
        maxFrequency: z
          .number()
          .int()
          .optional()
          .describe("Maximum word frequency (inclusive)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5000)
          .default(500)
          .describe("Max words to add (default 500, max 5000)"),
      }),
      execute: async ({
        language: lang,
        cefrLevel,
        minFrequency,
        maxFrequency,
        limit: maxWords,
      }) => {
        const conditions = [
          eq(dictionaryWord.language, lang),
          eq(dictionaryWord.usefulForFlashcard, true),
        ];

        if (cefrLevel) {
          conditions.push(eq(dictionaryWord.cefrLevel, cefrLevel));
        }
        if (minFrequency !== undefined) {
          conditions.push(gte(dictionaryWord.wordFrequency, minFrequency));
        }
        if (maxFrequency !== undefined) {
          conditions.push(lte(dictionaryWord.wordFrequency, maxFrequency));
        }

        let wordsList: Array<{
          word: string;
          translation: string;
          cefrLevel: string | null;
          pos: string | null;
          gender: string | null;
          exampleNative: string | null;
          exampleEnglish: string | null;
        }> = [];

        try {
          const dbWords = await db
            .select({
              word: dictionaryWord.word,
              translation: dictionaryWord.englishTranslation,
              cefrLevel: dictionaryWord.cefrLevel,
              pos: dictionaryWord.pos,
              gender: dictionaryWord.gender,
              exampleNative: dictionaryWord.exampleSentenceNative,
              exampleEnglish: dictionaryWord.exampleSentenceEnglish,
            })
            .from(dictionaryWord)
            .where(and(...conditions))
            .orderBy(dictionaryWord.wordFrequency)
            .limit(maxWords);

          if (dbWords && dbWords.length > 0) {
            wordsList = dbWords;
          }
        } catch {
          // DB error, will fallback to JSON
        }

        // Fallback to official JSON curriculum word bank
        if (wordsList.length === 0) {
          const normLang = lang === "english" ? "en" : (lang || "en");
          let jsonWords: WordEntry[] = [];
          if (cefrLevel) {
            jsonWords = await loadEnLevelWords(cefrLevel);
          } else {
            jsonWords = await getBundledWords(normLang);
          }
          if (jsonWords.length === 0) {
            jsonWords = await getBundledWords(normLang);
          }

          if (cefrLevel) {
            const targetLvl = cefrLevel.toUpperCase().trim();
            jsonWords = jsonWords.filter(
              (w) => (w.cefr_level || "").toUpperCase().trim() === targetLvl,
            );
          }

          wordsList = jsonWords.slice(0, maxWords).map((w) => ({
            word: w.word,
            translation: w.english_translation || w.definition_zh || w.word,
            cefrLevel: w.cefr_level || cefrLevel || "A1",
            pos: w.pos || "noun",
            gender: w.gender || null,
            exampleNative: w.example_sentence_native || null,
            exampleEnglish: w.example_sentence_english || null,
          }));
        }

        if (wordsList.length === 0) {
          return {
            success: true,
            added: 0,
            message: "No matching words found in dictionary JSON files or database.",
          };
        }

        // Save to local store
        for (const w of wordsList) {
          await upsertLocalCard({
            word: w.word.toLowerCase(),
            language: lang,
            userId,
            translation: w.translation,
            cefrLevel: w.cefrLevel,
            pos: w.pos,
            gender: w.gender,
            status: "new",
            nextReviewAt: null,
          });
        }

        // Also save to Postgres DB if available
        try {
          const BATCH_SIZE = 500;
          for (let i = 0; i < wordsList.length; i += BATCH_SIZE) {
            const batch = wordsList.slice(i, i + BATCH_SIZE);
            await db
              .insert(srsCard)
              .values(
                batch.map((w) => ({
                  word: w.word.toLowerCase(),
                  language: lang,
                  userId,
                  translation: w.translation,
                  cefrLevel: w.cefrLevel,
                  pos: w.pos,
                  gender: w.gender,
                  exampleNative: w.exampleNative,
                  exampleEnglish: w.exampleEnglish,
                  status: "new" as const,
                  nextReviewAt: null,
                })),
              )
              .onConflictDoNothing();
          }
        } catch {}

        return {
          success: true,
          totalMatched: wordsList.length,
          message: `Matched ${wordsList.length} words from curriculum dictionary and added to SRS deck.`,
        };
      },
    }),

    switchLanguage: tool({
      description:
        "Switch the user's target language and/or native language. At least one must be provided.",
      inputSchema: z.object({
        target_language: z
          .string()
          .optional()
          .describe(
            "Target language code (e.g. 'fr', 'es', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'ko', 'zh', 'ja')",
          ),
        native_language: z
          .string()
          .optional()
          .describe(
            "Native language code (e.g. 'en', 'fr', 'es', 'de')",
          ),
      }),
      execute: async ({ target_language, native_language }) => {
        if (!target_language && !native_language) {
          return { success: false, error: "Provide at least one of target_language or native_language." };
        }

        const allSupported = Object.keys(supportedLanguages);
        const supportedList = allSupported
          .map((k) => `${k} (${langCodeToName[k] || k})`)
          .join(", ");

        if (target_language && !supportedLanguages[target_language]) {
          return {
            success: false,
            error: `Unsupported target language "${target_language}". Supported: ${supportedList}`,
          };
        }

        if (native_language && !supportedLanguages[native_language]) {
          return {
            success: false,
            error: `Unsupported native language "${native_language}". Supported: ${supportedList}`,
          };
        }

        const changes: string[] = [];

        if (target_language) {
          await db
            .insert(userPreferences)
            .values({ userId, targetLanguage: target_language })
            .onConflictDoUpdate({
              target: userPreferences.userId,
              set: { targetLanguage: target_language, updatedAt: new Date() },
            });
          changes.push(`target language to ${langCodeToName[target_language] || target_language}`);
        }

        if (native_language) {
          await db
            .insert(userPreferences)
            .values({ userId, nativeLanguage: native_language, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: userPreferences.userId,
              set: { nativeLanguage: native_language, updatedAt: new Date() },
            });
          changes.push(`native language to ${langCodeToName[native_language] || native_language}`);
        }

        revalidatePath("/");

        return {
          success: true,
          target_language: target_language ?? undefined,
          native_language: native_language ?? undefined,
          message: `Switched ${changes.join(" and ")}.`,
        };
      },
    }),

    webSearch: tool({
      description:
        "Search the web using Exa to find articles, news, or information. Useful for finding content to translate with readArticle, or for looking up current information. Returns titles, URLs, summaries, and highlights for each result.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search query. Be specific and descriptive for best results.",
          ),
        numResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Number of results to return (default 5, max 10)"),
        category: z
          .enum([
            "news",
            "research paper",
            "company",
            "tweet",
            "personal site",
          ])
          .optional()
          .describe(
            "Optional category to focus the search (e.g. 'news' for recent articles)",
          ),
        startPublishedDate: z
          .string()
          .optional()
          .describe(
            "Only return results published after this date. ISO 8601 format, e.g. '2025-01-01T00:00:00.000Z'",
          ),
      }),
      execute: async ({ query, numResults, category, startPublishedDate }) => {
        const apiKey = process.env.EXA_API_KEY;
        if (!apiKey) {
          return {
            success: false,
            error:
              "Exa API key is not configured. Web search is not available.",
          };
        }

        try {
          const body: Record<string, unknown> = {
            query,
            numResults,
            type: "auto",
            contents: {
              highlights: {
                maxCharacters: 3000,
              },
              summary: {
                query,
              },
            },
          };

          if (category) body.category = category;
          if (startPublishedDate) body.startPublishedDate = startPublishedDate;

          const response = await fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              success: false,
              error: `Exa API error (${response.status}): ${errorText}`,
            };
          }

          const data = await response.json();
          const results = (
            data.results as Array<{
              title?: string;
              url?: string;
              publishedDate?: string;
              author?: string;
              summary?: string;
              highlights?: string[];
            }>
          ).map((r) => ({
            title: r.title || "Untitled",
            url: r.url || "",
            publishedDate: r.publishedDate || null,
            author: r.author || null,
            summary: r.summary || null,
            highlights: r.highlights || [],
          }));

          return {
            success: true,
            query,
            resultCount: results.length,
            results,
          };
        } catch (e) {
          return {
            success: false,
            error: `Web search failed: ${(e as Error).message}`,
          };
        }
      },
    }),

    readArticle: tool({
      description:
        "Read a web article and translate it to a target language at a CEFR level. Creates a saved article the user can read later. Returns immediately with article ID — translation happens in background.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL of the article to translate"),
        cefrLevel: z
          .enum(["A1", "A2", "B1", "B2", "C1", "C2"])
          .default("B1")
          .describe("CEFR difficulty level for the translation"),
        targetLanguage: z
          .string()
          .optional()
          .describe(
            "Language code to translate into (e.g. 'de', 'fr', 'es'). Defaults to the user's current target language.",
          ),
      }),
      execute: async ({ url, cefrLevel, targetLanguage }) => {
        // Lazy-load article processing so /api/chat can boot without jsdom.
        const { processTranslation } = await import("@/lib/article/process");
        const lang = targetLanguage || language || "de";
        const langName = langCodeToName[lang] || lang;

        // Check for existing article with same URL + language + level
        const [existing] = await db
          .select()
          .from(article)
          .where(
            and(
              eq(article.userId, userId),
              eq(article.sourceUrl, url),
              eq(article.targetLanguage, langName),
              eq(article.cefrLevel, cefrLevel),
            ),
          )
          .limit(1);

        if (existing?.status === "completed") {
          return {
            success: true,
            articleId: existing.id,
            status: "completed",
            title: existing.title,
            url: `/read/${existing.id}`,
            message: "This article was already translated!",
          };
        }

        if (
          existing &&
          (existing.status === "fetching" || existing.status === "translating")
        ) {
          return {
            success: true,
            articleId: existing.id,
            status: existing.status,
            url: `/read/${existing.id}`,
            message: "This article is already being translated.",
          };
        }

        // Create new article record
        const articleId = crypto.randomUUID();
        await db.insert(article).values({
          id: articleId,
          userId,
          sourceUrl: url,
          targetLanguage: langName,
          cefrLevel,
          status: "fetching",
        });

        // Start background translation (fire-and-forget)
        processTranslation(articleId, url, langName, cefrLevel).catch(
          (error) => {
            console.error(
              `[${articleId}] Background processing error:`,
              error,
            );
          },
        );

        revalidatePath("/read", "page");

        return {
          success: true,
          articleId,
          status: "fetching",
          url: `/read/${articleId}`,
          message: `Started translating article to ${langName} at ${cefrLevel} level. The user can check progress at /read/${articleId}.`,
        };
      },
    }),
  };
}
