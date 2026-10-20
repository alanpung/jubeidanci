"use client";

import { useState, useEffect, useMemo, useRef, useCallback, KeyboardEvent } from "react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { checkWordMatch, generateAlternativeTranslations, WordMatchResult } from "@/lib/similarity";
import { synonymsOf } from "@/lib/synonyms";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { detectTextLanguage } from "@/lib/language-detector";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
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
  // "Excuse me" is a fixed polite opener — it means 打扰一下/请问, NOT the
  // noun sense 原谅. Showing 原谅 here made the sentence "请问售票处在哪里？"
  // look like its English answer was missing the "excuse me" politeness.
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

export function Translation({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const [analysis, setAnalysis] = useState<SentenceAnalysisData | null>(null);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

  const allAnswers = useMemo(() => {
    const fromProps = exercise.acceptAlso || [];
    const fromApi = analysis?.acceptableTranslations || [];
    return generateAlternativeTranslations(exercise.answer, [...fromProps, ...fromApi]);
  }, [exercise.answer, exercise.acceptAlso, analysis?.acceptableTranslations]);

  const [inputWords, setInputWords] = useState<string[]>(() => rawAnswerTokens.map(() => ""));
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [matchDetail, setMatchDetail] = useState<string>("");
  const [matchedWordIndices, setMatchedWordIndices] = useState<boolean[]>([]);
  const [activeSlot, setActiveSlot] = useState<number>(0);

  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch } = useAudio();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInputSlot = useCallback(
    (idx: number = 0) => {
      if (status !== "answering") return;
      const targetIdx = Math.max(0, Math.min(rawAnswerTokens.length - 1, idx));
      setActiveSlot(targetIdx);
      requestAnimationFrame(() => {
        const el = inputRefs.current[targetIdx] || (document.getElementById(`word-input-${targetIdx}`) as HTMLInputElement | null);
        if (el) {
          el.focus({ preventScroll: true });
          try {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          } catch {}
        }
      });
    },
    [status, rawAnswerTokens.length]
  );

  // Track the previously rendered answer so we only reset state when the
  // exercise actually changes. Without this guard, any change to `status`
  // (e.g. "answering" → "correct" when the user clicks Check) would re-run
  // this effect via the `focusInputSlot` callback reference, wiping out the
  // feedback that handleCheck() just wrote (inputWords, matchDetail,
  // matchedWordIndices, bestMatchAnswer).
  const prevAnswerRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevAnswerRef.current === exercise.answer) return;
    prevAnswerRef.current = exercise.answer;

    setInputWords(rawAnswerTokens.map(() => ""));
    setSimilarityScore(null);
    setMatchDetail("");
    setMatchedWordIndices([]);
    setBestMatchAnswer(exercise.answer);
    setActiveSlot(0);

    focusInputSlot(0);
    const t1 = setTimeout(() => focusInputSlot(0), 30);
    const t2 = setTimeout(() => focusInputSlot(0), 100);
    const t3 = setTimeout(() => focusInputSlot(0), 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [exercise.answer, rawAnswerTokens, focusInputSlot]);

  useEffect(() => {
    if (status === "answering") {
      focusInputSlot(0);
    }
  }, [status, focusInputSlot]);

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
      
      // Flatten chunks to find the word info from API analysis
      const apiWord = analysis?.chunks?.flatMap((c) => c.words)?.find((w) => 
        w.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "") === clean
      );

      // Prefer API POS if in Chinese, or dict, or resolveGrammarTag
      let gTag = (apiWord?.pos && POS_BADGE_STYLES[apiWord.pos])
        ? apiWord.pos
        : (dict?.grammarTag || resolveGrammarTag(clean, apiWord?.pos));

      // Meaning: must be valid Chinese.
      // The built-in dictionary wins over the API. Its entries are hand-checked
      // against the sentences this app actually ships, whereas the API returns
      // the most common dictionary sense — e.g. "Excuse" came back as 原谅
      // (the noun sense), hiding the 打扰一下/请问 sense that actually matches
      // the Chinese prompt 请问…. IPA already preferred the dictionary; this
      // makes the meaning follow the same rule so both come from one source.
      let meaning = "";
      if (dict?.meaning && /[\u4e00-\u9fa5]/.test(dict.meaning)) {
        meaning = dict.meaning;
      } else if (apiWord?.meaning && /[\u4e00-\u9fa5]/.test(apiWord.meaning)) {
        meaning = apiWord.meaning;
      }

      // IPA
      const ipa = dict?.ipa || apiWord?.ipa || "";

      return {
        word: token,
        ipa,
        meaning,
        pos: gTag,
        grammarTag: gTag,
      };
    });
  }, [rawAnswerTokens, analysis]);

  const orderedAnswers = useMemo(() => {
    if (!bestMatchAnswer) return allAnswers;
    const matched = allAnswers.find((a) => a.toLowerCase() === bestMatchAnswer.toLowerCase());
    if (!matched) return allAnswers;
    return [matched, ...allAnswers.filter((a) => a.toLowerCase() !== bestMatchAnswer.toLowerCase())];
  }, [allAnswers, bestMatchAnswer]);

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language]
  );

  useEffect(() => {
    const toFetch = [exercise.sentence, ...allAnswers].filter(Boolean);
    prefetch(toFetch, language);
  }, [exercise.sentence, allAnswers, language, prefetch]);

  useEffect(() => {
    if (autoplayAudio && !exercise.noAudio?.includes("sentence")) {
      play(exercise.sentence, sentenceLang);
    }
    return stop;
  }, [exercise.sentence, sentenceLang, autoplayAudio, play, stop, exercise.noAudio]);

  function handleCheck() {
    const matchResult: WordMatchResult = checkWordMatch(inputWords, allAnswers);

    setSimilarityScore(matchResult.score);
    setMatchDetail(`${matchResult.percentage}% (${matchResult.matchCount}/${matchResult.totalCount} words)`);
    setMatchedWordIndices(matchResult.matchedWordIndices);
    const primaryCorrect = allAnswers[0] || exercise.answer;
    setBestMatchAnswer(primaryCorrect);

    checkAnswer(matchResult.isCorrect);
    onResult(matchResult.isCorrect, inputWords.join(" ").trim());

    if (!exercise.noAudio?.includes("sentence")) {
      play(primaryCorrect, "en");
    }
  }

  const handleNavigation = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusInputSlot(Math.min(rawAnswerTokens.length - 1, i + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusInputSlot(Math.max(0, i - 1));
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (i + 1 < rawAnswerTokens.length) {
        focusInputSlot(i + 1);
      }
    } else if (e.key === "Backspace" && (!inputWords[i] || inputWords[i].length === 0)) {
      if (i > 0) {
        e.preventDefault();
        focusInputSlot(i - 1);
      }
    }
  };

  return (
    <ExerciseShell
      status={status}
      onCheck={handleCheck}
      onContinue={onContinue}
      canCheck={inputWords.length === rawAnswerTokens.length && inputWords.every((w: string) => w.trim().length > 0)}
      correctAnswer={bestMatchAnswer}
      allAnswers={orderedAnswers}
      language={language}
      similarityScore={similarityScore}
      similarityDetail={matchDetail}
      matchedWordIndices={matchedWordIndices}
      hideBottomFeedback
    >
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-2 sm:py-4">
        {/* Chinese Sentence Prompt at the top */}
        <div className="flex flex-col items-center mt-2 mb-6 text-center px-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-800 tracking-normal select-none">
              <HoverableText text={exercise.sentence} language={sentenceLang} />
            </h1>
          </div>
        </div>

        {/* Word Input Cards Layout (without word structure/chunk labels) */}
          <div
            onClick={(e) => {
              // Only jump to the first empty slot when the click lands on the
              // wrapper background itself. If the user clicks a specific input
              // box, let the native focus + onFocus handler select THAT box —
              // otherwise the bubbled click would steal focus to the first
              // empty slot and mouse selection wouldn't work (arrow keys only).
              if (status === "answering" && e.target === e.currentTarget) {
                const firstEmpty = inputWords.findIndex((w) => !w.trim());
                focusInputSlot(firstEmpty === -1 ? activeSlot : firstEmpty);
              }
            }}
            className="w-full flex flex-col items-center cursor-text mb-4"
          >
          {/* Audio output controls:
              C = play the Chinese prompt (always available)
              E = play the English answer (only revealed after Check) */}
          <div className="w-full flex items-center justify-end mb-3 max-w-5xl">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  play(exercise.sentence, sentenceLang);
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lingo-blue text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold"
                aria-label="Play Chinese audio"
                title="Chinese audio"
              >
                C
              </button>
              {status !== "answering" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    play(bestMatchAnswer, "en");
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lingo-blue text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-0.5 transition-all text-xs font-bold"
                  aria-label="Play English audio"
                  title="English audio"
                >
                  E
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 lg:gap-4 w-full max-w-5xl">
            {analyzedWordList.map((item, idx) => {
              const targetWord = item.word;
              const typedWord = inputWords[idx] || "";
              const isSlotActive = activeSlot === idx;
              // Never default an unevaluated slot to "matched" — if the
              // indices array is ever shorter than the rendered slots again,
              // an ungraded word must read as wrong, not as a free green.
              const isWordMatched = matchedWordIndices[idx] === true;
              return (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl border-2 shadow-xs px-2 sm:px-3 lg:px-4 py-2 sm:py-3 flex flex-col items-center justify-start min-w-[62px] sm:min-w-[92px] lg:min-w-[100px] transition-all ${
                    status !== "answering"
                      ? isWordMatched
                        ? "border-emerald-200 bg-emerald-50/20"
                        : "border-red-200 bg-red-50/20"
                      : isSlotActive
                      ? "border-[#007a55] shadow-sm ring-2 ring-[#007a55]/20"
                      : "border-blue-100/80 hover:border-blue-200"
                  }`}
                >
                  {/* After Check: for an UNMATCHED slot only, show the
                      canonical correct word ABOVE the input line.
                      Accepted synonyms are deliberately NOT shown here — they
                      are rendered BELOW the answer boxes (see the "also
                      accepted" row in the lower info stack). */}
                  {status !== "answering" && !isWordMatched && (
                    <div className="flex flex-col items-center justify-center mb-1 sm:mb-1.5">
                      <span
                        style={{ minWidth: `${Math.max(3, targetWord.length)}ch` }}
                        className="text-center font-serif text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-emerald-700"
                      >
                        {targetWord}
                      </span>
                    </div>
                  )}
                  {/* Input line (always in its position, just below the green
                      correct-answer when present; no grey separator anywhere). */}
                  <div className="flex flex-col items-center justify-center my-1 sm:my-1.5 min-h-[2.25rem] sm:min-h-[3rem]">
                    {status === "answering" ? (
                      <input
                        id={`word-input-${idx}`}
                        ref={(el: HTMLInputElement | null) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        autoFocus={idx === 0}
                        value={typedWord}
                        onFocus={() => setActiveSlot(idx)}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.includes(" ")) {
                            // The user pasted a whole sentence, or a space
                            // slipped through the keydown handler, or an IME/
                            // autocorrect inserted a space. Split into words
                            // and DISTRIBUTE them across this slot and the
                            // following ones — do NOT concatenate them into a
                            // single slot. The old behaviour stripped the
                            // spaces and jammed every word into one slot while
                            // leaving the rest empty, so a perfectly correct
                            // answer could score as low as 5/8.
                            const words = val
                              .split(/\s+/)
                              .map((w) => w.trim())
                              .filter(Boolean);
                            if (words.length === 0) return;
                            const next = [...inputWords];
                            let slot = idx;
                            for (const w of words) {
                              if (slot >= rawAnswerTokens.length) break;
                              next[slot] = w;
                              slot++;
                            }
                            setInputWords(next);
                            const lastFilled = Math.min(slot - 1, rawAnswerTokens.length - 1);
                            const nextFocus = Math.min(slot, rawAnswerTokens.length - 1);
                            // Keep the cursor moving forward while slots remain,
                            // otherwise park it on the final filled slot.
                            focusInputSlot(slot < rawAnswerTokens.length ? nextFocus : lastFilled);
                            return;
                          }
                          const next = [...inputWords];
                          next[idx] = val;
                          setInputWords(next);
                        }}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleNavigation(idx, e)}
                        disabled={status !== "answering"}
                        style={{ width: `${Math.max(3, targetWord.length + 1)}ch` }}
                        className={`text-center font-serif text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-gray-900 bg-transparent focus:outline-none pb-0.5 min-w-[2rem] sm:min-w-[2.5rem] lg:min-w-[3rem] transition-all border-b-2 ${
                          isSlotActive
                            ? "border-[#007a55] border-b-[3px] shadow-[0_2px_0_0_#007a55]"
                            : "border-[#007a55]/60 hover:border-[#007a55]"
                        }`}
                      />
                    ) : (
                      <div className="flex flex-col items-center">
                        <span
                          style={{ minWidth: `${Math.max(3, Math.max(targetWord.length, typedWord.length))}ch` }}
                          className={`text-center font-serif text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight pb-0.5 border-b-2 ${
                            isWordMatched
                              ? "text-emerald-700 border-emerald-500 bg-emerald-50/30"
                              : "text-red-600 border-red-500 bg-red-50/30"
                          }`}
                        >
                          {typedWord || "(empty)"}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Below the input line — reveal in order:
                      1st row: colorful oval POS badge (always shown, even while typing)
                      2nd row: Chinese meaning (after Check, both matched/unmatched)
                      3rd row: IPA (after Check, both matched/unmatched)
                      4th row: "also:" accepted synonyms (after Check)
                      The grey separator (border-t border-gray-100) is removed. */}
                  <div className="flex flex-col items-center justify-center mt-1 sm:mt-2 w-full space-y-1 sm:space-y-1.5">
                    {/* POS badge — always visible while typing so the user has a hint
                        of which part-of-speech each slot expects (e.g. 代词 / 动词 / 名词). */}
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
                    {status !== "answering" && (
                      <>
                        {/* Chinese meaning */}
                        {item.meaning && (
                          <div className="text-xs sm:text-sm lg:text-base text-gray-800 text-center font-semibold">
                            {item.meaning}
                          </div>
                        )}
                        {/* IPA */}
                        {item.ipa && (
                          <div className="text-[10px] sm:text-xs lg:text-sm text-gray-500 font-mono text-center">
                            {item.ipa}
                          </div>
                        )}
                        {/* Also-accepted synonyms — shown BELOW the answer
                            boxes (user request). For a matched slot it tells
                            the learner "you weren't wrong, these count too";
                            for a wrong slot it hints at valid alternatives
                            without cluttering the area above the input. */}
                        {(() => {
                          const typed = (typedWord || "").toLowerCase().trim();
                          const syns = synonymsOf(targetWord)
                            .filter((s) => s.toLowerCase() !== typed)
                            .slice(0, 3);
                          if (syns.length === 0) return null;
                          return (
                            <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 pt-0.5">
                              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                also:
                              </span>
                              {syns.map((s, si) => (
                                <span
                                  key={si}
                                  className="text-center font-serif text-xs sm:text-sm lg:text-base font-bold tracking-tight text-emerald-600"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Matching rate card (themed red/green) + alternative answers card (blue)
              below the grid — shrink-wrapped to their own content width */}
          {status !== "answering" && (
            <div className="mx-auto mt-6 space-y-3 inline-flex flex-col items-stretch">
              {/* Matching rate — theme red if <80%, green if >=80% */}
              {matchDetail && (
                <div
                  className={`p-3 sm:p-4 rounded-2xl border-2 shadow-sm ${
                    typeof similarityScore === "number" && similarityScore < 0.8
                      ? "bg-red-50/40 border-red-200"
                      : "bg-emerald-50/40 border-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-sm sm:text-base font-bold whitespace-nowrap">
                    <span className="text-gray-800">MATCH:</span>
                    <span
                      className={
                        typeof similarityScore === "number" && similarityScore < 0.8
                          ? "text-red-600"
                          : "text-emerald-600"
                      }
                    >
                      {matchDetail}
                    </span>
                  </div>
                </div>
              )}
              {/* Alternative answers — blue separate card. Each alt uses the
                  same bold blue color as the title so the two visually match. */}
              {orderedAnswers.length > 1 && (
                <div className="p-3 sm:p-4 bg-blue-50/40 border-2 border-blue-200 rounded-2xl shadow-sm space-y-1">
                  <span className="block text-xs font-bold text-blue-700 uppercase tracking-wider">
                    ALTERNATIVE ANSWERS:
                  </span>
                  {orderedAnswers.slice(1).map((alt, aIdx) => (
                    <div
                      key={aIdx}
                      className="text-sm sm:text-base font-bold text-blue-700"
                    >
                      {alt}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
        </ExerciseShell>
  );
}
