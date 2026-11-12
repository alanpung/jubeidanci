export type QuestionType =
  | "multiple-choice"
  | "fill-in-the-blank"
  | "matching-pairs"
  | "listening"
  | "word-bank"
  | "speaking"
  | "flashcard-review"
  | "translation"
  | "writing"
  | "free-text"
  | "mix";

export interface QuestionTypeInfo {
  id: string;
  num: string;
  icon: string;
  nameZh: string;
  nameEn: string;
  badgeLabel: string;
  color: string;
}

export const QUESTION_TYPES: Record<string, QuestionTypeInfo> = {
  "multiple-choice": {
    id: "multiple-choice",
    num: "1",
    icon: "🎯",
    nameZh: "多项选择",
    nameEn: "Multiple choice",
    badgeLabel: "Multiple choice",
    color: "#3B82F6",
  },
  "fill-in-the-blank": {
    id: "fill-in-the-blank",
    num: "2",
    icon: "✏️",
    nameZh: "填空练习",
    nameEn: "Fill in the blank",
    badgeLabel: "Fill in the blank",
    color: "#8B5CF6",
  },
  "matching-pairs": {
    id: "matching-pairs",
    num: "3",
    icon: "🧩",
    nameZh: "单词配对",
    nameEn: "Matching pairs",
    badgeLabel: "Matching pairs",
    color: "#EC4899",
  },
  "listening": {
    id: "listening",
    num: "4",
    icon: "🎧",
    nameZh: "听力理解",
    nameEn: "Listening",
    badgeLabel: "Listening",
    color: "#06B6D4",
  },
  "word-bank": {
    id: "word-bank",
    num: "5",
    icon: "🧱",
    nameZh: "单词拼句",
    nameEn: "Word order",
    badgeLabel: "Word order",
    color: "#F59E0B",
  },
  "word-order": {
    id: "word-bank",
    num: "5",
    icon: "🧱",
    nameZh: "单词拼句",
    nameEn: "Word order",
    badgeLabel: "Word order",
    color: "#F59E0B",
  },
  "speaking": {
    id: "speaking",
    num: "6",
    icon: "🎙️",
    nameZh: "口语朗读",
    nameEn: "Speaking",
    badgeLabel: "Speaking",
    color: "#10B981",
  },
  "flashcard-review": {
    id: "flashcard-review",
    num: "7",
    icon: "🎴",
    nameZh: "闪卡复习",
    nameEn: "Flashcard review",
    badgeLabel: "Flashcard review",
    color: "#F97316",
  },
  "translation": {
    id: "translation",
    num: "8",
    icon: "🌐",
    nameZh: "句子翻译",
    nameEn: "Translation",
    badgeLabel: "Translation",
    color: "#6366F1",
  },
  "writing": {
    id: "writing",
    num: "9",
    icon: "📝",
    nameZh: "整篇写作",
    nameEn: "Writing",
    badgeLabel: "Writing",
    color: "#0EA5E9",
  },
  "free-text": {
    id: "free-text",
    num: "9",
    icon: "✍️",
    nameZh: "自由表达",
    nameEn: "Free text",
    badgeLabel: "Free text",
    color: "#8B5CF6",
  },
  "mix": {
    id: "mix",
    num: "✨",
    icon: "🔀",
    nameZh: "综合练习",
    nameEn: "Mixed",
    badgeLabel: "Mixed",
    color: "#8B5CF6",
  },
  "mixed": {
    id: "mixed",
    num: "✨",
    icon: "🔀",
    nameZh: "综合练习",
    nameEn: "Mixed",
    badgeLabel: "Mixed",
    color: "#8B5CF6",
  },
};

export const QUESTION_TYPE_LIST = [
  QUESTION_TYPES["multiple-choice"],
  QUESTION_TYPES["fill-in-the-blank"],
  QUESTION_TYPES["matching-pairs"],
  QUESTION_TYPES["listening"],
  QUESTION_TYPES["word-bank"],
  QUESTION_TYPES["speaking"],
  QUESTION_TYPES["flashcard-review"],
  QUESTION_TYPES["translation"],
  QUESTION_TYPES["mix"],
];

/**
 * The canonical exercise-type sequence — the order the Library's own folders
 * use (Flashcards → Translation → Multiple Choice → …).
 *
 * Both surfaces read this one list so they can never drift apart: the Library
 * builds its folder grid from it, and the landing page teaches the same
 * sequence so a learner meets the same order before and after signing in.
 *
 * A type with no library folder of its own (e.g. Matching pairs) simply has no
 * entry here; callers that need to place it put it after the listed ones.
 */
export const LIBRARY_TYPE_ORDER: readonly string[] = [
  "flashcard-review",
  "translation",
  "multiple-choice",
  "fill-in-the-blank",
  "listening",
  "word-bank",
  "speaking",
  "writing",
];

export function normalizeQuestionType(
  input?: string | number | null
): QuestionTypeInfo | null {
  if (!input) return null;
  const str = String(input).trim().toLowerCase().replace(/_/g, "-");

  if (QUESTION_TYPES[str]) return QUESTION_TYPES[str];

  // Mix / Mixed lookup
  if (
    str === "mix" ||
    str === "mixed" ||
    str === "combo" ||
    str === "hybrid" ||
    str.includes("综合") ||
    str.includes("混选") ||
    str.includes("多种")
  ) {
    return QUESTION_TYPES["mix"];
  }

  // Number lookup matching front page 1-8
  if (str === "1") return QUESTION_TYPES["multiple-choice"];
  if (str === "2") return QUESTION_TYPES["fill-in-the-blank"];
  if (str === "3") return QUESTION_TYPES["matching-pairs"];
  if (str === "4") return QUESTION_TYPES["listening"];
  if (str === "5") return QUESTION_TYPES["word-bank"];
  if (str === "6") return QUESTION_TYPES["speaking"];
  if (str === "7") return QUESTION_TYPES["flashcard-review"];
  if (str === "8") return QUESTION_TYPES["translation"];
  if (str === "9") return QUESTION_TYPES["free-text"];

  // Exact or keyword matching
  if (str.includes("multiple") || str.includes("choice") || str.includes("多选") || str.includes("选择")) {
    return QUESTION_TYPES["multiple-choice"];
  }
  if (str.includes("blank") || str.includes("fill") || str.includes("填空")) {
    return QUESTION_TYPES["fill-in-the-blank"];
  }
  if (str.includes("matching") || str.includes("pairs") || str.includes("配对") || str.includes("连线")) {
    return QUESTION_TYPES["matching-pairs"];
  }
  if (str.includes("listen") || str.includes("audio") || str.includes("tts") || str.includes("听力")) {
    return QUESTION_TYPES["listening"];
  }
  if (str.includes("word-bank") || str.includes("word-order") || str.includes("order") || str.includes("bank") || str.includes("scramble") || str.includes("拼句") || str.includes("组句") || str.includes("语序")) {
    return QUESTION_TYPES["word-bank"];
  }
  if (str.includes("speak") || str.includes("oral") || str.includes("stt") || str.includes("口语") || str.includes("朗读")) {
    return QUESTION_TYPES["speaking"];
  }
  if (str.includes("flashcard") || str.includes("srs") || str.includes("闪卡")) {
    return QUESTION_TYPES["flashcard-review"];
  }
  if (str.includes("translat") || str.includes("翻译")) {
    return QUESTION_TYPES["translation"];
  }
  // "writing" must be checked before the generic "write" branch below, and
  // it must not be swallowed by the "translat" check above.
  if (str.includes("writing") || str.includes("essay") || str.includes("作文")) {
    return QUESTION_TYPES["writing"];
  }
  if (str.includes("free-text") || str.includes("自由表达")) {
    return QUESTION_TYPES["free-text"];
  }

  return null;
}

export function detectQuestionTypeFromMarkdown(
  markdown: string
): QuestionTypeInfo | null {
  if (!markdown) return null;

  // 1. Check frontmatter for explicit questionType or exerciseType
  const fmMatch = markdown.match(
    /^(?:questionType|exerciseType):\s*["']?([^"'\n\r]+)["']?/im
  );
  if (fmMatch) {
    const norm = normalizeQuestionType(fmMatch[1]);
    if (norm) return norm;
  }

  // 2. Check all exercise tag blocks like [multiple-choice], [translation], etc.
  const tagRegex = /\[([a-z0-9_-]+)\]/gi;
  const distinctTypes = new Map<string, QuestionTypeInfo>();
  let match;
  while ((match = tagRegex.exec(markdown)) !== null) {
    const norm = normalizeQuestionType(match[1]);
    if (norm) {
      distinctTypes.set(norm.id, norm);
    }
  }

  if (distinctTypes.size > 1) {
    return QUESTION_TYPES["mix"];
  }

  if (distinctTypes.size === 1) {
    return distinctTypes.values().next().value ?? null;
  }

  return null;
}

export function getUnitQuestionType(unit: {
  questionType?: QuestionTypeInfo | string | null;
  lessons?: { exercises?: { type: string }[] }[];
  markdown?: string | null;
}): QuestionTypeInfo | null {
  // 1. If explicit questionType was provided
  if (unit.questionType) {
    if (typeof unit.questionType === "object" && "id" in unit.questionType) {
      return unit.questionType as QuestionTypeInfo;
    }
    const norm = normalizeQuestionType(unit.questionType as string);
    if (norm) return norm;
  }

  // 2. Check frontmatter in markdown first if available
  if (unit.markdown) {
    const fmMatch = unit.markdown.match(
      /^(?:questionType|exerciseType):\s*["']?([^"'\n\r]+)["']?/im
    );
    if (fmMatch) {
      const norm = normalizeQuestionType(fmMatch[1]);
      if (norm) return norm;
    }
  }

  // 3. Collect distinct exercise types from parsed lessons
  const distinctTypes = new Map<string, QuestionTypeInfo>();

  if (unit.lessons && unit.lessons.length > 0) {
    for (const l of unit.lessons) {
      for (const ex of l.exercises || []) {
        if (ex.type) {
          const norm = normalizeQuestionType(ex.type);
          if (norm) {
            distinctTypes.set(norm.id, norm);
          }
        }
      }
    }
  }

  // 4. If no lessons found or empty, scan markdown tags
  if (distinctTypes.size === 0 && unit.markdown) {
    const tagRegex = /\[([a-z0-9_-]+)\]/gi;
    let match;
    while ((match = tagRegex.exec(unit.markdown)) !== null) {
      const norm = normalizeQuestionType(match[1]);
      if (norm) {
        distinctTypes.set(norm.id, norm);
      }
    }
  }

  if (distinctTypes.size > 1) {
    return QUESTION_TYPES["mix"];
  }

  if (distinctTypes.size === 1) {
    return distinctTypes.values().next().value ?? null;
  }

  return null;
}

