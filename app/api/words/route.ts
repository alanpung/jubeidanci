import { NextRequest, NextResponse } from "next/server";
import { loadEnLevelWords, getBundledWords, type WordEntry } from "@/lib/words";
import { matchesPosFilter } from "@/lib/pos";
import { db, isDbAvailable } from "@/lib/db";
import { dictionaryWord } from "@/lib/db/schema";
import { getTrackedWordSet, getUserLibraryWords, getAllCards } from "@/lib/actions/srs";
import { buildDictionary, levelForWord } from "@/lib/content/course-srs-report";
import { getUnrecordedWords } from "@/lib/content/unrecorded-words";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get("lang") || "en";
    const level = searchParams.get("level") || "";
    const letter = (searchParams.get("letter") || "").trim().toUpperCase();
    const pos = (searchParams.get("pos") || "").trim().toLowerCase();
    const q = (searchParams.get("q") || "").toLowerCase().trim();
    const wordsParam = (searchParams.get("words") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "50", 10)));

    // ─── UNRECORDED ("U") FILTER — owner only ───
    // Lists the SRS words used by course content that the bundled dictionary
    // does not know about (the Course Stat "未收录" column), together with the
    // courses/units each word comes from. This is a completely different data
    // shape from the dictionary list, so it returns early.
    if (searchParams.get("unrecorded") === "1") {
      const session = await getSession();
      if (!session?.user?.email || !isAdminEmail(session.user.email)) {
        return NextResponse.json(
          { words: [], unrecorded: [], total: 0, hasMore: false },
          { status: 403 },
        );
      }

      const all = getUnrecordedWords();

      // Apply the same auxiliary filters the dictionary list honours, so the
      // owner can narrow the triage list down.
      let rows = all;
      if (letter && letter !== "ALL") {
        rows = rows.filter((r) => {
          const clean = r.word.trim().replace(/^['"-]/, "").toUpperCase();
          if (letter === "#") return !/[a-zA-Z]/.test(r.word.trim().charAt(0));
          return clean.startsWith(letter);
        });
      }
      if (q) {
        rows = rows.filter(
          (r) =>
            r.word.toLowerCase().includes(q) ||
            r.sources.some((s) =>
              `${s.courseId} ${s.unitTitle} ${s.unitId}`.toLowerCase().includes(q),
            ),
        );
      }
      if (level) {
        // "未收录" words have no dictionary level by definition, so a level
        // filter would empty the list. We ignore it rather than mislead.
      }

      const total = rows.length;
      const startIndex = (page - 1) * limit;
      const pageRows = rows.slice(startIndex, startIndex + limit);

      return NextResponse.json({
        words: [],
        unrecorded: pageRows,
        total,
        hasMore: startIndex + limit < total,
      });
    }

    let allWords: WordEntry[];
    if ((lang === "en" || lang === "english") && level) {
      const levelWords = await loadEnLevelWords(level);
      allWords = levelWords.length > 0 ? levelWords : await getBundledWords(lang);
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

    // ─── LIBRARY-SCOPED FILTER (student "My Words" / M / L / N) ───
    // Serves exactly the learner's library — the derived union of the full
    // course catalog and their own practised (orphan) words — which is the
    // same set /progress reports as "All". This keeps /words and /progress
    // perfectly consistent, and lets a student browse and study every one of
    // their ~10k words even though the SRS deck only stores the words they
    // have actually started (M/L plus any surviving "new" rows).
    // When `srsStatus` is set we additionally keep only words whose derived
    // status (catalog ⇒ new, unless the deck says mastered/learning) matches —
    // so the M / L / N tabs are exact and paginable server-side.
    const libraryOnly = searchParams.get("libraryOnly") === "1";
    const srsStatus = (searchParams.get("srsStatus") || "").trim().toLowerCase();
    if (libraryOnly) {
      try {
        const session = await getSession();
        const userId = session?.user?.id;
        if (!userId) {
          filtered = [];
        } else {
          const lib = await getUserLibraryWords(userId);
          if (lib.length === 0) {
            filtered = [];
          } else {
            // The library IS the list — not the dictionary narrowed to it. A
            // course's vocabulary legitimately contains inflected forms
            // ("brushes", "travels") that have no entry in the master
            // dictionary, so filtering the dictionary by membership would drop
            // ~2.2k real vocabulary items and make /words disagree with
            // /progress. Build the list from the library and enrich it with
            // the dictionary wherever an entry exists.
            const dictByWord = new Map<string, WordEntry>();
            for (const w of allWords) dictByWord.set(w.word.toLowerCase().trim(), w);

            const levelDict = buildDictionary();
            const entries: WordEntry[] = [];
            for (const lw of lib) {
              const norm = lw.toLowerCase().trim();
              if (!norm) continue;
              const d = dictByWord.get(norm);
              if (d) {
                entries.push(d);
                continue;
              }
              entries.push({
                word: norm,
                cefr_level: levelForWord(norm, levelDict) || "A1",
                english_translation: "",
                definition_zh: "",
                pos: "",
                example_sentence_native: "",
                example_sentence_english: "",
                gender: "",
              } as WordEntry);
            }
            filtered = entries;

            if (srsStatus === "new" || srsStatus === "learned" || srsStatus === "learning") {
              const langKey = lang === "english" ? "en" : lang;
              const cards = await getAllCards(langKey, userId, false, true);
              const statusMap = new Map<string, "new" | "learning" | "learned">();
              for (const c of cards) {
                const norm = c.word.toLowerCase().trim();
                const mastered =
                  c.status === "learned" || c.status === "review" || (c.repetitions ?? 0) >= 3;
                const learning = c.status === "learning" && (c.repetitions ?? 0) < 3;
                statusMap.set(norm, mastered ? "learned" : learning ? "learning" : "new");
              }
              filtered = filtered.filter((w) => {
                const st = statusMap.get(w.word.toLowerCase().trim()) || "new";
                return st === srsStatus;
              });
            }
          }
        }
      } catch {
        // On any failure, fall back to the unfiltered dictionary rather than
        // failing the whole request.
      }
    }

    // Filter by CEFR Level. The dictionary path can skip the filter when the
    // list was already pre-loaded for that level; the library-scoped list is
    // built from the learner's own vocabulary and always spans every level,
    // so it is always filtered.
    if (level && (libraryOnly || (allWords.length > 0 && allWords[0]?.cefr_level !== level))) {
      filtered = filtered.filter(
        (w: WordEntry) => (w.cefr_level || "").toUpperCase() === level.toUpperCase()
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

    // POS aliases are normalized as complete tokens, never substrings. This
    // prevents the adverb shorthand "r" from matching the "r" in "verb".
    if (pos && pos !== "all") {
      filtered = filtered.filter((w: WordEntry) =>
        matchesPosFilter(pos, w.pos, w.english_translation, w.definition_zh)
      );
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

    // ─── OPTIONAL SRS EXCLUSION (Dictionary / "not in my SRS" filter) ───
    // When the client requests excludeInSrs, drop every word the learner has
    // actually started (learning / learned / review). A stored "new" row no
    // longer counts as owned — New is derived from the library — so the result
    // is exactly the dictionary words they have NOT studied yet. Done
    // server-side against the authoritative DB+local merge, not the client's
    // possibly-stale copy of the deck, and before pagination so the count and
    // "show more" stay correct.
    const excludeInSrs = searchParams.get("excludeInSrs") === "1";
    if (excludeInSrs) {
      try {
        const session = await getSession();
        const userId = session?.user?.id;
        if (userId) {
          const tracked = await getTrackedWordSet(
            lang === "english" ? "en" : lang,
            userId
          );
          if (tracked.size > 0) {
            filtered = filtered.filter(
              (w: WordEntry) => !tracked.has(w.word.toLowerCase().trim())
            );
          }
        }
      } catch {
        // If we cannot resolve the learner's deck, fall back to the unfiltered
        // dictionary rather than failing the whole request.
      }
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
