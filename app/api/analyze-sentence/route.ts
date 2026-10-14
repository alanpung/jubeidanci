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
  i: { ipa: "/aɪ/", meaning: "我", pos: "代词" },
  you: { ipa: "/juː/", meaning: "你/你们", pos: "代词" },
  he: { ipa: "/hiː/", meaning: "他", pos: "代词" },
  she: { ipa: "/ʃiː/", meaning: "她", pos: "代词" },
  it: { ipa: "/ɪt/", meaning: "它", pos: "代词" },
  we: { ipa: "/wiː/", meaning: "我们", pos: "代词" },
  they: { ipa: "/ðeɪ/", meaning: "他们", pos: "代词" },
  me: { ipa: "/miː/", meaning: "我", pos: "代词" },
  him: { ipa: "/hɪm/", meaning: "他", pos: "代词" },
  her: { ipa: "/hɜːr/", meaning: "她/她的", pos: "代词" },
  us: { ipa: "/ʌs/", meaning: "我们", pos: "代词" },
  them: { ipa: "/ðɛm/", meaning: "他们", pos: "代词" },
  my: { ipa: "/maɪ/", meaning: "我的", pos: "限定词" },
  your: { ipa: "/jɔːr/", meaning: "你的", pos: "限定词" },
  his: { ipa: "/hɪz/", meaning: "他的", pos: "限定词" },
  our: { ipa: "/aʊər/", meaning: "我们的", pos: "限定词" },
  their: { ipa: "/ðɛər/", meaning: "他们的", pos: "限定词" },
  its: { ipa: "/ɪts/", meaning: "它的", pos: "限定词" },
  get: { ipa: "/ɡɛt/", meaning: "使得/得到", pos: "动词" },
  message: { ipa: "/ˈmɛs.ɪdʒ/", meaning: "消息", pos: "名词" },
  am: { ipa: "/æm/", meaning: "是", pos: "助动词" },
  is: { ipa: "/ɪz/", meaning: "是", pos: "助动词" },
  are: { ipa: "/ɑːr/", meaning: "是", pos: "助动词" },
  was: { ipa: "/wɒz/", meaning: "是(过去)", pos: "助动词" },
  were: { ipa: "/wɜːr/", meaning: "是(过去)", pos: "助动词" },
  be: { ipa: "/biː/", meaning: "是/成为", pos: "动词" },
  been: { ipa: "/bɪn/", meaning: "是(分词)", pos: "动词" },
  have: { ipa: "/hæv/", meaning: "有/已经", pos: "动词" },
  has: { ipa: "/hæz/", meaning: "有/已经", pos: "动词" },
  had: { ipa: "/hæd/", meaning: "有/已经", pos: "动词" },
  do: { ipa: "/duː/", meaning: "做/干", pos: "助动词" },
  does: { ipa: "/dʌz/", meaning: "做/干", pos: "助动词" },
  did: { ipa: "/dɪd/", meaning: "做/干", pos: "助动词" },
  can: { ipa: "/kæn/", meaning: "能/可以", pos: "助动词" },
  could: { ipa: "/kʊd/", meaning: "能够", pos: "助动词" },
  will: { ipa: "/wɪl/", meaning: "将会", pos: "助动词" },
  would: { ipa: "/wʊd/", meaning: "想要/会", pos: "助动词" },
  should: { ipa: "/ʃʊd/", meaning: "应该", pos: "助动词" },
  must: { ipa: "/mʌst/", meaning: "必须", pos: "助动词" },
  may: { ipa: "/meɪ/", meaning: "可以/可能", pos: "助动词" },
  might: { ipa: "/maɪt/", meaning: "可能", pos: "助动词" },
  to: { ipa: "/tuː/", meaning: "去/向", pos: "介词" },
  in: { ipa: "/ɪn/", meaning: "在…里", pos: "介词" },
  on: { ipa: "/ɒn/", meaning: "在…上", pos: "介词" },
  at: { ipa: "/æt/", meaning: "在", pos: "介词" },
  for: { ipa: "/fɔːr/", meaning: "为了/去", pos: "介词" },
  with: { ipa: "/wɪð/", meaning: "和…一起", pos: "介词" },
  from: { ipa: "/frɒm/", meaning: "从", pos: "介词" },
  by: { ipa: "/baɪ/", meaning: "通过/在…旁", pos: "介词" },
  about: { ipa: "/əˈbaʊt/", meaning: "关于/大约", pos: "介词" },
  around: { ipa: "/əˈraʊnd/", meaning: "大约/在周围", pos: "介词" },
  after: { ipa: "/ˈæftər/", meaning: "在…之后", pos: "介词" },
  before: { ipa: "/bɪˈfɔːr/", meaning: "在…之前", pos: "介词" },
  during: { ipa: "/ˈdjʊərɪŋ/", meaning: "在…期间", pos: "介词" },
  near: { ipa: "/nɪər/", meaning: "在…附近", pos: "介词" },
  into: { ipa: "/ˈɪntuː/", meaning: "进入", pos: "介词" },
  of: { ipa: "/ɒv/", meaning: "…的", pos: "介词" },
  and: { ipa: "/ænd/", meaning: "和/然后", pos: "连词" },
  but: { ipa: "/bʌt/", meaning: "但是", pos: "连词" },
  or: { ipa: "/ɔːr/", meaning: "或者", pos: "连词" },
  because: { ipa: "/bɪˈkɒz/", meaning: "因为", pos: "连词" },
  since: { ipa: "/sɪns/", meaning: "因为/自从", pos: "连词" },
  if: { ipa: "/ɪf/", meaning: "如果", pos: "连词" },
  when: { ipa: "/wɛn/", meaning: "当…时", pos: "连词" },
  although: { ipa: "/ɔːlˈðoʊ/", meaning: "虽然", pos: "连词" },
  how: { ipa: "/haʊ/", meaning: "如何/怎么", pos: "副词" },
  where: { ipa: "/wɛər/", meaning: "在哪里", pos: "副词" },
  usually: { ipa: "/ˈjuːʒuəli/", meaning: "通常", pos: "副词" },
  normally: { ipa: "/ˈnɔːrməli/", meaning: "通常", pos: "副词" },
  always: { ipa: "/ˈɔːlweɪz/", meaning: "总是", pos: "副词" },
  often: { ipa: "/ˈɒfən/", meaning: "经常", pos: "副词" },
  sometimes: { ipa: "/ˈsʌmtaɪmz/", meaning: "有时", pos: "副词" },
  never: { ipa: "/ˈnɛvər/", meaning: "从不", pos: "副词" },
  still: { ipa: "/stɪl/", meaning: "仍然", pos: "副词" },
  then: { ipa: "/ðɛn/", meaning: "然后", pos: "副词" },
  very: { ipa: "/ˈvɛri/", meaning: "非常", pos: "副词" },
  so: { ipa: "/soʊ/", meaning: "如此/所以", pos: "副词" },
  also: { ipa: "/ˈɔːlsoʊ/", meaning: "也", pos: "副词" },
  first: { ipa: "/fɜːrst/", meaning: "首先/第一", pos: "副词" },
  there: { ipa: "/ðɛər/", meaning: "那里", pos: "副词" },
  here: { ipa: "/hɪər/", meaning: "这里", pos: "副词" },
  outside: { ipa: "/ˌaʊtˈsaɪd/", meaning: "在外面", pos: "副词" },
  today: { ipa: "/təˈdeɪ/", meaning: "今天", pos: "副词" },
  yesterday: { ipa: "/ˈjɛstərdeɪ/", meaning: "昨天", pos: "副词" },
  tomorrow: { ipa: "/təˈmɒroʊ/", meaning: "明天", pos: "副词" },
  please: { ipa: "/pliːz/", meaning: "请", pos: "副词" },
  "o'clock": { ipa: "/əˈklɒk/", meaning: "点钟", pos: "副词" },
  seven: { ipa: "/ˈsɛvən/", meaning: "七/七点", pos: "数词" },
  eight: { ipa: "/eɪt/", meaning: "八/八点", pos: "数词" },
  nine: { ipa: "/naɪn/", meaning: "九/九点", pos: "数词" },
  ten: { ipa: "/tɛn/", meaning: "十/十点", pos: "数词" },
  leaves: { ipa: "/liːvz/", meaning: "离开", pos: "动词" },
  goes: { ipa: "/ɡoʊz/", meaning: "去", pos: "动词" },
  visits: { ipa: "/ˈvɪzɪts/", meaning: "参观/去", pos: "动词" },
  reads: { ipa: "/riːdz/", meaning: "阅读", pos: "动词" },
  prepares: { ipa: "/prɪˈpɛərz/", meaning: "准备", pos: "动词" },
  cooks: { ipa: "/kʊks/", meaning: "烹饪", pos: "动词" },
  makes: { ipa: "/meɪks/", meaning: "制作", pos: "动词" },
  wants: { ipa: "/wɒnts/", meaning: "想要", pos: "动词" },
  decided: { ipa: "/dɪˈsaɪdɪd/", meaning: "决定", pos: "动词" },
  learned: { ipa: "/lɜːrnd/", meaning: "学会了", pos: "动词" },
  knew: { ipa: "/njuː/", meaning: "知道", pos: "动词" },
  listening: { ipa: "/ˈlɪsənɪŋ/", meaning: "听", pos: "动词" },
  walking: { ipa: "/ˈwɔːkɪŋ/", meaning: "散步", pos: "动词" },
  breathing: { ipa: "/ˈbriːðɪŋ/", meaning: "呼吸", pos: "动词" },
  playing: { ipa: "/ˈpleɪɪŋ/", meaning: "玩", pos: "动词" },
  finishing: { ipa: "/ˈfɪnɪʃɪŋ/", meaning: "结束", pos: "动词" },
  leaving: { ipa: "/ˈliːvɪŋ/", meaning: "离开", pos: "动词" },
  reading: { ipa: "/ˈriːdɪŋ/", meaning: "阅读", pos: "名词" },
  morning: { ipa: "/ˈmɔːrnɪŋ/", meaning: "早上", pos: "名词" },
  afternoon: { ipa: "/ˌæftərˈnuːn/", meaning: "下午", pos: "名词" },
  evening: { ipa: "/ˈiːvnɪŋ/", meaning: "晚上", pos: "名词" },
  night: { ipa: "/naɪt/", meaning: "夜晚", pos: "名词" },
  weekend: { ipa: "/ˈwiːkɛnd/", meaning: "周末", pos: "名词" },
  weekends: { ipa: "/ˈwiːkɛndz/", meaning: "周末", pos: "名词" },
  breakfast: { ipa: "/ˈbrɛkfəst/", meaning: "早餐", pos: "名词" },
  dinner: { ipa: "/ˈdɪnər/", meaning: "晚餐", pos: "名词" },
  home: { ipa: "/hoʊm/", meaning: "家", pos: "名词" },
  house: { ipa: "/haʊs/", meaning: "房子/家", pos: "名词" },
  work: { ipa: "/wɜːrk/", meaning: "工作/上班", pos: "名词" },
  school: { ipa: "/skuːl/", meaning: "学校", pos: "名词" },
  park: { ipa: "/pɑːrk/", meaning: "公园", pos: "名词" },
  library: { ipa: "/ˈlaɪbrəri/", meaning: "图书馆", pos: "名词" },
  books: { ipa: "/bʊks/", meaning: "书", pos: "名词" },
  children: { ipa: "/ˈtʃɪldrən/", meaning: "孩子们", pos: "名词" },
  kids: { ipa: "/kɪdz/", meaning: "孩子们", pos: "名词" },
  games: { ipa: "/ɡeɪmz/", meaning: "游戏", pos: "名词" },
  friends: { ipa: "/frɛndz/", meaning: "朋友们", pos: "名词" },
  mother: { ipa: "/ˈmʌðər/", meaning: "母亲", pos: "名词" },
  mom: { ipa: "/mɒm/", meaning: "妈妈", pos: "名词" },
  family: { ipa: "/ˈfæməli/", meaning: "家人", pos: "名词" },
  bed: { ipa: "/bɛd/", meaning: "床", pos: "名词" },
  room: { ipa: "/ruːm/", meaning: "房间", pos: "名词" },
  bedroom: { ipa: "/ˈbɛdruːm/", meaning: "卧室", pos: "名词" },
  music: { ipa: "/ˈmjuːzɪk/", meaning: "音乐", pos: "名词" },
  air: { ipa: "/ɛər/", meaning: "空气", pos: "名词" },
  walk: { ipa: "/wɔːk/", meaning: "散步", pos: "名词" },
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
        const rawPos = String(item.pos || "noun").toLowerCase().trim();
        let pos = "名词";
        if (rawPos.includes("verb") || rawPos === "v") pos = "动词";
        else if (rawPos.includes("noun") || rawPos === "n") pos = "名词";
        else if (rawPos.includes("adj") || rawPos === "a") pos = "形容词";
        else if (rawPos.includes("adv") || rawPos === "r") pos = "副词";
        else if (rawPos.includes("prep") || rawPos === "p") pos = "介词";
        else if (rawPos.includes("conj") || rawPos === "c") pos = "连词";
        else if (rawPos.includes("pron") || rawPos === "pronoun") pos = "代词";
        else if (rawPos.includes("det")) pos = "限定词";
        else if (rawPos.includes("num")) pos = "数词";
        else if (rawPos.includes("aux")) pos = "助动词";
        
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

function buildSyntacticAnalysis(sentence: string): { fullTranslation: string; acceptableTranslations: string[]; chunks: SyntacticChunk[] } {
  const cleanedSentence = (sentence || "").trim();
  if (!cleanedSentence) {
    return { fullTranslation: "", acceptableTranslations: [], chunks: [] };
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

  // Generate natural rule-based acceptable translations for fallback
  const acceptableTranslations: string[] = [];
  const addAlt = (str: string) => {
    const s = str.trim();
    if (s && s.toLowerCase() !== cleanedSentence.toLowerCase() && !acceptableTranslations.some((a) => a.toLowerCase() === s.toLowerCase())) {
      acceptableTranslations.push(s);
    }
  };

  const core = cleanedSentence.replace(/[.!?]$/, "").trim();
  const punct = cleanedSentence.match(/[.!?]$/)?.[0] || ".";

  if (/\bwant to eat\b/i.test(core)) {
    addAlt(core.replace(/\bwant to eat\b/i, "would like to eat") + punct);
    addAlt(core.replace(/\bwant to eat\b/i, "want to have") + punct);
  } else if (/\bwant to\b/i.test(core)) {
    addAlt(core.replace(/\bwant to\b/i, "would like to") + punct);
  } else if (/\bwould like to\b/i.test(core)) {
    addAlt(core.replace(/\bwould like to\b/i, "want to") + punct);
  }

  if (/\bI'm\b/.test(core)) addAlt(core.replace(/\bI'm\b/, "I am") + punct);
  if (/\bI am\b/.test(core)) addAlt(core.replace(/\bI am\b/, "I'm") + punct);
  if (/\bdon't\b/.test(core)) addAlt(core.replace(/\bdon't\b/, "do not") + punct);
  if (/\bdo not\b/.test(core)) addAlt(core.replace(/\bdo not\b/, "don't") + punct);
  if (/\bcan't\b/.test(core)) addAlt(core.replace(/\bcan't\b/, "cannot") + punct);
  if (/\bcannot\b/.test(core)) addAlt(core.replace(/\bcannot\b/, "can't") + punct);
  if (/\bit's\b/.test(core)) addAlt(core.replace(/\bit's\b/, "it is") + punct);
  if (/\bit is\b/.test(core)) addAlt(core.replace(/\bit is\b/, "it's") + punct);
  if (/\bthat's\b/.test(core)) addAlt(core.replace(/\bthat's\b/, "that is") + punct);
  if (/\bthat is\b/.test(core)) addAlt(core.replace(/\bthat is\b/, "that's") + punct);
  if (/\bthere's\b/.test(core)) addAlt(core.replace(/\bthere's\b/, "there is") + punct);
  if (/\bthere is\b/.test(core)) addAlt(core.replace(/\bthere is\b/, "there's") + punct);
  if (/\bthey've\b/.test(core)) addAlt(core.replace(/\bthey've\b/, "they have") + punct);
  if (/\bthey have\b/.test(core)) addAlt(core.replace(/\bthey have\b/, "they've") + punct);
  if (/\bhave to\b/i.test(core)) addAlt(core.replace(/\bhave to\b/i, "need to") + punct);
  if (/\bneed to\b/i.test(core)) addAlt(core.replace(/\bneed to\b/i, "have to") + punct);

  return {
    fullTranslation: cleanedSentence,
    acceptableTranslations: acceptableTranslations.slice(0, 2),
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
Also provide 2 natural alternative acceptable English translations that express the exact same meaning.

CRITICAL INSTRUCTIONS:
1. The 'word' property MUST be each individual single English word from the input sentence (NEVER combine multiple words like 'wake up' into one item; each space-separated token must be its own item). DO NOT put Chinese characters in the 'word' field.
2. The 'meaning' property MUST be the concise Chinese meaning (1-4 Chinese characters) of that English word in context. NEVER put the English word as the 'meaning'.
3. The 'ipa' property MUST be the IPA pronunciation wrapped in slashes (e.g. "/ʃiː/").
4. The 'pos' property should be the part of speech in Chinese (e.g. "代词", "动词", "副词", "介词", "数词", "名词", "形容词").
5. The 'chunkLabel' MUST be one of: "主语", "谓语", "宾语", "状语", "定语", "补语", "连词".
6. The 'acceptableTranslations' property MUST be an array of 2 alternative valid, natural English sentences that mean the same thing.

Return ONLY valid JSON format without markdown code blocks:
{
  "fullTranslation": "...",
  "acceptableTranslations": [
    "Alternative sentence 1",
    "Alternative sentence 2"
  ],
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
      if (!Array.isArray(parsed.acceptableTranslations) || parsed.acceptableTranslations.length === 0) {
        parsed.acceptableTranslations = fallback.acceptableTranslations;
      }
      parsed.words = parsed.chunks.flatMap((c: any) => c.words);
      return NextResponse.json(parsed);
    }
    return NextResponse.json(fallback);
  } catch {
    return NextResponse.json(buildSyntacticAnalysis(sentence));
  }
}

