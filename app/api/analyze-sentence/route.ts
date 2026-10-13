import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface WordItem {
  word: string;
  ipa: string;
  meaning: string;
  pos: string;
}

interface SyntacticChunk {
  chunkLabel: string;
  words: WordItem[];
}

interface DictLookupEntry {
  ipa: string;
  meaning: string;
  pos: string;
}

// Cached in-memory dictionary map so lookups take <1ms per sentence
let cachedDictMap: Map<string, DictLookupEntry> | null = null;

const BUILTIN_WORD_OVERRIDES: Record<string, DictLookupEntry> = {
  i: { ipa: "/aɪ/", meaning: "我", pos: "pronoun" },
  you: { ipa: "/juː/", meaning: "你/你们", pos: "pronoun" },
  he: { ipa: "/hiː/", meaning: "他", pos: "pronoun" },
  she: { ipa: "/ʃiː/", meaning: "她", pos: "pronoun" },
  it: { ipa: "/ɪt/", meaning: "它", pos: "pronoun" },
  we: { ipa: "/wiː/", meaning: "我们", pos: "pronoun" },
  they: { ipa: "/ðeɪ/", meaning: "他们", pos: "pronoun" },
  me: { ipa: "/miː/", meaning: "我", pos: "pronoun" },
  him: { ipa: "/hɪm/", meaning: "他", pos: "pronoun" },
  her: { ipa: "/hɜːr/", meaning: "她/她的", pos: "pronoun" },
  us: { ipa: "/ʌs/", meaning: "我们", pos: "pronoun" },
  them: { ipa: "/ðɛm/", meaning: "他们", pos: "pronoun" },
  my: { ipa: "/maɪ/", meaning: "我的", pos: "determiner" },
  your: { ipa: "/jɔːr/", meaning: "你的", pos: "determiner" },
  his: { ipa: "/hɪz/", meaning: "他的", pos: "determiner" },
  our: { ipa: "/aʊər/", meaning: "我们的", pos: "determiner" },
  their: { ipa: "/ðɛər/", meaning: "他们的", pos: "determiner" },
  this: { ipa: "/ðɪs/", meaning: "这个", pos: "determiner" },
  that: { ipa: "/ðæt/", meaning: "那个", pos: "determiner" },
  these: { ipa: "/ðiːz/", meaning: "这些", pos: "determiner" },
  those: { ipa: "/ðoʊz/", meaning: "那些", pos: "determiner" },
  a: { ipa: "/ə/", meaning: "一个", pos: "determiner" },
  an: { ipa: "/æn/", meaning: "一个", pos: "determiner" },
  the: { ipa: "/ðə/", meaning: "这/那", pos: "determiner" },
  every: { ipa: "/ˈɛvri/", meaning: "每个", pos: "determiner" },
  all: { ipa: "/ɔːl/", meaning: "所有", pos: "determiner" },
  some: { ipa: "/sʌm/", meaning: "一些", pos: "determiner" },
  any: { ipa: "/ˈɛni/", meaning: "任何", pos: "determiner" },
  many: { ipa: "/ˈmɛni/", meaning: "许多", pos: "determiner" },
  most: { ipa: "/moʊst/", meaning: "大多数", pos: "determiner" },
  no: { ipa: "/noʊ/", meaning: "没有", pos: "determiner" },
  am: { ipa: "/æm/", meaning: "是", pos: "verb" },
  is: { ipa: "/ɪz/", meaning: "是", pos: "verb" },
  are: { ipa: "/ɑːr/", meaning: "是", pos: "verb" },
  was: { ipa: "/wɒz/", meaning: "是(过去)", pos: "verb" },
  were: { ipa: "/wɜːr/", meaning: "是(过去)", pos: "verb" },
  be: { ipa: "/biː/", meaning: "是/成为", pos: "verb" },
  been: { ipa: "/bɪn/", meaning: "是(分词)", pos: "verb" },
  have: { ipa: "/hæv/", meaning: "有/吃", pos: "verb" },
  has: { ipa: "/hæz/", meaning: "有", pos: "verb" },
  had: { ipa: "/hæd/", meaning: "有(过去)", pos: "verb" },
  do: { ipa: "/duː/", meaning: "做", pos: "verb" },
  does: { ipa: "/dʌz/", meaning: "做", pos: "verb" },
  did: { ipa: "/dɪd/", meaning: "做(过去)", pos: "verb" },
  can: { ipa: "/kæn/", meaning: "能/可以", pos: "modal" },
  could: { ipa: "/kʊd/", meaning: "能够", pos: "modal" },
  will: { ipa: "/wɪl/", meaning: "将会", pos: "modal" },
  would: { ipa: "/wʊd/", meaning: "想要/会", pos: "modal" },
  should: { ipa: "/ʃʊd/", meaning: "应该", pos: "modal" },
  must: { ipa: "/mʌst/", meaning: "必须", pos: "modal" },
  may: { ipa: "/meɪ/", meaning: "可以/可能", pos: "modal" },
  might: { ipa: "/maɪt/", meaning: "可能", pos: "modal" },
  to: { ipa: "/tuː/", meaning: "去/向", pos: "preposition" },
  in: { ipa: "/ɪn/", meaning: "在…里", pos: "preposition" },
  on: { ipa: "/ɒn/", meaning: "在…上", pos: "preposition" },
  at: { ipa: "/æt/", meaning: "在", pos: "preposition" },
  for: { ipa: "/fɔːr/", meaning: "为了/去", pos: "preposition" },
  with: { ipa: "/wɪð/", meaning: "和…一起", pos: "preposition" },
  from: { ipa: "/frɒm/", meaning: "从", pos: "preposition" },
  by: { ipa: "/baɪ/", meaning: "通过/在…旁", pos: "preposition" },
  about: { ipa: "/əˈbaʊt/", meaning: "关于/大约", pos: "preposition" },
  around: { ipa: "/əˈraʊnd/", meaning: "大约/在周围", pos: "preposition" },
  after: { ipa: "/ˈæftər/", meaning: "在…之后", pos: "preposition" },
  before: { ipa: "/bɪˈfɔːr/", meaning: "在…之前", pos: "preposition" },
  during: { ipa: "/ˈdjʊərɪŋ/", meaning: "在…期间", pos: "preposition" },
  near: { ipa: "/nɪər/", meaning: "在…附近", pos: "preposition" },
  into: { ipa: "/ˈɪntuː/", meaning: "进入", pos: "preposition" },
  of: { ipa: "/ɒv/", meaning: "…的", pos: "preposition" },
  and: { ipa: "/ænd/", meaning: "和/然后", pos: "conjunction" },
  but: { ipa: "/bʌt/", meaning: "但是", pos: "conjunction" },
  or: { ipa: "/ɔːr/", meaning: "或者", pos: "conjunction" },
  because: { ipa: "/bɪˈkɒz/", meaning: "因为", pos: "conjunction" },
  since: { ipa: "/sɪns/", meaning: "因为/自从", pos: "conjunction" },
  if: { ipa: "/ɪf/", meaning: "如果", pos: "conjunction" },
  when: { ipa: "/wɛn/", meaning: "当…时", pos: "conjunction" },
  although: { ipa: "/ɔːlˈðoʊ/", meaning: "虽然", pos: "conjunction" },
  how: { ipa: "/haʊ/", meaning: "如何/怎么", pos: "adverb" },
  where: { ipa: "/wɛər/", meaning: "在哪里", pos: "adverb" },
  usually: { ipa: "/ˈjuːʒuəli/", meaning: "通常", pos: "adverb" },
  normally: { ipa: "/ˈnɔːrməli/", meaning: "通常", pos: "adverb" },
  always: { ipa: "/ˈɔːlweɪz/", meaning: "总是", pos: "adverb" },
  often: { ipa: "/ˈɒfən/", meaning: "经常", pos: "adverb" },
  sometimes: { ipa: "/ˈsʌmtaɪmz/", meaning: "有时", pos: "adverb" },
  never: { ipa: "/ˈnɛvər/", meaning: "从不", pos: "adverb" },
  still: { ipa: "/stɪl/", meaning: "仍然", pos: "adverb" },
  then: { ipa: "/ðɛn/", meaning: "然后", pos: "adverb" },
  very: { ipa: "/ˈvɛri/", meaning: "非常", pos: "adverb" },
  so: { ipa: "/soʊ/", meaning: "如此/所以", pos: "adverb" },
  also: { ipa: "/ˈɔːlsoʊ/", meaning: "也", pos: "adverb" },
  first: { ipa: "/fɜːrst/", meaning: "首先/第一", pos: "adverb" },
  there: { ipa: "/ðɛər/", meaning: "那里", pos: "adverb" },
  here: { ipa: "/hɪər/", meaning: "这里", pos: "adverb" },
  outside: { ipa: "/ˌaʊtˈsaɪd/", meaning: "在外面", pos: "adverb" },
  today: { ipa: "/təˈdeɪ/", meaning: "今天", pos: "adverb" },
  yesterday: { ipa: "/ˈjɛstərdeɪ/", meaning: "昨天", pos: "adverb" },
  tomorrow: { ipa: "/təˈmɒroʊ/", meaning: "明天", pos: "adverb" },
  please: { ipa: "/pliːz/", meaning: "请", pos: "adverb" },
  "o'clock": { ipa: "/əˈklɒk/", meaning: "点钟", pos: "adverb" },
  seven: { ipa: "/ˈsɛvən/", meaning: "七/七点", pos: "numeral" },
  eight: { ipa: "/eɪt/", meaning: "八/八点", pos: "numeral" },
  nine: { ipa: "/naɪn/", meaning: "九/九点", pos: "numeral" },
  ten: { ipa: "/tɛn/", meaning: "十/十点", pos: "numeral" },
  leaves: { ipa: "/liːvz/", meaning: "离开", pos: "verb" },
  goes: { ipa: "/ɡoʊz/", meaning: "去", pos: "verb" },
  visits: { ipa: "/ˈvɪzɪts/", meaning: "参观/去", pos: "verb" },
  reads: { ipa: "/riːdz/", meaning: "阅读", pos: "verb" },
  prepares: { ipa: "/prɪˈpɛərz/", meaning: "准备", pos: "verb" },
  cooks: { ipa: "/kʊks/", meaning: "烹饪", pos: "verb" },
  makes: { ipa: "/meɪks/", meaning: "制作", pos: "verb" },
  wants: { ipa: "/wɒnts/", meaning: "想要", pos: "verb" },
  decided: { ipa: "/dɪˈsaɪdɪd/", meaning: "决定", pos: "verb" },
  learned: { ipa: "/lɜːrnd/", meaning: "学会了", pos: "verb" },
  knew: { ipa: "/njuː/", meaning: "知道", pos: "verb" },
  listening: { ipa: "/ˈlɪsənɪŋ/", meaning: "听", pos: "verb" },
  walking: { ipa: "/ˈwɔːkɪŋ/", meaning: "散步", pos: "verb" },
  breathing: { ipa: "/ˈbriːðɪŋ/", meaning: "呼吸", pos: "verb" },
  playing: { ipa: "/ˈpleɪɪŋ/", meaning: "玩", pos: "verb" },
  finishing: { ipa: "/ˈfɪnɪʃɪŋ/", meaning: "结束", pos: "verb" },
  leaving: { ipa: "/ˈliːvɪŋ/", meaning: "离开", pos: "verb" },
  reading: { ipa: "/ˈriːdɪŋ/", meaning: "阅读", pos: "noun" },
  morning: { ipa: "/ˈmɔːrnɪŋ/", meaning: "早上", pos: "noun" },
  afternoon: { ipa: "/ˌæftərˈnuːn/", meaning: "下午", pos: "noun" },
  evening: { ipa: "/ˈiːvnɪŋ/", meaning: "晚上", pos: "noun" },
  night: { ipa: "/naɪt/", meaning: "夜晚", pos: "noun" },
  weekend: { ipa: "/ˈwiːkɛnd/", meaning: "周末", pos: "noun" },
  weekends: { ipa: "/ˈwiːkɛndz/", meaning: "周末", pos: "noun" },
  breakfast: { ipa: "/ˈbrɛkfəst/", meaning: "早餐", pos: "noun" },
  dinner: { ipa: "/ˈdɪnər/", meaning: "晚餐", pos: "noun" },
  home: { ipa: "/hoʊm/", meaning: "家", pos: "noun" },
  house: { ipa: "/haʊs/", meaning: "房子/家", pos: "noun" },
  work: { ipa: "/wɜːrk/", meaning: "工作/上班", pos: "noun" },
  school: { ipa: "/skuːl/", meaning: "学校", pos: "noun" },
  park: { ipa: "/pɑːrk/", meaning: "公园", pos: "noun" },
  library: { ipa: "/ˈlaɪbrəri/", meaning: "图书馆", pos: "noun" },
  books: { ipa: "/bʊks/", meaning: "书", pos: "noun" },
  children: { ipa: "/ˈtʃɪldrən/", meaning: "孩子们", pos: "noun" },
  kids: { ipa: "/kɪdz/", meaning: "孩子们", pos: "noun" },
  games: { ipa: "/ɡeɪmz/", meaning: "游戏", pos: "noun" },
  friends: { ipa: "/frɛndz/", meaning: "朋友们", pos: "noun" },
  mother: { ipa: "/ˈmʌðər/", meaning: "母亲", pos: "noun" },
  mom: { ipa: "/mɒm/", meaning: "妈妈", pos: "noun" },
  family: { ipa: "/ˈfæməli/", meaning: "家人", pos: "noun" },
  bed: { ipa: "/bɛd/", meaning: "床", pos: "noun" },
  room: { ipa: "/ruːm/", meaning: "房间", pos: "noun" },
  bedroom: { ipa: "/ˈbɛdruːm/", meaning: "卧室", pos: "noun" },
  music: { ipa: "/ˈmjuːzɪk/", meaning: "音乐", pos: "noun" },
  air: { ipa: "/ɛər/", meaning: "空气", pos: "noun" },
  walk: { ipa: "/wɔːk/", meaning: "散步", pos: "noun" },
};

function cleanShortZhMeaning(rawDef?: string): string {
  if (!rawDef) return "";
  const parts = rawDef.split(/[；;]/).map((s) => s.trim());
  for (const p of parts) {
    const clean = p
      .replace(/^[a-z]+\.\s*/i, "")
      .split(/[,，、/]/)[0]
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/（.*?）/g, "")
      .trim();
    if (clean && /[\u4e00-\u9fa5]/.test(clean)) {
      return clean.slice(0, 6);
    }
  }
  return "";
}

function getDictionaryMap(): Map<string, DictLookupEntry> {
  if (cachedDictMap) return cachedDictMap;
  const map = new Map<string, DictLookupEntry>();

  try {
    const filePath = path.join(process.cwd(), "words", "english_merged.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const w = String(item.word || "").toLowerCase().trim();
        if (!w) continue;
        const meaning = cleanShortZhMeaning(item.definition_zh);
        const ipa = item.ipa ? `/${String(item.ipa).replace(/^\/|\/$/g, "")}/` : "";
        const pos = String(item.pos || "noun").toLowerCase().trim();
        if (meaning) {
          map.set(w, { ipa, meaning, pos });
        }
      }
    }
  } catch {}

  for (const [k, v] of Object.entries(BUILTIN_WORD_OVERRIDES)) {
    const existing = map.get(k);
    map.set(k, {
      ipa: v.ipa || existing?.ipa || "",
      meaning: v.meaning || existing?.meaning || k,
      pos: v.pos || existing?.pos || "noun",
    });
  }

  cachedDictMap = map;
  return map;
}

function lookupWordInfo(rawToken: string): WordItem {
  const dict = getDictionaryMap();
  const displayWord = rawToken.trim();
  const clean = displayWord
    .toLowerCase()
    .replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");

  if (dict.has(clean)) {
    const entry = dict.get(clean)!;
    return { word: displayWord, ipa: entry.ipa, meaning: entry.meaning, pos: entry.pos };
  }

  // Try lemmatized base forms (plural -s, -es, -ies, verb -ed, -ing)
  const candidates: string[] = [];
  if (clean.endsWith("ies")) candidates.push(clean.slice(0, -3) + "y");
  if (clean.endsWith("es")) candidates.push(clean.slice(0, -2));
  if (clean.endsWith("s") && clean.length > 2) candidates.push(clean.slice(0, -1));
  if (clean.endsWith("ed")) {
    candidates.push(clean.slice(0, -2));
    candidates.push(clean.slice(0, -1));
  }
  if (clean.endsWith("ing")) {
    candidates.push(clean.slice(0, -3));
    candidates.push(clean.slice(0, -3) + "e");
  }

  for (const cand of candidates) {
    if (dict.has(cand)) {
      const entry = dict.get(cand)!;
      return { word: displayWord, ipa: entry.ipa, meaning: entry.meaning, pos: entry.pos };
    }
  }

  return {
    word: displayWord,
    ipa: "",
    meaning: clean || displayWord,
    pos: "noun",
  };
}

const PHRASAL_VERBS: Record<string, { ipa: string; meaning: string }> = {
  "get up": { ipa: "/ɡɛt ʌp/", meaning: "起床" },
  "wake up": { ipa: "/weɪk ʌp/", meaning: "醒来/起床" },
  "clean up": { ipa: "/kliːn ʌp/", meaning: "打扫干净" },
  "tidy up": { ipa: "/ˈtaɪdi ʌp/", meaning: "整理" },
  "meet up": { ipa: "/miːt ʌp/", meaning: "聚会/见面" },
  "get together": { ipa: "/ɡɛt təˈɡɛðər/", meaning: "相聚" },
  "go to": { ipa: "/ɡoʊ tuː/", meaning: "去" },
  "goes to": { ipa: "/ɡoʊz tuː/", meaning: "去" },
  "went to": { ipa: "/wɛnt tuː/", meaning: "去了" },
  "like to": { ipa: "/laɪk tuː/", meaning: "喜欢" },
  "want to": { ipa: "/wɒnt tuː/", meaning: "想要" },
  "would like to": { ipa: "/wʊd laɪk tuː/", meaning: "想要" },
  "plan to": { ipa: "/plæn tuː/", meaning: "打算" },
  "decided to": { ipa: "/dɪˈsaɪdɪd tuː/", meaning: "决定" },
  "decide to": { ipa: "/dɪˈsaɪd tuː/", meaning: "决定" },
  "learned to": { ipa: "/lɜːrnd tuː/", meaning: "学会" },
  "learned how to": { ipa: "/lɜːrnd haʊ tuː/", meaning: "学会如何" },
  "knew how to": { ipa: "/njuː haʊ tuː/", meaning: "知道如何" },
};

const PREPOSITIONS = new Set([
  "in", "on", "at", "for", "with", "from", "by", "about", "around", "after",
  "before", "during", "near", "into", "under", "over", "between", "without", "through"
]);

const TIME_WORDS = new Set([
  "every", "morning", "afternoon", "evening", "night", "weekend", "weekends",
  "today", "yesterday", "tomorrow", "now", "daily", "nightly", "weekly",
  "seven", "eight", "nine", "ten", "o'clock"
]);

const FREQ_ADVERBS = new Set([
  "usually", "normally", "always", "often", "sometimes", "never", "generally", "still", "first"
]);

const CONJUNCTIONS = new Set([
  "and", "but", "or", "because", "since", "if", "when", "although"
]);

const PRONOUN_SUBJECTS = new Set([
  "i", "you", "he", "she", "it", "we", "they"
]);

const DETERMINERS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "my", "your", "his", "her", "our", "their", "many", "most", "some", "any", "all"
]);

const AUX_AND_MODALS = new Set([
  "can", "could", "will", "would", "should", "must", "may", "might", "do", "does", "did", "am", "is", "are", "was", "were", "have", "has", "had"
]);

function buildSyntacticAnalysis(sentence: string): { fullTranslation: string; chunks: SyntacticChunk[] } {
  const cleanedSentence = (sentence || "").trim();
  if (!cleanedSentence) {
    return { fullTranslation: "", chunks: [] };
  }

  const rawTokens = cleanedSentence.split(/\s+/).filter(Boolean);
  const words: WordItem[] = [];

  // Keep each space-separated token as an individual word item so slots match 1-to-1
  let idx = 0;
  while (idx < rawTokens.length) {
    const t1 = rawTokens[idx].toLowerCase().replace(/[.,!?;:]+$/g, "");
    const t2 = idx + 1 < rawTokens.length ? rawTokens[idx + 1].toLowerCase().replace(/[.,!?;:]+$/g, "") : "";
    const twoKey = `${t1} ${t2}`;

    if (t2 && PHRASAL_VERBS[twoKey]) {
      // Provide individual items for both words
      const pv = PHRASAL_VERBS[twoKey];
      const info1 = lookupWordInfo(rawTokens[idx]);
      const info2 = lookupWordInfo(rawTokens[idx + 1]);
      words.push({
        word: rawTokens[idx],
        ipa: info1.ipa || pv.ipa.split(" ")[0] || "",
        meaning: pv.meaning || info1.meaning,
        pos: "verb",
      });
      words.push({
        word: rawTokens[idx + 1],
        ipa: info2.ipa || pv.ipa.split(" ")[1] || "",
        meaning: info2.meaning || "起来",
        pos: "verb",
      });
      idx += 2;
      continue;
    }

    words.push(lookupWordInfo(rawTokens[idx]));
    idx++;
  }

  // Group words into grammatical chunks (主语, 谓语, 宾语, 状语, 连词)
  const chunks: SyntacticChunk[] = [];
  let hasSeenSubject = false;
  let hasSeenMainVerb = false;

  function pushToChunk(label: string, item: WordItem) {
    const last = chunks[chunks.length - 1];
    if (last && last.chunkLabel === label && last.words.length < 4) {
      last.words.push(item);
    } else {
      chunks.push({ chunkLabel: label, words: [item] });
    }
  }

  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const cleanLower = w.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");

    // 1. Conjunctions ("and", "because", "if", "although", "when")
    if (CONJUNCTIONS.has(cleanLower)) {
      if (cleanLower === "and" && i + 1 < words.length && words[i + 1].word.toLowerCase().replace(/[.,!?;:]+$/g, "") === "then") {
        chunks.push({ chunkLabel: "状语", words: [w, words[i + 1]] });
        hasSeenMainVerb = false;
        i += 2;
        continue;
      }
      pushToChunk("连词", w);
      if (cleanLower === "because" || cleanLower === "since" || cleanLower === "if" || cleanLower === "when" || cleanLower === "although") {
        hasSeenSubject = false;
        hasSeenMainVerb = false;
      }
      i++;
      continue;
    }

    // 2. Prepositional phrase or time adverbial ("at eight o'clock", "in the evening", "for work", "on weekends")
    if (PREPOSITIONS.has(cleanLower) || TIME_WORDS.has(cleanLower)) {
      const advWords: WordItem[] = [w];
      i++;
      while (i < words.length && advWords.length < 4) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
        if (CONJUNCTIONS.has(nextClean) || nextW.pos === "verb" || AUX_AND_MODALS.has(nextClean) || PRONOUN_SUBJECTS.has(nextClean)) {
          break;
        }
        advWords.push(nextW);
        if (/[.,!?;:]$/.test(nextW.word)) {
          i++;
          break;
        }
        i++;
      }
      chunks.push({ chunkLabel: "状语", words: advWords });
      continue;
    }

    // 3. Frequency or manner adverbs ("usually", "always", "carefully", "quickly", "please")
    if (FREQ_ADVERBS.has(cleanLower) || w.pos === "adverb") {
      pushToChunk("状语", w);
      i++;
      continue;
    }

    // 4. Subject (Pronoun or Determiner + Adj + Noun before main verb)
    if (!hasSeenSubject && (PRONOUN_SUBJECTS.has(cleanLower) || DETERMINERS.has(cleanLower) || w.pos === "noun" || w.pos === "pronoun")) {
      const subjWords: WordItem[] = [w];
      i++;
      if (!PRONOUN_SUBJECTS.has(cleanLower)) {
        while (i < words.length && subjWords.length < 3) {
          const nextW = words[i];
          const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
          if (
            nextW.pos === "verb" ||
            AUX_AND_MODALS.has(nextClean) ||
            FREQ_ADVERBS.has(nextClean) ||
            PREPOSITIONS.has(nextClean) ||
            CONJUNCTIONS.has(nextClean)
          ) {
            break;
          }
          subjWords.push(nextW);
          i++;
          if (nextW.pos === "noun") break;
        }
      }
      chunks.push({ chunkLabel: "主语", words: subjWords });
      hasSeenSubject = true;
      continue;
    }

    // 5. Predicate / Verb phrase (Aux/Modal + Verb, or Verb)
    if (w.pos === "verb" || AUX_AND_MODALS.has(cleanLower)) {
      const verbWords: WordItem[] = [w];
      i++;
      while (i < words.length && verbWords.length < 3) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
        if (nextW.pos === "verb" || nextClean === "to" || nextClean === "up" || nextClean === "out") {
          verbWords.push(nextW);
          i++;
        } else {
          break;
        }
      }
      chunks.push({ chunkLabel: "谓语", words: verbWords });
      hasSeenSubject = true;
      hasSeenMainVerb = true;
      continue;
    }

    // 6. Object / Complement (after main verb)
    if (hasSeenMainVerb) {
      const objWords: WordItem[] = [w];
      i++;
      while (i < words.length && objWords.length < 4) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
        if (
          PREPOSITIONS.has(nextClean) ||
          TIME_WORDS.has(nextClean) ||
          CONJUNCTIONS.has(nextClean) ||
          FREQ_ADVERBS.has(nextClean) ||
          nextW.pos === "adverb" ||
          nextW.pos === "verb"
        ) {
          break;
        }
        objWords.push(nextW);
        i++;
        if (nextW.pos === "noun") break;
      }
      chunks.push({ chunkLabel: "宾语", words: objWords });
      continue;
    }

    // Default fallback role
    pushToChunk(hasSeenSubject ? "宾语" : "主语", w);
    hasSeenSubject = true;
    i++;
  }

  return {
    fullTranslation: cleanedSentence,
    chunks,
  };
}

export async function POST(req: NextRequest) {
  let sentence = "";
  try {
    const body = await req.json();
    sentence = body.sentence || "";
    if (!sentence) {
      return NextResponse.json({ error: "Missing sentence" }, { status: 400 });
    }

    const fallback = buildSyntacticAnalysis(sentence);
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(fallback);
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analyze the following English sentence ("${sentence}") into syntactic chunks (such as 主语, 谓语, 宾语, 状语, 定语, 连词).

CRITICAL INSTRUCTIONS:
1. The 'word' property MUST be each individual single English word from the input sentence (NEVER combine multiple words like 'wake up' into one item; each space-separated token must be its own item). DO NOT put Chinese characters in the 'word' field.
2. The 'meaning' property MUST be the concise Chinese meaning (1-4 Chinese characters) of that English word in context. NEVER put the English word as the 'meaning'.
3. The 'ipa' property MUST be the IPA pronunciation wrapped in slashes (e.g. "/ʃiː/").
4. The 'pos' property should be the part of speech in Chinese (e.g. "代词", "动词", "副词", "介词", "数词", "名词", "形容词").
5. The 'chunkLabel' MUST be one of: "主语", "谓语", "宾语", "状语", "定语", "补语", "连词".

Return ONLY valid JSON format without markdown code blocks:
{
  "fullTranslation": "...",
  "chunks": [
    {
      "chunkLabel": "主语",
      "words": [
        { "word": "She", "ipa": "/ʃiː/", "meaning": "她", "pos": "代词" }
      ]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const text = response.text?.trim() || "";
    const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(jsonStr);

    if (
      parsed &&
      Array.isArray(parsed.chunks) &&
      parsed.chunks.length > 0 &&
      !(parsed.chunks.length === 1 && parsed.chunks[0].chunkLabel === "句子")
    ) {
      return NextResponse.json(parsed);
    }
    return NextResponse.json(fallback);
  } catch {
    return NextResponse.json(buildSyntacticAnalysis(sentence));
  }
}

