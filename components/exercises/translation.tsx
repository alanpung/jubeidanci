"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Volume2, ChevronLeft, ChevronRight } from "lucide-react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { generateAlternativeTranslations } from "@/lib/similarity";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { detectTextLanguage } from "@/lib/language-detector";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  /** Go to the previous question (no-op past the first). */
  onPrev: () => void;
  /** Whether there is a previous question to go back to. */
  canGoPrev: boolean;
  /** 0-based index of this question within the lesson. */
  exerciseIndex: number;
  /** Total questions in the lesson — drives the "Q x / N" label. */
  totalExercises: number;
  /** Last navigation direction, used for the slide-in animation. */
  direction: "forward" | "backward" | null;
  language: string;
  autoplayAudio?: boolean;
}

interface AnalyzedWord {
  word: string;
  ipa?: string;
  meaning?: string;
  pos?: string;
  grammarTag?: string;
}

interface SentenceAnalysisData {
  fullTranslation?: string;
  acceptableTranslations?: string[];
  words?: AnalyzedWord[];
  chunks?: { chunkLabel: string; words: AnalyzedWord[] }[];
}

// Comprehensive built-in word dictionary for instant accurate fallback mapping
const BUILTIN_WORD_DICT: Record<string, { ipa: string; meaning: string; grammarTag: string }> = {
  did: { ipa: "/dɪd/", meaning: "做/干", grammarTag: "助动词" },
  do: { ipa: "/duː/", meaning: "做/干", grammarTag: "助动词" },
  does: { ipa: "/dʌz/", meaning: "做/干", grammarTag: "助动词" },
  have: { ipa: "/hæv/", meaning: "有/已经", grammarTag: "助动词" },
  has: { ipa: "/hæz/", meaning: "有/已经", grammarTag: "助动词" },
  had: { ipa: "/hæd/", meaning: "有/已经", grammarTag: "助动词" },
  will: { ipa: "/wɪl/", meaning: "将会", grammarTag: "助动词" },
  would: { ipa: "/wʊd/", meaning: "想要/会", grammarTag: "助动词" },
  can: { ipa: "/kæn/", meaning: "能/可以", grammarTag: "助动词" },
  could: { ipa: "/kʊd/", meaning: "能够", grammarTag: "助动词" },
  should: { ipa: "/ʃʊd/", meaning: "应该", grammarTag: "助动词" },
  must: { ipa: "/mʌst/", meaning: "必须", grammarTag: "助动词" },
  shall: { ipa: "/ʃæl/", meaning: "将/要不要", grammarTag: "助动词" },
  is: { ipa: "/ɪz/", meaning: "是", grammarTag: "助动词" },
  are: { ipa: "/ɑːr/", meaning: "是", grammarTag: "助动词" },
  am: { ipa: "/æm/", meaning: "是", grammarTag: "助动词" },
  was: { ipa: "/wɒz/", meaning: "是(过去)", grammarTag: "助动词" },
  were: { ipa: "/wɜːr/", meaning: "是(过去)", grammarTag: "助动词" },
  be: { ipa: "/biː/", meaning: "是/成为", grammarTag: "动词" },
  been: { ipa: "/bɪn/", meaning: "是(分词)", grammarTag: "动词" },
  you: { ipa: "/juː/", meaning: "你", grammarTag: "代词" },
  i: { ipa: "/aɪ/", meaning: "我", grammarTag: "代词" },
  he: { ipa: "/hiː/", meaning: "他", grammarTag: "代词" },
  she: { ipa: "/ʃiː/", meaning: "她", grammarTag: "代词" },
  it: { ipa: "/ɪt/", meaning: "它", grammarTag: "代词" },
  we: { ipa: "/wiː/", meaning: "我们", grammarTag: "代词" },
  they: { ipa: "/ðeɪ/", meaning: "他们", grammarTag: "代词" },
  me: { ipa: "/miː/", meaning: "我", grammarTag: "代词" },
  him: { ipa: "/hɪm/", meaning: "他", grammarTag: "代词" },
  her: { ipa: "/hɜːr/", meaning: "她/她的", grammarTag: "代词" },
  us: { ipa: "/ʌs/", meaning: "我们", grammarTag: "代词" },
  them: { ipa: "/ðɛm/", meaning: "他们", grammarTag: "代词" },
  my: { ipa: "/maɪ/", meaning: "我的", grammarTag: "限定词" },
  your: { ipa: "/jɔːr/", meaning: "你的", grammarTag: "限定词" },
  his: { ipa: "/hɪz/", meaning: "他的", grammarTag: "限定词" },
  our: { ipa: "/aʊər/", meaning: "我们的", grammarTag: "限定词" },
  their: { ipa: "/ðɛər/", meaning: "他们的", grammarTag: "限定词" },
  its: { ipa: "/ɪts/", meaning: "它的", grammarTag: "限定词" },
  this: { ipa: "/ðɪs/", meaning: "这", grammarTag: "限定词" },
  that: { ipa: "/ðæt/", meaning: "那", grammarTag: "限定词" },
  these: { ipa: "/ðiːz/", meaning: "这些", grammarTag: "限定词" },
  those: { ipa: "/ðoʊz/", meaning: "那些", grammarTag: "限定词" },
  another: { ipa: "/əˈnʌðər/", meaning: "另一", grammarTag: "限定词" },
  the: { ipa: "/ðə/", meaning: "这/那", grammarTag: "冠词" },
  a: { ipa: "/ə/", meaning: "一个", grammarTag: "冠词" },
  an: { ipa: "/æn/", meaning: "一个", grammarTag: "冠词" },
  to: { ipa: "/tuː/", meaning: "去/向", grammarTag: "介词" },
  for: { ipa: "/fɔːr/", meaning: "为了/去", grammarTag: "介词" },
  in: { ipa: "/ɪn/", meaning: "在…里", grammarTag: "介词" },
  on: { ipa: "/ɒn/", meaning: "在…上", grammarTag: "介词" },
  at: { ipa: "/æt/", meaning: "在", grammarTag: "介词" },
  with: { ipa: "/wɪð/", meaning: "和…一起", grammarTag: "介词" },
  from: { ipa: "/frɒm/", meaning: "从", grammarTag: "介词" },
  by: { ipa: "/baɪ/", meaning: "通过", grammarTag: "介词" },
  about: { ipa: "/əˈbaʊt/", meaning: "关于", grammarTag: "介词" },
  after: { ipa: "/ˈæftər/", meaning: "在…之后", grammarTag: "介词" },
  before: { ipa: "/bɪˈfɔːr/", meaning: "在…之前", grammarTag: "介词" },
  during: { ipa: "/ˈdjʊərɪŋ/", meaning: "在…期间", grammarTag: "介词" },
  near: { ipa: "/nɪər/", meaning: "在…附近", grammarTag: "介词" },
  into: { ipa: "/ˈɪntuː/", meaning: "进入", grammarTag: "介词" },
  of: { ipa: "/ɒv/", meaning: "…的", grammarTag: "介词" },
  and: { ipa: "/ænd/", meaning: "和", grammarTag: "连词" },
  but: { ipa: "/bʌt/", meaning: "但是", grammarTag: "连词" },
  or: { ipa: "/ɔːr/", meaning: "或者", grammarTag: "连词" },
  because: { ipa: "/bɪˈkɒz/", meaning: "因为", grammarTag: "连词" },
  if: { ipa: "/ɪf/", meaning: "如果", grammarTag: "连词" },
  when: { ipa: "/wɛn/", meaning: "当…时", grammarTag: "连词" },
  sweet: { ipa: "/swiːt/", meaning: "甜的", grammarTag: "形容词" },
  something: { ipa: "/ˈsʌm.θɪŋ/", meaning: "某物/东西", grammarTag: "代词" },
  want: { ipa: "/wɒnt/", meaning: "想要", grammarTag: "动词" },
  excuse: { ipa: "/ɪkˈskjuːz/", meaning: "打扰(Excuse me)", grammarTag: "动词" },
  eat: { ipa: "/iːt/", meaning: "吃", grammarTag: "动词" },
  like: { ipa: "/laɪk/", meaning: "喜欢", grammarTag: "动词" },
  fresh: { ipa: "/freʃ/", meaning: "新鲜的", grammarTag: "形容词" },
  apples: { ipa: "/ˈæplz/", meaning: "苹果", grammarTag: "名词" },
  apple: { ipa: "/ˈæpl/", meaning: "苹果", grammarTag: "名词" },
  polluted: { ipa: "/pəˈluːtɪd/", meaning: "受污染的", grammarTag: "形容词" },
  river: { ipa: "/ˈrɪv.ər/", meaning: "河流", grammarTag: "名词" },
  always: { ipa: "/ˈɔːl.weɪz/", meaning: "总是", grammarTag: "副词" },
  see: { ipa: "/siː/", meaning: "看见", grammarTag: "动词" },
  red: { ipa: "/red/", meaning: "红色的", grammarTag: "形容词" },
  fruit: { ipa: "/fruːt/", meaning: "水果", grammarTag: "名词" },
  autumn: { ipa: "/ˈɔː.təm/", meaning: "秋天", grammarTag: "名词" },
  cycling: { ipa: "/ˈsaɪklɪŋ/", meaning: "骑行", grammarTag: "名词" },
  mountains: { ipa: "/ˈmaʊntɪnz/", meaning: "山脉", grammarTag: "名词" },
  mountain: { ipa: "/ˈmaʊntɪn/", meaning: "大山", grammarTag: "名词" },
  teach: { ipa: "/tiːtʃ/", meaning: "教导", grammarTag: "动词" },
  dance: { ipa: "/dɑːns/", meaning: "跳舞", grammarTag: "动词" },
  stay: { ipa: "/steɪ/", meaning: "停留", grammarTag: "动词" },
  stayed: { ipa: "/steɪd/", meaning: "停留", grammarTag: "动词" },
  there: { ipa: "/ðɛər/", meaning: "那里", grammarTag: "副词" },
  here: { ipa: "/hɪər/", meaning: "这里", grammarTag: "副词" },
  forever: { ipa: "/fərˈevər/", meaning: "永远", grammarTag: "副词" },
  beach: { ipa: "/biːtʃ/", meaning: "海滩", grammarTag: "名词" },
  wish: { ipa: "/wɪʃ/", meaning: "希望", grammarTag: "动词" },
  asked: { ipa: "/æskt/", meaning: "请/询问", grammarTag: "动词" },
  ask: { ipa: "/æsk/", meaning: "请/询问", grammarTag: "动词" },
  year: { ipa: "/jɪər/", meaning: "年", grammarTag: "名词" },
  period: { ipa: "/ˈpɪəriəd/", meaning: "课时", grammarTag: "名词" },
  lunch: { ipa: "/lʌntʃ/", meaning: "午餐", grammarTag: "名词" },
  dinner: { ipa: "/ˈdɪnər/", meaning: "晚餐", grammarTag: "名词" },
  breakfast: { ipa: "/ˈbrekfəst/", meaning: "早餐", grammarTag: "名词" },
  third: { ipa: "/θɜːrd/", meaning: "第三", grammarTag: "数词" },
  first: { ipa: "/fɜːrst/", meaning: "第一", grammarTag: "数词" },
  second: { ipa: "/ˈsek.ənd/", meaning: "第二", grammarTag: "数词" },
  seven: { ipa: "/ˈsev.ən/", meaning: "七点/七", grammarTag: "数词" },
  eight: { ipa: "/eɪt/", meaning: "八点/八", grammarTag: "数词" },
  nine: { ipa: "/naɪn/", meaning: "九点/九", grammarTag: "数词" },
  ten: { ipa: "/ten/", meaning: "十点/十", grammarTag: "数词" },
  "o'clock": { ipa: "/əˈklɒk/", meaning: "点钟", grammarTag: "副词" },
  leaves: { ipa: "/liːvz/", meaning: "离开", grammarTag: "动词" },
  leave: { ipa: "/liːv/", meaning: "离开", grammarTag: "动词" },
  wakes: { ipa: "/weɪks/", meaning: "醒来", grammarTag: "动词" },
  wake: { ipa: "/weɪk/", meaning: "醒来", grammarTag: "动词" },
  up: { ipa: "/ʌp/", meaning: "起来", grammarTag: "副词" },
  morning: { ipa: "/ˈmɔːrnɪŋ/", meaning: "早晨", grammarTag: "名词" },
  afternoon: { ipa: "/ˌæftərˈnuːn/", meaning: "下午", grammarTag: "名词" },
  evening: { ipa: "/ˈiːvnɪŋ/", meaning: "晚上", grammarTag: "名词" },
  night: { ipa: "/naɪt/", meaning: "夜间", grammarTag: "名词" },
  weekend: { ipa: "/ˈwiːk.end/", meaning: "周末", grammarTag: "名词" },
  weekends: { ipa: "/ˈwiːk.endz/", meaning: "周末", grammarTag: "名词" },
  reads: { ipa: "/riːdz/", meaning: "阅读", grammarTag: "动词" },
  read: { ipa: "/riːd/", meaning: "阅读", grammarTag: "动词" },
  books: { ipa: "/bʊks/", meaning: "书籍", grammarTag: "名词" },
  book: { ipa: "/bʊk/", meaning: "书籍", grammarTag: "名词" },
  bed: { ipa: "/bed/", meaning: "床", grammarTag: "名词" },
  usually: { ipa: "/ˈjuː.ʒu.ə.li/", meaning: "通常", grammarTag: "副词" },
  often: { ipa: "/ˈɒf.ən/", meaning: "经常", grammarTag: "副词" },
  sometimes: { ipa: "/ˈsʌm.taɪmz/", meaning: "有时", grammarTag: "副词" },
  never: { ipa: "/ˈnev.ər/", meaning: "从不", grammarTag: "副词" },
  goes: { ipa: "/ɡoʊz/", meaning: "去", grammarTag: "动词" },
  go: { ipa: "/ɡoʊ/", meaning: "去", grammarTag: "动词" },
  park: { ipa: "/pɑːrk/", meaning: "公园", grammarTag: "名词" },
  children: { ipa: "/ˈtʃɪl.drən/", meaning: "孩子们", grammarTag: "名词" },
  kids: { ipa: "/kɪdz/", meaning: "孩子们", grammarTag: "名词" },
  play: { ipa: "/pleɪ/", meaning: "玩耍", grammarTag: "动词" },
  games: { ipa: "/ɡeɪmz/", meaning: "游戏", grammarTag: "名词" },
  game: { ipa: "/ɡeɪm/", meaning: "游戏", grammarTag: "名词" },
  outside: { ipa: "/ˌaʊtˈsaɪd/", meaning: "在外面", grammarTag: "副词" },
  get: { ipa: "/ɡɛt/", meaning: "使得/收到", grammarTag: "动词" },
  message: { ipa: "/ˈmɛs.ɪdʒ/", meaning: "消息", grammarTag: "名词" },
  just: { ipa: "/dʒʌst/", meaning: "刚刚", grammarTag: "副词" },
  "they've": { ipa: "/ðeɪv/", meaning: "他们已经", grammarTag: "代词" },
  "i've": { ipa: "/aɪv/", meaning: "我已经", grammarTag: "代词" },
  "we've": { ipa: "/wiːv/", meaning: "我们已经", grammarTag: "代词" },
  "you've": { ipa: "/juːv/", meaning: "你已经", grammarTag: "代词" },
  "i'm": { ipa: "/aɪm/", meaning: "我是", grammarTag: "代词" },
  "you're": { ipa: "/jɔːr/", meaning: "你是", grammarTag: "代词" },
  "he's": { ipa: "/hiːz/", meaning: "他是", grammarTag: "代词" },
  "she's": { ipa: "/ʃiːz/", meaning: "她是", grammarTag: "代词" },
  "it's": { ipa: "/ɪts/", meaning: "它是", grammarTag: "代词" },
  "we're": { ipa: "/wɪər/", meaning: "我们是", grammarTag: "代词" },
  "they're": { ipa: "/ðɛər/", meaning: "他们是", grammarTag: "代词" },
  "that's": { ipa: "/ðæts/", meaning: "那是", grammarTag: "代词" },
  "there's": { ipa: "/ðɛərz/", meaning: "有/在那", grammarTag: "副词" },
  "don't": { ipa: "/doʊnt/", meaning: "不/别", grammarTag: "助动词" },
  "doesn't": { ipa: "/ˈdʌznt/", meaning: "不", grammarTag: "助动词" },
  "didn't": { ipa: "/ˈdɪdnt/", meaning: "没有", grammarTag: "助动词" },
  "can't": { ipa: "/kænt/", meaning: "不能", grammarTag: "助动词" },
  "won't": { ipa: "/woʊnt/", meaning: "不会", grammarTag: "助动词" },
};

const POS_BADGE_STYLES: Record<string, { text: string; bg: string; border: string }> = {
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

function resolveGrammarTag(word: string, pos?: string): string {
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

export function Translation({
  exercise,
  onResult,
  onContinue,
  onPrev,
  canGoPrev,
  exerciseIndex,
  totalExercises,
  direction,
  language,
  autoplayAudio = true,
}: Props) {
  const [analysis, setAnalysis] = useState<SentenceAnalysisData | null>(null);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

  const allAnswers = useMemo(() => {
    const fromProps = exercise.acceptAlso || [];
    const fromApi = analysis?.acceptableTranslations || [];
    return generateAlternativeTranslations(exercise.answer, [...fromProps, ...fromApi]);
  }, [exercise.answer, exercise.acceptAlso, analysis?.acceptableTranslations]);

  // We no longer grade the translation (the Check button is gone); the exercise
  // is a reveal-and-review deck, so `status` is only kept for the shell's API.
  const { status } = useExercise();
  const { play, stop, prefetch } = useAudio();

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language]
  );

  useEffect(() => {
    let isMounted = true;
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence: exercise.answer, targetLanguage: "en" }),
        });
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setAnalysis(json);
        }
      } catch (err) {
        console.error("Failed to fetch sentence analysis", err);
      }
    }
    fetchAnalysis();
    return () => {
      isMounted = false;
    };
  }, [exercise.answer]);

  const analyzedWordList = useMemo<AnalyzedWord[]>(() => {
    return rawAnswerTokens.map((token: string) => {
      const clean = token.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
      const dict = BUILTIN_WORD_DICT[clean];

      const apiWord = analysis?.chunks?.flatMap((c) => c.words)?.find((w) =>
        w.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "") === clean
      );

      let gTag = (apiWord?.pos && POS_BADGE_STYLES[apiWord.pos])
        ? apiWord.pos
        : (dict?.grammarTag || resolveGrammarTag(clean, apiWord?.pos));

      // The built-in dictionary wins over the API for the Chinese meaning so the
      // two always come from one hand-checked source.
      let meaning = "";
      if (dict?.meaning && /[\u4e00-\u9fa5]/.test(dict.meaning)) {
        meaning = dict.meaning;
      } else if (apiWord?.meaning && /[\u4e00-\u9fa5]/.test(apiWord.meaning)) {
        meaning = apiWord.meaning;
      }

      const ipa = dict?.ipa || apiWord?.ipa || "";

      return { word: token, ipa, meaning, pos: gTag, grammarTag: gTag };
    });
  }, [rawAnswerTokens, analysis]);

  const orderedAnswers = useMemo(() => {
    const primary = allAnswers[0] || exercise.answer;
    const matched = allAnswers.find((a) => a.toLowerCase() === primary.toLowerCase());
    if (!matched) return allAnswers;
    return [matched, ...allAnswers.filter((a) => a.toLowerCase() !== primary.toLowerCase())];
  }, [allAnswers, exercise.answer]);

  useEffect(() => {
    const toFetch = [exercise.sentence, ...allAnswers].filter(Boolean);
    prefetch(toFetch, language);
  }, [exercise.sentence, allAnswers, language, prefetch]);

  // Audio: read the Chinese prompt on entry, then the English answer a beat
  // later (the answer is shown immediately, so there is no "Check" gate to wait
  // for). Mirrors the prior "read Chinese first, English after" intent.
  useEffect(() => {
    if (!autoplayAudio) return;
    if (exercise.noAudio?.includes("sentence")) return stop;
    play(exercise.sentence, sentenceLang);
    const t = setTimeout(() => {
      if (!exercise.noAudio?.includes("answer")) play(exercise.answer, "en");
    }, 1200);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [exercise.sentence, sentenceLang, exercise.answer, autoplayAudio, play, stop, exercise.noAudio]);

  // NEXT: record this question as viewed (so the lesson can complete) and move
  // on. PREV: just step back — no re-recording.
  const goNext = useCallback(() => {
    onResult(true, exercise.answer);
    onContinue();
  }, [onResult, onContinue, exercise.answer]);

  const goPrev = useCallback(() => {
    if (canGoPrev) onPrev();
  }, [canGoPrev, onPrev]);

  const animClass =
    direction === "backward" ? "animate-slide-in-left" : "animate-slide-in-right";

  return (
    <ExerciseShell
      status={status}
      onCheck={() => {}}
      onContinue={onContinue}
      canCheck={false}
      hideCheck
      hideContinue
      freeNav
      onSwipeLeft={goNext}
      onSwipeRight={goPrev}
    >
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-2 sm:py-4">
        {/* Position within the lesson */}
        <div className="mb-3 text-xs font-bold text-lingo-text-light">
          Question {exerciseIndex + 1} / {totalExercises}
        </div>

        {/* Chinese Sentence Prompt at the top */}
        <div className="flex flex-col items-center mt-2 mb-4 text-center px-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-800 tracking-normal select-none">
            <HoverableText text={exercise.sentence} language={sentenceLang} />
          </h1>
        </div>

        {/* Audio output controls — centered below the Chinese question. Both
            buttons are visible from the start; only Chinese auto-plays on entry,
            English follows a beat later (see the effect above). */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              play(exercise.sentence, sentenceLang);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-lingo-blue px-3.5 text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold shadow-sm"
            aria-label="播放中文音频"
            title="中文音频"
          >
            <Volume2 className="h-4 w-4" />
            中文
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              play(exercise.answer, "en");
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-lingo-blue px-3.5 text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold shadow-sm"
            aria-label="播放英文音频"
            title="英文音频"
          >
            <Volume2 className="h-4 w-4" />
            English
          </button>
        </div>

        {/* Answer deck — the "<" / ">" arrows flank it for last/next question,
            and the same move is available by swiping left/right on touch. */}
        <div className="flex w-full items-stretch gap-2 sm:gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="上一题"
            className="flex shrink-0 items-center justify-center self-center rounded-full border-2 border-lingo-border bg-white h-12 w-12 text-lingo-text shadow-sm transition-all hover:border-lingo-blue hover:text-lingo-blue active:translate-y-0.5 disabled:opacity-30 disabled:hover:border-lingo-border disabled:hover:text-lingo-text"
          >
            <ChevronLeft className="h-7 w-7 stroke-[3]" />
          </button>

          <div className={`min-w-0 flex-1 ${animClass}`}>
            {/* English answer — shown as a study card (word + POS + meaning + IPA) */}
            <div className="flex flex-wrap items-start justify-center gap-2 sm:gap-3 lg:gap-4 w-full max-w-5xl">
              {analyzedWordList.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border-2 border-emerald-200 bg-emerald-50/20 shadow-xs px-2 sm:px-3 lg:px-4 py-2 sm:py-3 flex flex-col items-center justify-start min-w-[62px] sm:min-w-[92px] lg:min-w-[100px]"
                >
                  <span
                    style={{ minWidth: `${Math.max(3, item.word.length)}ch` }}
                    className="text-center font-serif text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-emerald-700"
                  >
                    {item.word}
                  </span>
                  <div className="flex flex-col items-center justify-center mt-1 sm:mt-2 w-full space-y-1 sm:space-y-1.5">
                    {item.grammarTag && (
                      <div
                        className={`text-[10px] sm:text-[11px] lg:text-xs font-bold text-center px-2 sm:px-2.5 py-0.5 rounded-full border shadow-2xs tracking-wide ${
                          POS_BADGE_STYLES[item.grammarTag]
                            ? `${POS_BADGE_STYLES[item.grammarTag].bg} ${POS_BADGE_STYLES[item.grammarTag].text} ${POS_BADGE_STYLES[item.grammarTag].border}`
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {item.grammarTag}
                      </div>
                    )}
                    {item.meaning && (
                      <div className="text-xs sm:text-sm lg:text-base text-gray-800 text-center font-semibold">
                        {item.meaning}
                      </div>
                    )}
                    {item.ipa && (
                      <div className="text-[10px] sm:text-xs lg:text-sm text-gray-500 font-mono text-center">
                        {item.ipa}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Alternative answers — blue card, only when more than one. */}
            {orderedAnswers.length > 1 && (
              <div className="mx-auto mt-4 w-full max-w-2xl p-3 sm:p-4 bg-blue-50/40 border-2 border-blue-200 rounded-2xl shadow-sm space-y-1">
                <span className="block text-xs font-bold text-blue-700 uppercase tracking-wider">
                  ALTERNATIVE ANSWERS:
                </span>
                {orderedAnswers.slice(1).map((alt, aIdx) => (
                  <div key={aIdx} className="text-sm sm:text-base font-bold text-blue-700">
                    {alt}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={goNext}
            aria-label="下一题"
            className="flex shrink-0 items-center justify-center self-center rounded-full border-2 border-lingo-green bg-lingo-green h-12 w-12 text-white shadow-[0_4px_0_0] shadow-[#4a9e02] transition-all hover:bg-[#4a9e02] active:translate-y-0.5 active:shadow-none"
          >
            <ChevronRight className="h-7 w-7 stroke-[3]" />
          </button>
        </div>
      </div>
    </ExerciseShell>
  );
}
