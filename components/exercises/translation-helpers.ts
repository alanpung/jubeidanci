/** Grammar/POS helpers for the translation exercise. */
import { BUILTIN_WORD_DICT } from "./translation-word-dict";

export const POS_BADGE_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  "动词": { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200" },
  "名词": { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  "代词": { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  "人称代词": { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  "形容词": { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  "副词": { text: "text-fuchsia-700", bg: "bg-fuchsia-50", border: "border-fuchsia-200" },
  "介词": { text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
  "连词": { text: "text-yellow-800", bg: "bg-yellow-50", border: "border-yellow-200" },
  "冠词": { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  "限定词": { text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  "物主限定词": { text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  "助动词": { text: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
  "数词": { text: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200" },
};

const ARTICLES_SET = new Set(["a", "an", "the"]);
const PRONOUNS_SET = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "someone", "anyone", "everyone", "nobody", "somebody", "anybody", "everybody",
  "something", "anything", "everything", "nothing"
]);
const DETERMINERS_SET = new Set([
  "my", "your", "his", "her", "its", "our", "their", "this", "that", "these", "those",
  "some", "any", "no", "every", "each", "all", "both", "another"
]);
const AUXILIARIES_SET = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must"
]);
const PREPOSITIONS_SET = new Set([
  "in", "on", "at", "to", "for", "with", "from", "by", "about", "around", "into",
  "through", "during", "before", "after", "above", "below", "between", "under", "near", "without"
]);
const CONJUNCTIONS_SET = new Set([
  "and", "but", "or", "so", "because", "although", "though", "if", "when", "while", "since"
]);
const NUMERALS_SET = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "first", "second", "third", "fourth", "fifth"
]);
const ADVERBS_SET = new Set([
  "always", "usually", "often", "sometimes", "never", "seldom", "hardly", "ever",
  "very", "too", "quite", "really", "already", "still", "yet", "just", "now", "then",
  "here", "there", "today", "yesterday", "tomorrow", "tonight", "outside", "inside",
  "o'clock", "please", "forever", "slowly", "quickly", "suddenly", "finally"
]);
const ADJECTIVES_SET = new Set([
  "red", "blue", "green", "yellow", "white", "black", "orange", "purple", "pink", "sweet",
  "fresh", "polluted", "cold", "hot", "warm", "clean", "dirty", "new", "old", "big",
  "small", "good", "bad", "long", "short", "delicious", "nice", "pretty", "cute"
]);

export function resolveGrammarTag(word: string, pos?: string): string {
  const clean = word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");

  if (ARTICLES_SET.has(clean)) return "冠词";
  if (PRONOUNS_SET.has(clean)) return "代词";
  if (DETERMINERS_SET.has(clean)) return "限定词";
  if (AUXILIARIES_SET.has(clean)) return "助动词";
  if (PREPOSITIONS_SET.has(clean)) return "介词";
  if (CONJUNCTIONS_SET.has(clean)) return "连词";
  if (NUMERALS_SET.has(clean)) return "数词";
  if (ADVERBS_SET.has(clean)) return "副词";
  if (ADJECTIVES_SET.has(clean)) return "形容词";

  if (BUILTIN_WORD_DICT[clean]?.grammarTag) {
    return BUILTIN_WORD_DICT[clean].grammarTag;
  }

  const p = (pos || "").toLowerCase().trim();
  if (p === "动词" || p === "名词" || p === "形容词" || p === "副词" || p === "代词" || p === "介词" || p === "连词" || p === "冠词" || p === "限定词" || p === "助动词" || p === "数词") {
    return p;
  }
  if (p.includes("adv") || p === "r") return "副词";
  if (p.includes("adj") || p === "a") return "形容词";
  if (p.includes("pron")) return "代词";
  if (p.includes("prep") || p === "p") return "介词";
  if (p.includes("conj") || p === "c") return "连词";
  if (p.includes("aux") || p.includes("modal") || p === "be-verb") return "助动词";
  if (p.includes("verb") || p === "v") return "动词";
  if (p.includes("noun") || p === "n") return "名词";
  if (p.includes("num")) return "数词";
  if (p.includes("det") || p.includes("art")) return "限定词";

  return "名词";
}
