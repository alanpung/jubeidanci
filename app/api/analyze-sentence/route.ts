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

// Cached in-memory dictionary map for fast lookups
let cachedDictMap: Map<string, DictLookupEntry> | null = null;

// High priority closed-class word lists
const ARTICLES = new Set(["a", "an", "the"]);
const PRONOUNS = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "someone", "anyone", "everyone", "nobody", "somebody", "anybody", "everybody",
  "something", "anything", "everything", "nothing", "who", "whom", "whose", "what", "which",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
  "mine", "yours", "hers", "ours", "theirs"
]);
const DETERMINERS = new Set([
  "my", "your", "his", "her", "its", "our", "their", "this", "that", "these", "those",
  "some", "any", "no", "every", "each", "either", "neither", "all", "both", "half",
  "many", "much", "more", "most", "few", "fewer", "little", "less", "several", "another", "such"
]);
const AUXILIARIES = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must"
]);
const PREPOSITIONS = new Set([
  "in", "on", "at", "to", "for", "with", "from", "by", "about", "around", "into",
  "through", "during", "before", "after", "above", "below", "between", "under", "behind",
  "near", "without", "against", "among", "across", "along", "toward", "towards", "upon", "within"
]);
const CONJUNCTIONS = new Set([
  "and", "but", "or", "so", "because", "although", "though", "if", "unless", "while",
  "since", "as", "until", "till", "whether"
]);
const NUMERALS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
]);
const ADVERBS = new Set([
  "always", "usually", "often", "sometimes", "never", "seldom", "hardly", "ever",
  "very", "too", "quite", "really", "already", "still", "yet", "just", "now", "then",
  "here", "there", "today", "yesterday", "tomorrow", "tonight", "together", "alone",
  "again", "soon", "late", "early", "far", "away", "back", "outside", "inside",
  "well", "fast", "slowly", "quickly", "suddenly", "finally", "probably", "maybe",
  "perhaps", "certainly", "definitely", "especially", "almost", "nearly", "o'clock", "please"
]);
const ADJECTIVES = new Set([
  "red", "blue", "green", "yellow", "white", "black", "orange", "purple", "pink", "brown", "gray", "grey",
  "sweet", "fresh", "polluted", "cold", "hot", "warm", "clean", "dirty", "new", "old",
  "big", "small", "good", "bad", "long", "short", "high", "low", "great", "little",
  "young", "important", "different", "easy", "hard", "bright", "dark", "heavy", "soft",
  "quiet", "loud", "busy", "free", "rich", "poor", "strong", "weak", "deep", "safe",
  "healthy", "sick", "tired", "hungry", "thirsty", "ready", "sure", "clear", "fine",
  "nice", "beautiful", "pretty", "cute", "ugly", "tall", "thin", "fat", "cool", "wet",
  "dry", "correct", "wrong", "delicious"
]);

const CONTRACTIONS: Record<string, DictLookupEntry> = {
  "i'm": { ipa: "/aɪm/", meaning: "我是", pos: "代词" },
  "you're": { ipa: "/jɔːr/", meaning: "你是", pos: "代词" },
  "he's": { ipa: "/hiːz/", meaning: "他是", pos: "代词" },
  "she's": { ipa: "/ʃiːz/", meaning: "她是", pos: "代词" },
  "it's": { ipa: "/ɪts/", meaning: "它是", pos: "代词" },
  "we're": { ipa: "/wɪər/", meaning: "我们是", pos: "代词" },
  "they're": { ipa: "/ðɛər/", meaning: "他们是", pos: "代词" },
  "that's": { ipa: "/ðæts/", meaning: "那是", pos: "代词" },
  "there's": { ipa: "/ðɛərz/", meaning: "有/在那", pos: "副词" },
  "what's": { ipa: "/wɒts/", meaning: "什么是", pos: "代词" },
  "who's": { ipa: "/huːz/", meaning: "谁是", pos: "代词" },
  "don't": { ipa: "/doʊnt/", meaning: "不/别", pos: "助动词" },
  "doesn't": { ipa: "/ˈdʌznt/", meaning: "不", pos: "助动词" },
  "didn't": { ipa: "/ˈdɪdnt/", meaning: "没有", pos: "助动词" },
  "won't": { ipa: "/woʊnt/", meaning: "不会", pos: "助动词" },
  "can't": { ipa: "/kænt/", meaning: "不能", pos: "助动词" },
  "cannot": { ipa: "/ˈkænɒt/", meaning: "不能", pos: "助动词" },
  "couldn't": { ipa: "/ˈkʊdnt/", meaning: "不能", pos: "助动词" },
  "shouldn't": { ipa: "/ˈʃʊdnt/", meaning: "不应该", pos: "助动词" },
  "haven't": { ipa: "/ˈhævnt/", meaning: "还没", pos: "助动词" },
  "hasn't": { ipa: "/ˈhæznt/", meaning: "还没", pos: "助动词" },
  "hadn't": { ipa: "/ˈhædnt/", meaning: "还没", pos: "助动词" },
  "isn't": { ipa: "/ˈɪznt/", meaning: "不是", pos: "助动词" },
  "aren't": { ipa: "/ɑːrnt/", meaning: "不是", pos: "助动词" },
  "wasn't": { ipa: "/ˈwɒznt/", meaning: "不是", pos: "助动词" },
  "weren't": { ipa: "/wɜːrnt/", meaning: "不是", pos: "助动词" },
  "i've": { ipa: "/aɪv/", meaning: "我已经", pos: "代词" },
  "you've": { ipa: "/juːv/", meaning: "你已经", pos: "代词" },
  "we've": { ipa: "/wiːv/", meaning: "我们已经", pos: "代词" },
  "they've": { ipa: "/ðeɪv/", meaning: "他们已经", pos: "代词" },
  "i'll": { ipa: "/aɪl/", meaning: "我将", pos: "代词" },
  "you'll": { ipa: "/juːl/", meaning: "你将", pos: "代词" },
  "he'll": { ipa: "/hiːl/", meaning: "他将", pos: "代词" },
  "she'll": { ipa: "/ʃiːl/", meaning: "她将", pos: "代词" },
  "we'll": { ipa: "/wiːl/", meaning: "我们将", pos: "代词" },
  "they'll": { ipa: "/ðeɪl/", meaning: "他们将", pos: "代词" },
  "i'd": { ipa: "/aɪd/", meaning: "我会/想", pos: "代词" },
  "you'd": { ipa: "/juːd/", meaning: "你会", pos: "代词" },
  "he'd": { ipa: "/hiːd/", meaning: "他会", pos: "代词" },
  "she'd": { ipa: "/ʃiːd/", meaning: "她会", pos: "代词" },
  "we'd": { ipa: "/wiːd/", meaning: "我们会", pos: "代词" },
  "they'd": { ipa: "/ðeɪd/", meaning: "他们会", pos: "代词" },
  "let's": { ipa: "/lɛts/", meaning: "让我们", pos: "动词" },
};

function cleanShortZhMeaning(rawDef?: string): string {
  if (!rawDef) return "";
  const parts = rawDef.split(/[；;\n|]/).map((s) => s.trim());
  for (const p of parts) {
    const clean = p
      .replace(/^[a-z]+\.\s*/i, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/（.*?）/g, "")
      .trim();
    const firstSub = clean.split(/[,，、/]/)[0].trim();
    if (firstSub && /[\u4e00-\u9fa5]/.test(firstSub)) {
      return firstSub.slice(0, 8);
    }
    if (clean && /[\u4e00-\u9fa5]/.test(clean)) {
      const match = clean.match(/[\u4e00-\u9fa5]{1,6}/);
      if (match) return match[0];
    }
  }
  return "";
}

function getNormalizedPos(word: string, rawPos?: string, meaning?: string): string {
  const p = String(rawPos || "").toLowerCase().trim();
  if (
    p === "动词" ||
    p === "名词" ||
    p === "形容词" ||
    p === "副词" ||
    p === "代词" ||
    p === "介词" ||
    p === "连词" ||
    p === "冠词" ||
    p === "限定词" ||
    p === "助动词" ||
    p === "数词"
  ) {
    return p;
  }

  const w = (word || "").toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");

  if (ARTICLES.has(w)) return "冠词";
  if (PRONOUNS.has(w)) return "代词";
  if (DETERMINERS.has(w)) return "限定词";
  if (AUXILIARIES.has(w)) return "助动词";
  if (PREPOSITIONS.has(w)) return "介词";
  if (CONJUNCTIONS.has(w)) return "连词";
  if (NUMERALS.has(w)) return "数词";
  if (ADVERBS.has(w)) return "副词";
  if (ADJECTIVES.has(w)) return "形容词";

  if (w.endsWith("'s")) return "限定词";
  if (CONTRACTIONS[w]) return CONTRACTIONS[w].pos;

  // Check exact prefixes and keywords in priority order
  if (p === "adverb" || p.startsWith("adv") || p === "r") return "副词";
  if (p === "adjective" || p.startsWith("adj") || p === "a") return "形容词";
  if (p === "pronoun" || p.startsWith("pron")) return "代词";
  if (p === "preposition" || p.startsWith("prep") || p === "p") return "介词";
  if (p === "conjunction" || p.startsWith("conj") || p === "c") return "连词";
  if (p.includes("aux") || p.includes("modal") || p === "be-verb") return "助动词";
  if (p.includes("verb") || p === "v") return "动词";
  if (p.includes("noun") || p === "n") return "名词";
  if (p.includes("num") || p === "number") return "数词";
  if (p.includes("det") || p.includes("article")) return "限定词";

  if (meaning && meaning.endsWith("的")) return "形容词";
  if (meaning && meaning.endsWith("地")) return "副词";
  return "名词";
}

function getDictionaryMap(): Map<string, DictLookupEntry> {
  if (cachedDictMap) return cachedDictMap;
  const map = new Map<string, DictLookupEntry>();

  // Single source of truth: english_merged.json. It already carries
  // definition_zh (100%), ipa (97%), pos and example_sentence_english for
  // every entry, so the old combined_a1_c2.json view file isn't needed.
  try {
    const mergedPath = path.join(process.cwd(), "words", "english_merged.json");
    if (fs.existsSync(mergedPath)) {
      const merged = JSON.parse(fs.readFileSync(mergedPath, "utf-8"));
      if (Array.isArray(merged)) {
        for (const item of merged) {
          const w = String(item.word || "").toLowerCase().trim();
          if (!w) continue;
          const meaning = cleanShortZhMeaning(item.definition_zh) || map.get(w)?.meaning || "";
          const pos = getNormalizedPos(w, item.pos, meaning);
          const ipa = item.ipa ? `/${String(item.ipa).replace(/^\/|\/$/g, "")}/` : "";
          if (meaning) {
            map.set(w, { ipa, meaning, pos });
          }
        }
      }
    }
  } catch {}

  // Add contractions
  for (const [k, v] of Object.entries(CONTRACTIONS)) {
    map.set(k, v);
  }

  // 4. Common high frequency words with clean translations
  const COMMON_WORDS_SUPPLEMENT: Record<string, DictLookupEntry> = {
    i: { ipa: "/aɪ/", meaning: "我", pos: "代词" },
    you: { ipa: "/juː/", meaning: "你", pos: "代词" },
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
    this: { ipa: "/ðɪs/", meaning: "这", pos: "限定词" },
    that: { ipa: "/ðæt/", meaning: "那", pos: "限定词" },
    the: { ipa: "/ðə/", meaning: "这/那", pos: "冠词" },
    a: { ipa: "/ə/", meaning: "一个", pos: "冠词" },
    an: { ipa: "/æn/", meaning: "一个", pos: "冠词" },
    to: { ipa: "/tuː/", meaning: "去/向", pos: "介词" },
    in: { ipa: "/ɪn/", meaning: "在…里", pos: "介词" },
    on: { ipa: "/ɒn/", meaning: "在…上", pos: "介词" },
    at: { ipa: "/æt/", meaning: "在", pos: "介词" },
    for: { ipa: "/fɔːr/", meaning: "为了/去", pos: "介词" },
    with: { ipa: "/wɪð/", meaning: "和…一起", pos: "介词" },
    from: { ipa: "/frɒm/", meaning: "从", pos: "介词" },
    by: { ipa: "/baɪ/", meaning: "通过", pos: "介词" },
    about: { ipa: "/əˈbaʊt/", meaning: "关于", pos: "介词" },
    after: { ipa: "/ˈæftər/", meaning: "在…之后", pos: "介词" },
    before: { ipa: "/bɪˈfɔːr/", meaning: "在…之前", pos: "介词" },
    during: { ipa: "/ˈdjʊərɪŋ/", meaning: "在…期间", pos: "介词" },
    near: { ipa: "/nɪər/", meaning: "在…附近", pos: "介词" },
    into: { ipa: "/ˈɪntuː/", meaning: "进入", pos: "介词" },
    of: { ipa: "/ɒv/", meaning: "…的", pos: "介词" },
    and: { ipa: "/ænd/", meaning: "和", pos: "连词" },
    but: { ipa: "/bʌt/", meaning: "但是", pos: "连词" },
    or: { ipa: "/ɔːr/", meaning: "或者", pos: "连词" },
    because: { ipa: "/bɪˈkɒz/", meaning: "因为", pos: "连词" },
    if: { ipa: "/ɪf/", meaning: "如果", pos: "连词" },
    when: { ipa: "/wɛn/", meaning: "当…时", pos: "连词" },
    always: { ipa: "/ˈɔːlweɪz/", meaning: "总是", pos: "副词" },
    usually: { ipa: "/ˈjuːʒuəli/", meaning: "通常", pos: "副词" },
    often: { ipa: "/ˈɒfən/", meaning: "经常", pos: "副词" },
    sometimes: { ipa: "/ˈsʌmtaɪmz/", meaning: "有时", pos: "副词" },
    never: { ipa: "/ˈnɛvər/", meaning: "从不", pos: "副词" },
    see: { ipa: "/siː/", meaning: "看见", pos: "动词" },
    red: { ipa: "/red/", meaning: "红色的", pos: "形容词" },
    sweet: { ipa: "/swiːt/", meaning: "甜的", pos: "形容词" },
    fresh: { ipa: "/freʃ/", meaning: "新鲜的", pos: "形容词" },
    polluted: { ipa: "/pəˈluːtɪd/", meaning: "受污染的", pos: "形容词" },
    river: { ipa: "/ˈrɪvər/", meaning: "河流", pos: "名词" },
    fruit: { ipa: "/fruːt/", meaning: "水果", pos: "名词" },
    autumn: { ipa: "/ˈɔːtəm/", meaning: "秋天", pos: "名词" },
    cycling: { ipa: "/ˈsaɪklɪŋ/", meaning: "骑行", pos: "名词" },
    mountains: { ipa: "/ˈmaʊntɪnz/", meaning: "山脉", pos: "名词" },
    mountain: { ipa: "/ˈmaʊntɪn/", meaning: "大山", pos: "名词" },
    period: { ipa: "/ˈpɪəriəd/", meaning: "课时/时期", pos: "名词" },
    breakfast: { ipa: "/ˈbrekfəst/", meaning: "早餐", pos: "名词" },
    lunch: { ipa: "/lʌntʃ/", meaning: "午餐", pos: "名词" },
    dinner: { ipa: "/ˈdɪnər/", meaning: "晚餐", pos: "名词" },
    stayed: { ipa: "/steɪd/", meaning: "停留/待", pos: "动词" },
    stay: { ipa: "/steɪ/", meaning: "停留/待", pos: "动词" },
    forever: { ipa: "/fərˈevər/", meaning: "永远", pos: "副词" },
    beach: { ipa: "/biːtʃ/", meaning: "海滩", pos: "名词" },
    leaves: { ipa: "/liːvz/", meaning: "离开", pos: "动词" },
    leave: { ipa: "/liːv/", meaning: "离开", pos: "动词" },
    wakes: { ipa: "/weɪks/", meaning: "醒来", pos: "动词" },
    wake: { ipa: "/weɪk/", meaning: "醒来", pos: "动词" },
    teach: { ipa: "/tiːtʃ/", meaning: "教导", pos: "动词" },
    dance: { ipa: "/dɑːns/", meaning: "跳舞", pos: "动词" },
    shall: { ipa: "/ʃæl/", meaning: "要不要/将", pos: "助动词" },
    asked: { ipa: "/æskt/", meaning: "请/询问", pos: "动词" },
    ask: { ipa: "/æsk/", meaning: "请/询问", pos: "动词" },
    another: { ipa: "/əˈnʌðər/", meaning: "另一", pos: "限定词" },
    year: { ipa: "/jɪər/", meaning: "年", pos: "名词" },
    third: { ipa: "/θɜːrd/", meaning: "第三", pos: "数词" },
    wish: { ipa: "/wɪʃ/", meaning: "希望", pos: "动词" },
  };

  for (const [k, v] of Object.entries(COMMON_WORDS_SUPPLEMENT)) {
    map.set(k, v);
  }

  cachedDictMap = map;
  return map;
}

export function lookupWordInfo(rawToken: string): WordItem {
  const dict = getDictionaryMap();
  const displayWord = rawToken.trim();
  const clean = displayWord
    .toLowerCase()
    .replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");

  // 1. Exact match
  if (dict.has(clean)) {
    const entry = dict.get(clean)!;
    return {
      word: displayWord,
      ipa: entry.ipa,
      meaning: entry.meaning,
      pos: getNormalizedPos(clean, entry.pos, entry.meaning),
    };
  }

  // 2. Possessive form (e.g. friend's, baby's)
  if (clean.endsWith("'s")) {
    const base = clean.slice(0, -2);
    if (dict.has(base)) {
      const entry = dict.get(base)!;
      return {
        word: displayWord,
        ipa: entry.ipa ? `${entry.ipa.replace(/\/$/, "")}z/` : "",
        meaning: `${entry.meaning}的`,
        pos: "限定词",
      };
    }
  }

  // 3. Lemmatized base forms
  const candidates: { cand: string; type: "plural" | "past" | "gerund" }[] = [];
  if (clean.endsWith("ies")) candidates.push({ cand: clean.slice(0, -3) + "y", type: "plural" });
  if (clean.endsWith("es")) candidates.push({ cand: clean.slice(0, -2), type: "plural" });
  if (clean.endsWith("s") && clean.length > 2) candidates.push({ cand: clean.slice(0, -1), type: "plural" });
  if (clean.endsWith("ed")) {
    candidates.push({ cand: clean.slice(0, -2), type: "past" });
    candidates.push({ cand: clean.slice(0, -1), type: "past" });
  }
  if (clean.endsWith("ing")) {
    candidates.push({ cand: clean.slice(0, -3), type: "gerund" });
    candidates.push({ cand: clean.slice(0, -3) + "e", type: "gerund" });
  }

  for (const { cand, type } of candidates) {
    if (dict.has(cand)) {
      const entry = dict.get(cand)!;
      let pos = entry.pos;
      if (type === "gerund") {
        pos = entry.pos === "动词" ? "动词" : "名词";
      } else if (type === "past") {
        pos = entry.pos === "动词" ? "动词" : "形容词";
      }
      return {
        word: displayWord,
        ipa: entry.ipa,
        meaning: entry.meaning,
        pos: getNormalizedPos(cand, pos, entry.meaning),
      };
    }
  }

  // 4. Default fallback: ensure POS is determined and Chinese meaning is provided
  const fallbackPos = getNormalizedPos(clean, undefined, undefined);
  return {
    word: displayWord,
    ipa: "",
    meaning: clean,
    pos: fallbackPos,
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

const TIME_WORDS = new Set([
  "every", "morning", "afternoon", "evening", "night", "weekend", "weekends",
  "today", "yesterday", "tomorrow", "now", "daily", "nightly", "weekly",
  "seven", "eight", "nine", "ten", "o'clock"
]);

function buildSyntacticAnalysis(sentence: string): { fullTranslation: string; acceptableTranslations: string[]; chunks: SyntacticChunk[] } {
  const cleanedSentence = (sentence || "").trim();
  if (!cleanedSentence) {
    return { fullTranslation: "", acceptableTranslations: [], chunks: [] };
  }

  const rawTokens = cleanedSentence.split(/\s+/).filter(Boolean);
  const words: WordItem[] = [];

  let idx = 0;
  while (idx < rawTokens.length) {
    const t1 = rawTokens[idx].toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
    const t2 = idx + 1 < rawTokens.length ? rawTokens[idx + 1].toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "") : "";
    const twoKey = `${t1} ${t2}`;

    if (t2 && PHRASAL_VERBS[twoKey]) {
      const pv = PHRASAL_VERBS[twoKey];
      const info1 = lookupWordInfo(rawTokens[idx]);
      const info2 = lookupWordInfo(rawTokens[idx + 1]);
      words.push({
        word: rawTokens[idx],
        ipa: info1.ipa || pv.ipa.split(" ")[0] || "",
        meaning: pv.meaning || info1.meaning,
        pos: "动词",
      });
      words.push({
        word: rawTokens[idx + 1],
        ipa: info2.ipa || pv.ipa.split(" ")[1] || "",
        meaning: info2.meaning || "起来",
        pos: "动词",
      });
      idx += 2;
      continue;
    }

    words.push(lookupWordInfo(rawTokens[idx]));
    idx++;
  }

  // Group words into grammatical chunks
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
    const cleanLower = w.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");

    // 1. Conjunctions
    if (CONJUNCTIONS.has(cleanLower)) {
      if (cleanLower === "and" && i + 1 < words.length && words[i + 1].word.toLowerCase().replace(/[.,!?;:]+$/g, "") === "then") {
        chunks.push({ chunkLabel: "状语", words: [w, words[i + 1]] });
        hasSeenMainVerb = false;
        i += 2;
        continue;
      }
      pushToChunk("连词", w);
      if (["because", "since", "if", "when", "although"].includes(cleanLower)) {
        hasSeenSubject = false;
        hasSeenMainVerb = false;
      }
      i++;
      continue;
    }

    // 2. Prepositional phrase or time adverbial
    if (PREPOSITIONS.has(cleanLower) || TIME_WORDS.has(cleanLower)) {
      const advWords: WordItem[] = [w];
      i++;
      while (i < words.length && advWords.length < 4) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
        if (CONJUNCTIONS.has(nextClean) || nextW.pos === "动词" || AUXILIARIES.has(nextClean) || PRONOUNS.has(nextClean)) {
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

    // 3. Frequency or manner adverbs
    if (ADVERBS.has(cleanLower) || w.pos === "副词") {
      pushToChunk("状语", w);
      i++;
      continue;
    }

    // 4. Subject (Pronoun or Determiner + Adj + Noun before main verb)
    if (!hasSeenSubject && (PRONOUNS.has(cleanLower) || DETERMINERS.has(cleanLower) || w.pos === "名词" || w.pos === "代词")) {
      const subjWords: WordItem[] = [w];
      i++;
      if (!PRONOUNS.has(cleanLower)) {
        while (i < words.length && subjWords.length < 3) {
          const nextW = words[i];
          const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
          if (
            nextW.pos === "动词" ||
            AUXILIARIES.has(nextClean) ||
            ADVERBS.has(nextClean) ||
            PREPOSITIONS.has(nextClean) ||
            CONJUNCTIONS.has(nextClean)
          ) {
            break;
          }
          subjWords.push(nextW);
          i++;
          if (nextW.pos === "名词") break;
        }
      }
      chunks.push({ chunkLabel: "主语", words: subjWords });
      hasSeenSubject = true;
      continue;
    }

    // 5. Predicate / Verb phrase
    if (w.pos === "动词" || AUXILIARIES.has(cleanLower)) {
      const verbWords: WordItem[] = [w];
      i++;
      while (i < words.length && verbWords.length < 3) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
        if (nextW.pos === "动词" || nextClean === "to" || nextClean === "up" || nextClean === "out") {
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

    // 6. Object / Complement
    if (hasSeenMainVerb) {
      const objWords: WordItem[] = [w];
      i++;
      while (i < words.length && objWords.length < 4) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
        if (
          PREPOSITIONS.has(nextClean) ||
          TIME_WORDS.has(nextClean) ||
          CONJUNCTIONS.has(nextClean) ||
          ADVERBS.has(nextClean) ||
          nextW.pos === "副词" ||
          nextW.pos === "动词"
        ) {
          break;
        }
        objWords.push(nextW);
        i++;
        if (nextW.pos === "名词") break;
      }
      chunks.push({ chunkLabel: "宾语", words: objWords });
      continue;
    }

    pushToChunk(hasSeenSubject ? "宾语" : "主语", w);
    hasSeenSubject = true;
    i++;
  }

  // Acceptable alternatives
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
4. The 'pos' property should be the part of speech in Chinese (MUST be one of: "代词", "限定词", "冠词", "助动词", "动词", "名词", "形容词", "副词", "介词", "连词", "数词").
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
