"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";
import { reviewCard } from "@/lib/actions/srs";
import type { FlashcardReviewExercise } from "@/lib/content/types";
import { useAudio } from "@/hooks/use-audio";
import { ReplayButton } from "@/components/replay-button";
import { AudioSpinner } from "@/components/audio-spinner";
import { X, Check, ArrowLeft, ArrowRight, MessageSquareText } from "lucide-react";

function cleanTextForTTS(raw: string, isTargetLanguageNonLatin: boolean): string {
  if (!raw) return "";
  let text = raw.replace(/\\n/g, "\n");

  if (text.includes("\n")) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const nonLatinLines = lines.filter((l) =>
      /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/u.test(l)
    );
    if (nonLatinLines.length > 0) {
      text = nonLatinLines.join(" ");
    } else {
      text = lines[0];
    }
  }

  // Strip brackets, parentheses, and brace contents
  text = text.replace(/\([^)]*\)/g, "");
  text = text.replace(/\[[^\]]*\]/g, "");
  text = text.replace(/\{[^}]*\}/g, "");

  // Strip leading definition/meaning/translation label words so TTS only pronounces the pure content
  text = text.replace(/^(?:definition|meaning|def|含义|意思|解释|释义|中文|翻译|translation)[:：\-–—\s]+/gi, "");
  text = text.replace(/^(?:definition|meaning|def)\b[:：\-–—\s]*/gi, "");

  // Strip POS markers (e.g., "n.", "v.", "vt.", "vi.", "a.", "adj.", "adv.", "s.", "r.", "prep.", "conj.", "pron.", "det.", "num.", "int.", "abbr.") at the start or after semicolons/commas
  const posRegex =
    /(?:^|(?<=[;；,，]\s*))(?:n|v|vt|vi|a|s|r|adj|adv|prep|conj|pron|det|art|num|int|intj|interj|abbr|aux|modal|pl|sing|noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|interjection)\.(?:\s*&\s*(?:n|v|vt|vi|a|adj|adv)\.)?\s*/gi;
  text = text.replace(posRegex, "");

  // Expand shorthand dictionary abbreviations into fluent natural English
  text = text
    .replace(/\bsb\b|\bsb\./gi, "somebody")
    .replace(/\bsth\b|\bsth\./gi, "something")
    .replace(/\be\.g\.,?\s*/gi, "for example, ")
    .replace(/\bi\.e\.,?\s*/gi, "that is, ")
    .replace(/\betc\.\b|\betc\b/gi, "and so on")
    .replace(/\bw\/\b/gi, "with ")
    .replace(/\bw\/o\b/gi, "without ")
    .replace(/\besp\.\b|\besp\b/gi, "especially ")
    .replace(/\bsyn:\s*|\bsyn\.\s*/gi, "synonym: ")
    .replace(/\bant:\s*|\bant\.\s*/gi, "antonym: ");

  if (
    isTargetLanguageNonLatin &&
    /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f]/u.test(text)
  ) {
    text = text.replace(/[a-zA-Záéíóúāēīōūǎěǐǒǔàèìòù.&]/g, "");
  }

  return text
    .replace(/[#*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const nonLatinLanguages = new Set([
  "mandarin",
  "chinese",
  "zh",
  "japanese",
  "japanese-kanji",
  "japanese-hiragana",
  "japanese-katakana",
  "ja",
  "korean",
  "ko",
  "arabic",
  "ar",
  "hindi",
  "hi",
  "russian",
  "ru",
]);

function parseFlashcardContent(exercise: FlashcardReviewExercise): {
  meaning: string;
  translation: string;
} {
  if (!exercise) return { meaning: "", translation: "" };
  let meaning = exercise.meaning?.trim() || "";
  let translation = exercise.translation?.trim() || "";

  if (!meaning && !translation && exercise.back) {
    const rawBack = String(exercise.back).replace(/\\n/g, "\n").trim();
    const lines = rawBack.split("\n").map((l) => l.trim()).filter(Boolean);

    let parsedMeaning = "";
    let parsedTranslation = "";

    for (const line of lines) {
      if (/^(meaning|definition|含义|意思)[:：]\s*/i.test(line)) {
        parsedMeaning = line.replace(/^(meaning|definition|含义|意思)[:：]\s*/i, "");
      } else if (/^(translation|chinese|中文|翻译)[:：]\s*/i.test(line)) {
        parsedTranslation = line.replace(/^(translation|chinese|中文|翻译)[:：]\s*/i, "");
      }
    }

    if (!parsedMeaning && !parsedTranslation) {
      if (lines.length >= 2) {
        if (/[\u4e00-\u9fa5]/.test(lines[0]) && !/[\u4e00-\u9fa5]/.test(lines[1])) {
          parsedTranslation = lines[0];
          parsedMeaning = lines[1];
        } else {
          parsedMeaning = lines[0];
          parsedTranslation = lines[1];
        }
      } else if (lines.length === 1) {
        const single = lines[0];
        if (/[\u4e00-\u9fa5]/.test(single)) {
          parsedTranslation = single;
        } else {
          parsedMeaning = single;
        }
      }
    }

    meaning = parsedMeaning || meaning;
    translation = parsedTranslation || translation;

    if (!meaning && !translation && rawBack) {
      meaning = rawBack;
    }
  }

  return { meaning, translation };
}

function extractTargetWords(exercise: FlashcardReviewExercise): string[] {
  const rawWords = Array.isArray(exercise?.srsWords)
    ? exercise.srsWords
    : exercise?.srsWords
      ? [exercise.srsWords]
      : [];

  const fallbackWord = exercise?.front
    ? exercise.front
        .replace(/[#*_`~]/g, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .split("\n")[0]
        .trim()
    : "";

  return Array.from(
    new Set(
      [...rawWords, fallbackWord]
        .map((w) =>
          w
            .toLowerCase()
            .replace(/^[^\w\s\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]+|[^\w\s\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]+$/g, "")
            .trim()
        )
        .filter(Boolean)
    )
  );
}

function updateLocalStorageCard(
  word: string,
  status: "new" | "learning" | "learned",
  language: string,
  translation?: string
) {
  if (typeof window === "undefined") return;
  try {
    const norm = word.toLowerCase().trim();
    const stored = localStorage.getItem("openlingo_srs_cards_v1");
    const cards: Array<{
      word: string;
      language: string;
      translation: string;
      status: string;
      cefrLevel?: string;
      pos?: string;
      easeFactor?: number;
      interval?: number;
      repetitions?: number;
      nextReviewAt?: string | null;
      lastReviewedAt?: string | null;
      createdAt?: string;
    }> = stored ? JSON.parse(stored) : [];

    const idx = cards.findIndex((c) => c.word.toLowerCase().trim() === norm);
    if (idx >= 0) {
      cards[idx] = {
        ...cards[idx],
        status,
        lastReviewedAt: status === "learned" ? new Date().toISOString() : cards[idx].lastReviewedAt,
        nextReviewAt: status === "learning" ? new Date().toISOString() : null,
      };
    } else {
      cards.push({
        word: norm,
        language,
        translation: translation || norm,
        cefrLevel: "A1",
        pos: "noun",
        status,
        easeFactor: 2.5,
        interval: status === "learned" ? 36500 : 0,
        repetitions: status === "learned" ? 10 : (status === "learning" ? 1 : 0),
        nextReviewAt: status === "learning" ? new Date().toISOString() : null,
        lastReviewedAt: status === "learned" ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
      });
    }
    localStorage.setItem("openlingo_srs_cards_v1", JSON.stringify(cards));
  } catch {}
}


const POS_LABELS: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adj: "Adj",
  adjective: "Adj",
  adv: "Adv",
  adverb: "Adv",
  pronoun: "Pron",
  conjunction: "Conj",
  prep: "Prep",
  preposition: "Prep",
  determiner: "Det",
  interjection: "Intj",
  num: "Num",
  number: "Num",
  numeral: "Num",
};

const LEVEL_BADGES: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  A2: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-800",
  B1: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800",
  B2: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  C1: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  C2: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
};

export function FlashcardReview({
  exercise,
  language,
  onResult,
  onContinue,
  autoplayAudio = true,
}: {
  exercise: FlashcardReviewExercise;
  language: string;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  autoplayAudio?: boolean;
}) {
  const [rated, setRated] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<"no" | "yes" | null>(null);
  const isHandlingRef = useRef(false);

  // Dynamic enrichment for word info (pos, ipa, level, meaning, translation, examples)
  const [wordMeta, setWordMeta] = useState<{
    pos?: string;
    ipa?: string;
    level?: string;
    meaning?: string;
    translation?: string;
    examples?: { en: string; zh?: string }[];
  }>({});

  const targetWords = useMemo(() => extractTargetWords(exercise), [exercise]);
  const primaryWord = targetWords[0] || (exercise?.front || "").replace(/[#*_`~]/g, "").trim();

  // Reset local state when a new exercise arrives
  const currentKey = exercise?.front || "";
  useEffect(() => {
    setRated(false);
    setActionFeedback(null);
    isHandlingRef.current = false;
  }, [currentKey]);

  useEffect(() => {
    let cancelled = false;
    if (!primaryWord) return;

    // Collect base examples from exercise props if present
    const initExamples: { en: string; zh?: string }[] = [];
    if (exercise.example) {
      initExamples.push({ en: exercise.example, zh: exercise.exampleZh || exercise.exampleTranslation });
    }

    if (exercise.pos && exercise.ipa && exercise.translation && exercise.meaning) {
      setWordMeta({
        pos: exercise.pos,
        ipa: exercise.ipa,
        level: exercise.cefrLevel || exercise.level,
        meaning: exercise.meaning,
        translation: exercise.translation,
        examples: initExamples.length > 0 ? initExamples : undefined,
      });
      return;
    }

    try {
      const stored = localStorage.getItem("openlingo_srs_cards_v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const match = parsed.find(
            (c: any) => c.word?.toLowerCase().trim() === primaryWord.toLowerCase().trim()
          );
          if (match) {
            setWordMeta((prev) => ({
              pos: match.pos || exercise.pos || prev.pos,
              level: match.cefrLevel || exercise.cefrLevel || exercise.level || prev.level,
              translation: match.translation || exercise.translation || prev.translation,
              ipa: exercise.ipa || prev.ipa,
              meaning: exercise.meaning || prev.meaning,
              examples: prev.examples,
            }));
          }
        }
      }
    } catch {}

    fetch(`/api/words?lang=${encodeURIComponent(language || "en")}&q=${encodeURIComponent(primaryWord)}&limit=5`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.words)) return;
        const norm = primaryWord.toLowerCase().trim();
        const exact = data.words.find((w: any) => w.word?.toLowerCase().trim() === norm) || data.words[0];
        if (exact) {
          const hasZhInExercise = /[\u4e00-\u9fa5]/.test(exercise.translation || "");

          const collected: { en: string; zh?: string }[] = [...initExamples];
          if (exact.example_sentence_native || exact.example_sentence_english) {
            const exEn = exact.example_sentence_native || exact.example_sentence_english;
            if (exEn && !collected.some((e) => e.en.toLowerCase().trim() === exEn.toLowerCase().trim())) {
              collected.push({ en: exEn, zh: exact.example_zh || exact.example_sentence_target });
            }
          }
          if (Array.isArray(exact.examples)) {
            exact.examples.forEach((item: any) => {
              const enStr = typeof item === "string" ? item : item.en || item.native || item.sentence;
              const zhStr = typeof item === "object" ? item.zh || item.translation : undefined;
              if (enStr && !collected.some((e) => e.en.toLowerCase().trim() === enStr.toLowerCase().trim())) {
                collected.push({ en: enStr, zh: zhStr });
              }
            });
          }

          setWordMeta((prev) => ({
            pos: exercise.pos || exact.pos || prev.pos,
            ipa: exercise.ipa || exact.ipa || prev.ipa,
            level: exercise.cefrLevel || exercise.level || exact.cefr_level || prev.level,
            meaning: exercise.meaning || exact.english_translation || prev.meaning,
            translation:
              (hasZhInExercise ? exercise.translation : exact.definition_zh) ||
              exact.definition_zh ||
              exercise.translation ||
              prev.translation,
            examples: collected.length > 0 ? collected : prev.examples,
          }));
        }
      })
      .catch(() => {});

    // Secondary fallback to lookup endpoint for example sentences if none loaded yet
    fetch(`/api/word/lookup?word=${encodeURIComponent(primaryWord)}&language=${encodeURIComponent(language || "en")}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.exampleNative) {
          setWordMeta((prev) => {
            const existing = prev.examples || [];
            if (existing.some((e) => e.en.toLowerCase().trim() === data.exampleNative.toLowerCase().trim())) {
              return prev;
            }
            return {
              ...prev,
              examples: [...existing, { en: data.exampleNative, zh: data.exampleTranslation }],
            };
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [primaryWord, exercise, language]);

  const { play, stop, prefetch, loading: audioLoading } = useAudio();
  const { meaning: parsedMeaning, translation: parsedTranslation } = parseFlashcardContent(exercise);

  const activeMeaning = parsedMeaning || wordMeta.meaning || "";
  const activeTranslation =
    (/[\u4e00-\u9fa5]/.test(parsedTranslation)
      ? parsedTranslation
      : wordMeta.translation || parsedTranslation) || "";
  const activePos = exercise.pos || wordMeta.pos || "";
  const activeIpa = exercise.ipa || wordMeta.ipa || "";
  const activeLevel = (exercise.cefrLevel || exercise.level || wordMeta.level || "").toUpperCase();
  const levelBadge = activeLevel ? (LEVEL_BADGES[activeLevel] || LEVEL_BADGES["A1"]) : "";

  const isNonLatin = nonLatinLanguages.has(language?.toLowerCase());
  const frontTTS = cleanTextForTTS(exercise?.front || "", isNonLatin);
  const backTTS = cleanTextForTTS(activeMeaning || exercise?.back || "", false);
  const translationTTS = cleanTextForTTS(activeTranslation || "", true);

  // Motion values for horizontal swipe gestures (left = No, right = Yes)
  const dragX = useMotionValue(0);

  // Opacity indicators based on horizontal drag direction
  const noOpacity = useTransform(dragX, [-80, -20, 0], [1, 0.4, 0]);
  const yesOpacity = useTransform(dragX, [0, 20, 80], [0, 0.4, 1]);

  // Card rotation during drag
  const cardRotate = useTransform(dragX, [-150, 0, 150], [-10, 0, 10]);

  const autoplayedKeyRef = useRef<string>("");

  // Prefetch front word audio only
  useEffect(() => {
    if (frontTTS && !exercise?.noAudio?.includes("front")) {
      prefetch([frontTTS], language);
    }
  }, [frontTTS, exercise?.noAudio, language, prefetch]);

  // Autoplay front audio strictly ONCE when a new card is shown
  useEffect(() => {
    if (
      autoplayAudio &&
      frontTTS &&
      !exercise?.noAudio?.includes("front") &&
      autoplayedKeyRef.current !== currentKey
    ) {
      autoplayedKeyRef.current = currentKey;
      play(frontTTS, language);
    }
    return stop;
  }, [currentKey, autoplayAudio, frontTTS, exercise?.noAudio, language, play, stop]);

  const handlePlayFront = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (frontTTS) {
        play(frontTTS, language);
      }
    },
    [frontTTS, language, play]
  );

  const handlePlayBack = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (backTTS) {
        play(backTTS, "en");
      }
    },
    [backTTS, play]
  );

  const handlePlayTranslation = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (translationTTS) {
        play(translationTTS, "zh");
      }
    },
    [translationTTS, play]
  );

  // 1. NO (Left Button / Swipe Left)
  const handleNo = useCallback(() => {
    if (isHandlingRef.current || rated) return;
    isHandlingRef.current = true;
    setRated(true);
    setActionFeedback("no");

    const words = extractTargetWords(exercise);
    words.forEach((w) => updateLocalStorageCard(w, "new", language, activeTranslation || activeMeaning || w));

    // Async background sync without blocking UI
    Promise.all(words.map((w) => reviewCard(w, language, 1))).catch((err) => {
      console.error("Failed to record review:", err);
    });

    onResult(false, "No");
    setTimeout(() => {
      onContinue();
    }, 120);
  }, [exercise, language, activeTranslation, activeMeaning, onResult, onContinue, rated]);

  // 2. YES (Right Button / Swipe Right)
  const handleYes = useCallback(() => {
    if (isHandlingRef.current || rated) return;
    isHandlingRef.current = true;
    setRated(true);
    setActionFeedback("yes");

    const words = extractTargetWords(exercise);
    words.forEach((w) => updateLocalStorageCard(w, "learning", language, activeTranslation || activeMeaning || w));

    // Async background sync without blocking UI
    Promise.all(words.map((w) => reviewCard(w, language, 4))).catch((err) => {
      console.error("Failed to record review:", err);
    });

    onResult(true, "Yes");
    setTimeout(() => {
      onContinue();
    }, 120);
  }, [exercise, language, activeTranslation, activeMeaning, onResult, onContinue, rated]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "1" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleNo();
      } else if (e.key === "ArrowRight" || e.key === "3" || e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleYes();
      } else if (e.key === "r" || e.key === "R" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handlePlayFront();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNo, handleYes, handlePlayFront]);

  // Handle horizontal Drag / Swipe Release only (No = left, Yes = right).
  // The previous "swipe up = Mastered" and "swipe down = Examples" gestures
  // were removed — examples are now shown inline, and there is no longer a
  // "mastered" status to swipe into.
  function handleDragEnd(_: unknown, info: { offset: { x: number; y: number } }) {
    if (isHandlingRef.current || rated) return;
    const { x } = info.offset;
    const SWIPE_THRESHOLD = 50;
    if (x > SWIPE_THRESHOLD) {
      handleYes();
    } else if (x < -SWIPE_THRESHOLD) {
      handleNo();
    }
  }

  const exampleList =
    wordMeta.examples && wordMeta.examples.length > 0
      ? wordMeta.examples
      : [
          {
            en: `This is a natural example sentence using "${exercise?.front || "this word"}".`,
            zh:
              activeTranslation || activeMeaning
                ? `使用 "${exercise?.front || "单词"}" 的示例句子。`
                : undefined,
          },
        ];

  return (
    <div className="w-full max-w-xl mx-auto select-none">
      {/* Card Slot Area with AnimatePresence */}
      <div className="relative min-h-[300px] sm:min-h-[340px] flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentKey}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={
              actionFeedback === "no"
                ? { x: -350, opacity: 0, rotate: -15, scale: 0.85 }
                : actionFeedback === "yes"
                  ? { x: 350, opacity: 0, rotate: 15, scale: 0.85 }
                  : { opacity: 1, scale: 1, y: 0, x: 0 }
            }
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={handleDragEnd}
            style={{ x: dragX, rotate: cardRotate }}
            className={`w-full relative rounded-2xl border-2 border-b-4 p-5 sm:p-7 text-center transition-colors shadow-sm bg-white touch-pan-y ${
              actionFeedback === "no"
                ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20"
                : actionFeedback === "yes"
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-lingo-border"
            }`}
          >
              {/* Swipe Overlays / Badges */}
              <motion.div
                style={{ opacity: noOpacity }}
                className="absolute top-4 left-4 z-20 pointer-events-none rounded-xl bg-rose-600 text-white font-black px-3 py-1.5 text-xs sm:text-sm shadow-md flex items-center gap-1 border border-white/30"
              >
                <X className="w-4 h-4" /> NO
              </motion.div>

              <motion.div
                style={{ opacity: yesOpacity }}
                className="absolute top-4 right-4 z-20 pointer-events-none rounded-xl bg-emerald-600 text-white font-black px-3 py-1.5 text-xs sm:text-sm shadow-md flex items-center gap-1 border border-white/30"
              >
                <Check className="w-4 h-4" /> YES
              </motion.div>

              {/* Top bar with audio replay button and mobile swipe guide */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-lingo-text-light/70 flex items-center gap-1">
                  🎴 Flashcard
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-lingo-text-light hidden sm:inline">
                    Swipe: ← No  |  Yes →
                  </span>
                  <ReplayButton onPlay={handlePlayFront} />
                </div>
              </div>

              {/* ── 1. ROW 1: Word + POS + Level + IPA (Inline on the Right Side) ── */}
              <div className="my-3 sm:my-4 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
                <span className="text-2xl sm:text-3xl font-black text-lingo-text tracking-tight">
                  {exercise?.front || ""}
                </span>

                {/* POS, Level & IPA placed inline on the right side of the word */}
                {(activeLevel || activePos || activeIpa) && (
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {/* Part of Speech (POS) */}
                    {activePos && (
                      <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800">
                        {POS_LABELS[activePos.toLowerCase()] || activePos}
                      </span>
                    )}

                    {/* Level Badge */}
                    {activeLevel && (
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-black border ${levelBadge}`}>
                        {activeLevel}
                      </span>
                    )}

                    {/* IPA Phonetic */}
                    {activeIpa && (
                      <span className="text-xs font-mono text-lingo-text-light/90 bg-lingo-gray/20 px-2 py-0.5 rounded-lg border border-lingo-border/60">
                        /{activeIpa.replace(/^\/+|\/+$/g, "")}/
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── 2. ROW 2: Translation (Chinese) — shown first, it is the
                    meaning a learner reaches for before the English gloss ── */}
              {activeTranslation && (
                <div
                  onClick={handlePlayTranslation}
                  className="relative mt-3 rounded-2xl bg-lingo-card p-3.5 sm:p-4 border border-lingo-border/80 cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 transition-all select-none text-left shadow-2xs group"
                >
                  {translationTTS && (
                    <div className="absolute top-2.5 right-2.5 z-10" onClick={(e) => e.stopPropagation()}>
                      <ReplayButton onPlay={handlePlayTranslation} />
                    </div>
                  )}
                  <div className="prose prose-sm font-bold text-lingo-text text-base leading-relaxed pr-8 [&>p]:m-0">
                    <Markdown remarkPlugins={[remarkBreaks]}>{activeTranslation}</Markdown>
                  </div>
                </div>
              )}

              {/* ── 3. ROW 3: English meaning / definition ── */}
              {activeMeaning && (
                <div
                  onClick={handlePlayBack}
                  className="relative mt-2.5 sm:mt-3 rounded-2xl bg-lingo-bg/70 dark:bg-lingo-gray/20 p-3.5 sm:p-4 border border-lingo-border/80 cursor-pointer hover:border-lingo-blue/40 transition-all select-none text-left shadow-2xs group"
                >
                  {backTTS && (
                    <div className="absolute top-2.5 right-2.5 z-10" onClick={(e) => e.stopPropagation()}>
                      <ReplayButton onPlay={handlePlayBack} />
                    </div>
                  )}
                  <div className="prose prose-sm font-bold text-lingo-text text-base leading-relaxed pr-8 [&>p]:m-0">
                    <Markdown remarkPlugins={[remarkBreaks]}>{activeMeaning}</Markdown>
                  </div>
                </div>
              )}

              {/* ── 4. ROW 4: Example sentences, shown inline below the meaning
                    (no swipe-down reveal needed) ── */}
              <div className="mt-2.5 sm:mt-3 space-y-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600/80">
                  <MessageSquareText className="w-3.5 h-3.5" /> Examples
                </div>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {exampleList.map((ex, idx) => (
                    <div
                      key={idx}
                      onClick={() => play(cleanTextForTTS(ex.en, false), "en")}
                      className="relative rounded-2xl border border-lingo-border/80 bg-lingo-bg/70 dark:bg-lingo-gray/20 p-3 sm:p-3.5 cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10 transition-all select-none text-left shadow-2xs group flex flex-col gap-1"
                    >
                      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                        <ReplayButton onPlay={() => play(cleanTextForTTS(ex.en, false), "en")} />
                      </div>
                      <p className="text-sm sm:text-base font-bold text-lingo-text leading-snug pr-8">
                        {ex.en}
                      </p>
                      {ex.zh && (
                        <p className="text-xs sm:text-sm font-semibold text-lingo-text-light/90 pr-8">
                          {ex.zh}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
        </AnimatePresence>
      </div>

      {/* Audio loading spinner */}
      <div className="min-h-[16px] flex items-center justify-center">
        <AudioSpinner loading={audioLoading} />
      </div>

      {/* ── Bottom Response Buttons ── */}
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5 mt-1">
        {/* NO (Lingo Red / Left) */}
        <button
          type="button"
          onClick={handleNo}
          disabled={rated}
          title="Don't remember this word (Swipe Left)"
          className="group relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-b-4 border-lingo-red-dark bg-lingo-red py-2.5 px-1.5 text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-lg active:translate-y-1 active:scale-[0.99] active:border-b-0 active:shadow-none disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer"
        >
          {/* Sheen + diagonal texture */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 58%), repeating-linear-gradient(135deg, rgba(255,255,255,0.09) 0 8px, transparent 8px 16px)",
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/50"
          />
          <span className="relative flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 ring-1 ring-inset ring-white/40 transition-transform duration-150 group-hover:scale-110">
              <X className="h-4 w-4 stroke-[3]" />
            </span>
            <span className="text-base sm:text-lg font-black tracking-wide">No</span>
          </span>
          <span className="relative flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-white/80">
            <ArrowLeft className="h-3 w-3" />
            Swipe
          </span>
        </button>

        {/* YES (Lingo Green / Right) */}
        <button
          type="button"
          onClick={handleYes}
          disabled={rated}
          title="Remember this word (Swipe Right)"
          className="group relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-b-4 border-lingo-green-dark bg-lingo-green py-2.5 px-1.5 text-white shadow-sm transition-all duration-100 hover:brightness-105 hover:shadow-lg active:translate-y-1 active:scale-[0.99] active:border-b-0 active:shadow-none disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer"
        >
          {/* Sheen + diagonal texture */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 58%), repeating-linear-gradient(135deg, rgba(255,255,255,0.09) 0 8px, transparent 8px 16px)",
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/50"
          />
          <span className="relative flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 ring-1 ring-inset ring-white/40 transition-transform duration-150 group-hover:scale-110">
              <Check className="h-4 w-4 stroke-[3]" />
            </span>
            <span className="text-base sm:text-lg font-black tracking-wide">Yes</span>
          </span>
          <span className="relative flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-white/80">
            Swipe
            <ArrowRight className="h-3 w-3" />
          </span>
        </button>
      </div>
    </div>
  );
}
