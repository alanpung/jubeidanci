var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// app/api/analyze-sentence/route.ts
var route_exports = {};
__export(route_exports, {
  POST: () => POST
});
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
function cleanShortZhMeaning(rawDef) {
  if (!rawDef) return "";
  const parts = rawDef.split(/[；;]/).map((s) => s.trim());
  for (const p of parts) {
    const clean = p.replace(/^[a-z]+\.\s*/i, "").split(/[,，、/]/)[0].replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").replace(/（.*?）/g, "").trim();
    if (clean && /[\u4e00-\u9fa5]/.test(clean)) {
      return clean.slice(0, 6);
    }
  }
  return "";
}
function getDictionaryMap() {
  if (cachedDictMap) return cachedDictMap;
  const map = /* @__PURE__ */ new Map();
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
  } catch {
  }
  for (const [k, v] of Object.entries(BUILTIN_WORD_OVERRIDES)) {
    const existing = map.get(k);
    map.set(k, {
      ipa: v.ipa || existing?.ipa || "",
      meaning: v.meaning || existing?.meaning || k,
      pos: v.pos || existing?.pos || "noun"
    });
  }
  cachedDictMap = map;
  return map;
}
function lookupWordInfo(rawToken) {
  const dict = getDictionaryMap();
  const displayWord = rawToken.trim();
  const clean = displayWord.toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
  if (dict.has(clean)) {
    const entry = dict.get(clean);
    return { word: displayWord, ipa: entry.ipa, meaning: entry.meaning, pos: entry.pos };
  }
  const candidates = [];
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
      const entry = dict.get(cand);
      return { word: displayWord, ipa: entry.ipa, meaning: entry.meaning, pos: entry.pos };
    }
  }
  return {
    word: displayWord,
    ipa: "",
    meaning: clean || displayWord,
    pos: "noun"
  };
}
function buildSyntacticAnalysis(sentence) {
  const cleanedSentence = (sentence || "").trim();
  if (!cleanedSentence) {
    return { fullTranslation: "", acceptableTranslations: [], chunks: [] };
  }
  const rawTokens = cleanedSentence.split(/\s+/).filter(Boolean);
  const words = [];
  let idx = 0;
  while (idx < rawTokens.length) {
    const t1 = rawTokens[idx].toLowerCase().replace(/[.,!?;:]+$/g, "");
    const t2 = idx + 1 < rawTokens.length ? rawTokens[idx + 1].toLowerCase().replace(/[.,!?;:]+$/g, "") : "";
    const twoKey = `${t1} ${t2}`;
    if (t2 && PHRASAL_VERBS[twoKey]) {
      const pv = PHRASAL_VERBS[twoKey];
      const info1 = lookupWordInfo(rawTokens[idx]);
      const info2 = lookupWordInfo(rawTokens[idx + 1]);
      words.push({
        word: rawTokens[idx],
        ipa: info1.ipa || pv.ipa.split(" ")[0] || "",
        meaning: pv.meaning || info1.meaning,
        pos: "verb"
      });
      words.push({
        word: rawTokens[idx + 1],
        ipa: info2.ipa || pv.ipa.split(" ")[1] || "",
        meaning: info2.meaning || "\u8D77\u6765",
        pos: "verb"
      });
      idx += 2;
      continue;
    }
    words.push(lookupWordInfo(rawTokens[idx]));
    idx++;
  }
  const chunks = [];
  let hasSeenSubject = false;
  let hasSeenMainVerb = false;
  function pushToChunk(label, item) {
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
    if (CONJUNCTIONS.has(cleanLower)) {
      if (cleanLower === "and" && i + 1 < words.length && words[i + 1].word.toLowerCase().replace(/[.,!?;:]+$/g, "") === "then") {
        chunks.push({ chunkLabel: "\u72B6\u8BED", words: [w, words[i + 1]] });
        hasSeenMainVerb = false;
        i += 2;
        continue;
      }
      pushToChunk("\u8FDE\u8BCD", w);
      if (cleanLower === "because" || cleanLower === "since" || cleanLower === "if" || cleanLower === "when" || cleanLower === "although") {
        hasSeenSubject = false;
        hasSeenMainVerb = false;
      }
      i++;
      continue;
    }
    if (PREPOSITIONS.has(cleanLower) || TIME_WORDS.has(cleanLower)) {
      const advWords = [w];
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
      chunks.push({ chunkLabel: "\u72B6\u8BED", words: advWords });
      continue;
    }
    if (FREQ_ADVERBS.has(cleanLower) || w.pos === "adverb") {
      pushToChunk("\u72B6\u8BED", w);
      i++;
      continue;
    }
    if (!hasSeenSubject && (PRONOUN_SUBJECTS.has(cleanLower) || DETERMINERS.has(cleanLower) || w.pos === "noun" || w.pos === "pronoun")) {
      const subjWords = [w];
      i++;
      if (!PRONOUN_SUBJECTS.has(cleanLower)) {
        while (i < words.length && subjWords.length < 3) {
          const nextW = words[i];
          const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
          if (nextW.pos === "verb" || AUX_AND_MODALS.has(nextClean) || FREQ_ADVERBS.has(nextClean) || PREPOSITIONS.has(nextClean) || CONJUNCTIONS.has(nextClean)) {
            break;
          }
          subjWords.push(nextW);
          i++;
          if (nextW.pos === "noun") break;
        }
      }
      chunks.push({ chunkLabel: "\u4E3B\u8BED", words: subjWords });
      hasSeenSubject = true;
      continue;
    }
    if (w.pos === "verb" || AUX_AND_MODALS.has(cleanLower)) {
      const verbWords = [w];
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
      chunks.push({ chunkLabel: "\u8C13\u8BED", words: verbWords });
      hasSeenSubject = true;
      hasSeenMainVerb = true;
      continue;
    }
    if (hasSeenMainVerb) {
      const objWords = [w];
      i++;
      while (i < words.length && objWords.length < 4) {
        const nextW = words[i];
        const nextClean = nextW.word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
        if (PREPOSITIONS.has(nextClean) || TIME_WORDS.has(nextClean) || CONJUNCTIONS.has(nextClean) || FREQ_ADVERBS.has(nextClean) || nextW.pos === "adverb" || nextW.pos === "verb") {
          break;
        }
        objWords.push(nextW);
        i++;
        if (nextW.pos === "noun") break;
      }
      chunks.push({ chunkLabel: "\u5BBE\u8BED", words: objWords });
      continue;
    }
    pushToChunk(hasSeenSubject ? "\u5BBE\u8BED" : "\u4E3B\u8BED", w);
    hasSeenSubject = true;
    i++;
  }
  const acceptableTranslations = [];
  const addAlt = (str) => {
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
    chunks
  };
}
async function POST(req) {
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
    const ai2 = new GoogleGenAI({ apiKey });
    const prompt = `Analyze the following English sentence ("${sentence}") into syntactic chunks (such as \u4E3B\u8BED, \u8C13\u8BED, \u5BBE\u8BED, \u72B6\u8BED, \u5B9A\u8BED, \u8FDE\u8BCD).
Also provide 2 natural alternative acceptable English translations that express the exact same meaning.

CRITICAL INSTRUCTIONS:
1. The 'word' property MUST be each individual single English word from the input sentence (NEVER combine multiple words like 'wake up' into one item; each space-separated token must be its own item). DO NOT put Chinese characters in the 'word' field.
2. The 'meaning' property MUST be the concise Chinese meaning (1-4 Chinese characters) of that English word in context. NEVER put the English word as the 'meaning'.
3. The 'ipa' property MUST be the IPA pronunciation wrapped in slashes (e.g. "/\u0283i\u02D0/").
4. The 'pos' property should be the part of speech in Chinese (e.g. "\u4EE3\u8BCD", "\u52A8\u8BCD", "\u526F\u8BCD", "\u4ECB\u8BCD", "\u6570\u8BCD", "\u540D\u8BCD", "\u5F62\u5BB9\u8BCD").
5. The 'chunkLabel' MUST be one of: "\u4E3B\u8BED", "\u8C13\u8BED", "\u5BBE\u8BED", "\u72B6\u8BED", "\u5B9A\u8BED", "\u8865\u8BED", "\u8FDE\u8BCD".
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
      "chunkLabel": "\u4E3B\u8BED",
      "words": [
        { "word": "She", "ipa": "/\u0283i\u02D0/", "meaning": "\u5979", "pos": "\u4EE3\u8BCD" }
      ]
    }
  ]
}`;
    const response = await ai2.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    const text = response.text?.trim() || "";
    const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.chunks) && parsed.chunks.length > 0 && !(parsed.chunks.length === 1 && parsed.chunks[0].chunkLabel === "\u53E5\u5B50")) {
      if (!Array.isArray(parsed.acceptableTranslations) || parsed.acceptableTranslations.length === 0) {
        parsed.acceptableTranslations = fallback.acceptableTranslations;
      }
      return NextResponse.json(parsed);
    }
    return NextResponse.json(fallback);
  } catch {
    return NextResponse.json(buildSyntacticAnalysis(sentence));
  }
}
var cachedDictMap, BUILTIN_WORD_OVERRIDES, PHRASAL_VERBS, PREPOSITIONS, TIME_WORDS, FREQ_ADVERBS, CONJUNCTIONS, PRONOUN_SUBJECTS, DETERMINERS, AUX_AND_MODALS;
var init_route = __esm({
  "app/api/analyze-sentence/route.ts"() {
    "use strict";
    cachedDictMap = null;
    BUILTIN_WORD_OVERRIDES = {
      i: { ipa: "/a\u026A/", meaning: "\u6211", pos: "pronoun" },
      you: { ipa: "/ju\u02D0/", meaning: "\u4F60/\u4F60\u4EEC", pos: "pronoun" },
      he: { ipa: "/hi\u02D0/", meaning: "\u4ED6", pos: "pronoun" },
      she: { ipa: "/\u0283i\u02D0/", meaning: "\u5979", pos: "pronoun" },
      it: { ipa: "/\u026At/", meaning: "\u5B83", pos: "pronoun" },
      we: { ipa: "/wi\u02D0/", meaning: "\u6211\u4EEC", pos: "pronoun" },
      they: { ipa: "/\xF0e\u026A/", meaning: "\u4ED6\u4EEC", pos: "pronoun" },
      me: { ipa: "/mi\u02D0/", meaning: "\u6211", pos: "pronoun" },
      him: { ipa: "/h\u026Am/", meaning: "\u4ED6", pos: "pronoun" },
      her: { ipa: "/h\u025C\u02D0r/", meaning: "\u5979/\u5979\u7684", pos: "pronoun" },
      us: { ipa: "/\u028Cs/", meaning: "\u6211\u4EEC", pos: "pronoun" },
      them: { ipa: "/\xF0\u025Bm/", meaning: "\u4ED6\u4EEC", pos: "pronoun" },
      my: { ipa: "/ma\u026A/", meaning: "\u6211\u7684", pos: "possessive" },
      your: { ipa: "/j\u0254\u02D0r/", meaning: "\u4F60\u7684", pos: "possessive" },
      his: { ipa: "/h\u026Az/", meaning: "\u4ED6\u7684", pos: "possessive" },
      our: { ipa: "/a\u028A\u0259r/", meaning: "\u6211\u4EEC\u7684", pos: "possessive" },
      their: { ipa: "/\xF0\u025B\u0259r/", meaning: "\u4ED6\u4EEC\u7684", pos: "possessive" },
      its: { ipa: "/\u026Ats/", meaning: "\u5B83\u7684", pos: "possessive" },
      get: { ipa: "/\u0261\u025Bt/", meaning: "\u4F7F\u5F97/\u5F97\u5230", pos: "verb" },
      message: { ipa: "/\u02C8m\u025Bs.\u026Ad\u0292/", meaning: "\u6D88\u606F", pos: "noun" },
      am: { ipa: "/\xE6m/", meaning: "\u662F", pos: "auxiliary" },
      is: { ipa: "/\u026Az/", meaning: "\u662F", pos: "auxiliary" },
      are: { ipa: "/\u0251\u02D0r/", meaning: "\u662F", pos: "auxiliary" },
      was: { ipa: "/w\u0252z/", meaning: "\u662F(\u8FC7\u53BB)", pos: "auxiliary" },
      were: { ipa: "/w\u025C\u02D0r/", meaning: "\u662F(\u8FC7\u53BB)", pos: "auxiliary" },
      be: { ipa: "/bi\u02D0/", meaning: "\u662F/\u6210\u4E3A", pos: "verb" },
      been: { ipa: "/b\u026An/", meaning: "\u662F(\u5206\u8BCD)", pos: "verb" },
      have: { ipa: "/h\xE6v/", meaning: "\u6709/\u5DF2\u7ECF", pos: "verb" },
      has: { ipa: "/h\xE6z/", meaning: "\u6709/\u5DF2\u7ECF", pos: "verb" },
      had: { ipa: "/h\xE6d/", meaning: "\u6709/\u5DF2\u7ECF", pos: "verb" },
      do: { ipa: "/du\u02D0/", meaning: "\u505A/\u5E72", pos: "auxiliary" },
      does: { ipa: "/d\u028Cz/", meaning: "\u505A/\u5E72", pos: "auxiliary" },
      did: { ipa: "/d\u026Ad/", meaning: "\u505A/\u5E72", pos: "auxiliary" },
      can: { ipa: "/k\xE6n/", meaning: "\u80FD/\u53EF\u4EE5", pos: "auxiliary" },
      could: { ipa: "/k\u028Ad/", meaning: "\u80FD\u591F", pos: "auxiliary" },
      will: { ipa: "/w\u026Al/", meaning: "\u5C06\u4F1A", pos: "auxiliary" },
      would: { ipa: "/w\u028Ad/", meaning: "\u60F3\u8981/\u4F1A", pos: "auxiliary" },
      should: { ipa: "/\u0283\u028Ad/", meaning: "\u5E94\u8BE5", pos: "auxiliary" },
      must: { ipa: "/m\u028Cst/", meaning: "\u5FC5\u987B", pos: "auxiliary" },
      may: { ipa: "/me\u026A/", meaning: "\u53EF\u4EE5/\u53EF\u80FD", pos: "modal" },
      might: { ipa: "/ma\u026At/", meaning: "\u53EF\u80FD", pos: "modal" },
      to: { ipa: "/tu\u02D0/", meaning: "\u53BB/\u5411", pos: "preposition" },
      in: { ipa: "/\u026An/", meaning: "\u5728\u2026\u91CC", pos: "preposition" },
      on: { ipa: "/\u0252n/", meaning: "\u5728\u2026\u4E0A", pos: "preposition" },
      at: { ipa: "/\xE6t/", meaning: "\u5728", pos: "preposition" },
      for: { ipa: "/f\u0254\u02D0r/", meaning: "\u4E3A\u4E86/\u53BB", pos: "preposition" },
      with: { ipa: "/w\u026A\xF0/", meaning: "\u548C\u2026\u4E00\u8D77", pos: "preposition" },
      from: { ipa: "/fr\u0252m/", meaning: "\u4ECE", pos: "preposition" },
      by: { ipa: "/ba\u026A/", meaning: "\u901A\u8FC7/\u5728\u2026\u65C1", pos: "preposition" },
      about: { ipa: "/\u0259\u02C8ba\u028At/", meaning: "\u5173\u4E8E/\u5927\u7EA6", pos: "preposition" },
      around: { ipa: "/\u0259\u02C8ra\u028And/", meaning: "\u5927\u7EA6/\u5728\u5468\u56F4", pos: "preposition" },
      after: { ipa: "/\u02C8\xE6ft\u0259r/", meaning: "\u5728\u2026\u4E4B\u540E", pos: "preposition" },
      before: { ipa: "/b\u026A\u02C8f\u0254\u02D0r/", meaning: "\u5728\u2026\u4E4B\u524D", pos: "preposition" },
      during: { ipa: "/\u02C8dj\u028A\u0259r\u026A\u014B/", meaning: "\u5728\u2026\u671F\u95F4", pos: "preposition" },
      near: { ipa: "/n\u026A\u0259r/", meaning: "\u5728\u2026\u9644\u8FD1", pos: "preposition" },
      into: { ipa: "/\u02C8\u026Antu\u02D0/", meaning: "\u8FDB\u5165", pos: "preposition" },
      of: { ipa: "/\u0252v/", meaning: "\u2026\u7684", pos: "preposition" },
      and: { ipa: "/\xE6nd/", meaning: "\u548C/\u7136\u540E", pos: "conjunction" },
      but: { ipa: "/b\u028Ct/", meaning: "\u4F46\u662F", pos: "conjunction" },
      or: { ipa: "/\u0254\u02D0r/", meaning: "\u6216\u8005", pos: "conjunction" },
      because: { ipa: "/b\u026A\u02C8k\u0252z/", meaning: "\u56E0\u4E3A", pos: "conjunction" },
      since: { ipa: "/s\u026Ans/", meaning: "\u56E0\u4E3A/\u81EA\u4ECE", pos: "conjunction" },
      if: { ipa: "/\u026Af/", meaning: "\u5982\u679C", pos: "conjunction" },
      when: { ipa: "/w\u025Bn/", meaning: "\u5F53\u2026\u65F6", pos: "conjunction" },
      although: { ipa: "/\u0254\u02D0l\u02C8\xF0o\u028A/", meaning: "\u867D\u7136", pos: "conjunction" },
      how: { ipa: "/ha\u028A/", meaning: "\u5982\u4F55/\u600E\u4E48", pos: "adverb" },
      where: { ipa: "/w\u025B\u0259r/", meaning: "\u5728\u54EA\u91CC", pos: "adverb" },
      usually: { ipa: "/\u02C8ju\u02D0\u0292u\u0259li/", meaning: "\u901A\u5E38", pos: "adverb" },
      normally: { ipa: "/\u02C8n\u0254\u02D0rm\u0259li/", meaning: "\u901A\u5E38", pos: "adverb" },
      always: { ipa: "/\u02C8\u0254\u02D0lwe\u026Az/", meaning: "\u603B\u662F", pos: "adverb" },
      often: { ipa: "/\u02C8\u0252f\u0259n/", meaning: "\u7ECF\u5E38", pos: "adverb" },
      sometimes: { ipa: "/\u02C8s\u028Cmta\u026Amz/", meaning: "\u6709\u65F6", pos: "adverb" },
      never: { ipa: "/\u02C8n\u025Bv\u0259r/", meaning: "\u4ECE\u4E0D", pos: "adverb" },
      still: { ipa: "/st\u026Al/", meaning: "\u4ECD\u7136", pos: "adverb" },
      then: { ipa: "/\xF0\u025Bn/", meaning: "\u7136\u540E", pos: "adverb" },
      very: { ipa: "/\u02C8v\u025Bri/", meaning: "\u975E\u5E38", pos: "adverb" },
      so: { ipa: "/so\u028A/", meaning: "\u5982\u6B64/\u6240\u4EE5", pos: "adverb" },
      also: { ipa: "/\u02C8\u0254\u02D0lso\u028A/", meaning: "\u4E5F", pos: "adverb" },
      first: { ipa: "/f\u025C\u02D0rst/", meaning: "\u9996\u5148/\u7B2C\u4E00", pos: "adverb" },
      there: { ipa: "/\xF0\u025B\u0259r/", meaning: "\u90A3\u91CC", pos: "adverb" },
      here: { ipa: "/h\u026A\u0259r/", meaning: "\u8FD9\u91CC", pos: "adverb" },
      outside: { ipa: "/\u02CCa\u028At\u02C8sa\u026Ad/", meaning: "\u5728\u5916\u9762", pos: "adverb" },
      today: { ipa: "/t\u0259\u02C8de\u026A/", meaning: "\u4ECA\u5929", pos: "adverb" },
      yesterday: { ipa: "/\u02C8j\u025Bst\u0259rde\u026A/", meaning: "\u6628\u5929", pos: "adverb" },
      tomorrow: { ipa: "/t\u0259\u02C8m\u0252ro\u028A/", meaning: "\u660E\u5929", pos: "adverb" },
      please: { ipa: "/pli\u02D0z/", meaning: "\u8BF7", pos: "adverb" },
      "o'clock": { ipa: "/\u0259\u02C8kl\u0252k/", meaning: "\u70B9\u949F", pos: "adverb" },
      seven: { ipa: "/\u02C8s\u025Bv\u0259n/", meaning: "\u4E03/\u4E03\u70B9", pos: "numeral" },
      eight: { ipa: "/e\u026At/", meaning: "\u516B/\u516B\u70B9", pos: "numeral" },
      nine: { ipa: "/na\u026An/", meaning: "\u4E5D/\u4E5D\u70B9", pos: "numeral" },
      ten: { ipa: "/t\u025Bn/", meaning: "\u5341/\u5341\u70B9", pos: "numeral" },
      leaves: { ipa: "/li\u02D0vz/", meaning: "\u79BB\u5F00", pos: "verb" },
      goes: { ipa: "/\u0261o\u028Az/", meaning: "\u53BB", pos: "verb" },
      visits: { ipa: "/\u02C8v\u026Az\u026Ats/", meaning: "\u53C2\u89C2/\u53BB", pos: "verb" },
      reads: { ipa: "/ri\u02D0dz/", meaning: "\u9605\u8BFB", pos: "verb" },
      prepares: { ipa: "/pr\u026A\u02C8p\u025B\u0259rz/", meaning: "\u51C6\u5907", pos: "verb" },
      cooks: { ipa: "/k\u028Aks/", meaning: "\u70F9\u996A", pos: "verb" },
      makes: { ipa: "/me\u026Aks/", meaning: "\u5236\u4F5C", pos: "verb" },
      wants: { ipa: "/w\u0252nts/", meaning: "\u60F3\u8981", pos: "verb" },
      decided: { ipa: "/d\u026A\u02C8sa\u026Ad\u026Ad/", meaning: "\u51B3\u5B9A", pos: "verb" },
      learned: { ipa: "/l\u025C\u02D0rnd/", meaning: "\u5B66\u4F1A\u4E86", pos: "verb" },
      knew: { ipa: "/nju\u02D0/", meaning: "\u77E5\u9053", pos: "verb" },
      listening: { ipa: "/\u02C8l\u026As\u0259n\u026A\u014B/", meaning: "\u542C", pos: "verb" },
      walking: { ipa: "/\u02C8w\u0254\u02D0k\u026A\u014B/", meaning: "\u6563\u6B65", pos: "verb" },
      breathing: { ipa: "/\u02C8bri\u02D0\xF0\u026A\u014B/", meaning: "\u547C\u5438", pos: "verb" },
      playing: { ipa: "/\u02C8ple\u026A\u026A\u014B/", meaning: "\u73A9", pos: "verb" },
      finishing: { ipa: "/\u02C8f\u026An\u026A\u0283\u026A\u014B/", meaning: "\u7ED3\u675F", pos: "verb" },
      leaving: { ipa: "/\u02C8li\u02D0v\u026A\u014B/", meaning: "\u79BB\u5F00", pos: "verb" },
      reading: { ipa: "/\u02C8ri\u02D0d\u026A\u014B/", meaning: "\u9605\u8BFB", pos: "noun" },
      morning: { ipa: "/\u02C8m\u0254\u02D0rn\u026A\u014B/", meaning: "\u65E9\u4E0A", pos: "noun" },
      afternoon: { ipa: "/\u02CC\xE6ft\u0259r\u02C8nu\u02D0n/", meaning: "\u4E0B\u5348", pos: "noun" },
      evening: { ipa: "/\u02C8i\u02D0vn\u026A\u014B/", meaning: "\u665A\u4E0A", pos: "noun" },
      night: { ipa: "/na\u026At/", meaning: "\u591C\u665A", pos: "noun" },
      weekend: { ipa: "/\u02C8wi\u02D0k\u025Bnd/", meaning: "\u5468\u672B", pos: "noun" },
      weekends: { ipa: "/\u02C8wi\u02D0k\u025Bndz/", meaning: "\u5468\u672B", pos: "noun" },
      breakfast: { ipa: "/\u02C8br\u025Bkf\u0259st/", meaning: "\u65E9\u9910", pos: "noun" },
      dinner: { ipa: "/\u02C8d\u026An\u0259r/", meaning: "\u665A\u9910", pos: "noun" },
      home: { ipa: "/ho\u028Am/", meaning: "\u5BB6", pos: "noun" },
      house: { ipa: "/ha\u028As/", meaning: "\u623F\u5B50/\u5BB6", pos: "noun" },
      work: { ipa: "/w\u025C\u02D0rk/", meaning: "\u5DE5\u4F5C/\u4E0A\u73ED", pos: "noun" },
      school: { ipa: "/sku\u02D0l/", meaning: "\u5B66\u6821", pos: "noun" },
      park: { ipa: "/p\u0251\u02D0rk/", meaning: "\u516C\u56ED", pos: "noun" },
      library: { ipa: "/\u02C8la\u026Abr\u0259ri/", meaning: "\u56FE\u4E66\u9986", pos: "noun" },
      books: { ipa: "/b\u028Aks/", meaning: "\u4E66", pos: "noun" },
      children: { ipa: "/\u02C8t\u0283\u026Aldr\u0259n/", meaning: "\u5B69\u5B50\u4EEC", pos: "noun" },
      kids: { ipa: "/k\u026Adz/", meaning: "\u5B69\u5B50\u4EEC", pos: "noun" },
      games: { ipa: "/\u0261e\u026Amz/", meaning: "\u6E38\u620F", pos: "noun" },
      friends: { ipa: "/fr\u025Bndz/", meaning: "\u670B\u53CB\u4EEC", pos: "noun" },
      mother: { ipa: "/\u02C8m\u028C\xF0\u0259r/", meaning: "\u6BCD\u4EB2", pos: "noun" },
      mom: { ipa: "/m\u0252m/", meaning: "\u5988\u5988", pos: "noun" },
      family: { ipa: "/\u02C8f\xE6m\u0259li/", meaning: "\u5BB6\u4EBA", pos: "noun" },
      bed: { ipa: "/b\u025Bd/", meaning: "\u5E8A", pos: "noun" },
      room: { ipa: "/ru\u02D0m/", meaning: "\u623F\u95F4", pos: "noun" },
      bedroom: { ipa: "/\u02C8b\u025Bdru\u02D0m/", meaning: "\u5367\u5BA4", pos: "noun" },
      music: { ipa: "/\u02C8mju\u02D0z\u026Ak/", meaning: "\u97F3\u4E50", pos: "noun" },
      air: { ipa: "/\u025B\u0259r/", meaning: "\u7A7A\u6C14", pos: "noun" },
      walk: { ipa: "/w\u0254\u02D0k/", meaning: "\u6563\u6B65", pos: "noun" }
    };
    PHRASAL_VERBS = {
      "get up": { ipa: "/\u0261\u025Bt \u028Cp/", meaning: "\u8D77\u5E8A" },
      "wake up": { ipa: "/we\u026Ak \u028Cp/", meaning: "\u9192\u6765/\u8D77\u5E8A" },
      "clean up": { ipa: "/kli\u02D0n \u028Cp/", meaning: "\u6253\u626B\u5E72\u51C0" },
      "tidy up": { ipa: "/\u02C8ta\u026Adi \u028Cp/", meaning: "\u6574\u7406" },
      "meet up": { ipa: "/mi\u02D0t \u028Cp/", meaning: "\u805A\u4F1A/\u89C1\u9762" },
      "get together": { ipa: "/\u0261\u025Bt t\u0259\u02C8\u0261\u025B\xF0\u0259r/", meaning: "\u76F8\u805A" },
      "go to": { ipa: "/\u0261o\u028A tu\u02D0/", meaning: "\u53BB" },
      "goes to": { ipa: "/\u0261o\u028Az tu\u02D0/", meaning: "\u53BB" },
      "went to": { ipa: "/w\u025Bnt tu\u02D0/", meaning: "\u53BB\u4E86" },
      "like to": { ipa: "/la\u026Ak tu\u02D0/", meaning: "\u559C\u6B22" },
      "want to": { ipa: "/w\u0252nt tu\u02D0/", meaning: "\u60F3\u8981" },
      "would like to": { ipa: "/w\u028Ad la\u026Ak tu\u02D0/", meaning: "\u60F3\u8981" },
      "plan to": { ipa: "/pl\xE6n tu\u02D0/", meaning: "\u6253\u7B97" },
      "decided to": { ipa: "/d\u026A\u02C8sa\u026Ad\u026Ad tu\u02D0/", meaning: "\u51B3\u5B9A" },
      "decide to": { ipa: "/d\u026A\u02C8sa\u026Ad tu\u02D0/", meaning: "\u51B3\u5B9A" },
      "learned to": { ipa: "/l\u025C\u02D0rnd tu\u02D0/", meaning: "\u5B66\u4F1A" },
      "learned how to": { ipa: "/l\u025C\u02D0rnd ha\u028A tu\u02D0/", meaning: "\u5B66\u4F1A\u5982\u4F55" },
      "knew how to": { ipa: "/nju\u02D0 ha\u028A tu\u02D0/", meaning: "\u77E5\u9053\u5982\u4F55" }
    };
    PREPOSITIONS = /* @__PURE__ */ new Set([
      "in",
      "on",
      "at",
      "for",
      "with",
      "from",
      "by",
      "about",
      "around",
      "after",
      "before",
      "during",
      "near",
      "into",
      "under",
      "over",
      "between",
      "without",
      "through"
    ]);
    TIME_WORDS = /* @__PURE__ */ new Set([
      "every",
      "morning",
      "afternoon",
      "evening",
      "night",
      "weekend",
      "weekends",
      "today",
      "yesterday",
      "tomorrow",
      "now",
      "daily",
      "nightly",
      "weekly",
      "seven",
      "eight",
      "nine",
      "ten",
      "o'clock"
    ]);
    FREQ_ADVERBS = /* @__PURE__ */ new Set([
      "usually",
      "normally",
      "always",
      "often",
      "sometimes",
      "never",
      "generally",
      "still",
      "first"
    ]);
    CONJUNCTIONS = /* @__PURE__ */ new Set([
      "and",
      "but",
      "or",
      "because",
      "since",
      "if",
      "when",
      "although"
    ]);
    PRONOUN_SUBJECTS = /* @__PURE__ */ new Set([
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they"
    ]);
    DETERMINERS = /* @__PURE__ */ new Set([
      "the",
      "a",
      "an",
      "this",
      "that",
      "these",
      "those",
      "my",
      "your",
      "his",
      "her",
      "our",
      "their",
      "many",
      "most",
      "some",
      "any",
      "all"
    ]);
    AUX_AND_MODALS = /* @__PURE__ */ new Set([
      "can",
      "could",
      "will",
      "would",
      "should",
      "must",
      "may",
      "might",
      "do",
      "does",
      "did",
      "am",
      "is",
      "are",
      "was",
      "were",
      "have",
      "has",
      "had"
    ]);
  }
});

// server.ts
import express from "express";
import path2 from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
import { createServer as createViteServer } from "vite";
var __dirname = path2.dirname(fileURLToPath(import.meta.url));
var app = express();
app.use(express.json({ limit: "50mb" }));
var ai = new GoogleGenAI2({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
app.post("/api/tutor/chat", async (req, res) => {
  try {
    const { messages, targetLanguage = "English", learnerLevel = "A2" } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }
    const systemInstruction = `You are the friendly, encouraging AI Language Tutor for jubeidanci (OpenLingo).
Target Language: ${targetLanguage}
Learner Level: ${learnerLevel} (CEFR)

Your goals:
1. Converse naturally in the target language (${targetLanguage}) matched to CEFR ${learnerLevel}.
2. If the user makes grammatical or vocabulary mistakes, provide a brief, polite tip or correction enclosed in [Correction: ...], then continue the natural dialogue.
3. Keep answers concise, engaging, and always end with an interactive question or prompt to keep the conversation flowing.
4. If the user asks in English or their native tongue for an explanation or translation, explain clearly and warmly.`;
    const conversationPrompt = messages.map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`).join("\n\n");
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: conversationPrompt,
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });
    res.json({ reply: response.text });
  } catch (error) {
    console.error("Error in /api/tutor/chat:", error);
    res.status(500).json({ error: error.message || "Failed to generate tutor response" });
  }
});
app.post("/api/analyze-sentence", async (req, res) => {
  try {
    const { POST: POST2 } = await Promise.resolve().then(() => (init_route(), route_exports));
    const fullUrl = `http://${req.headers.host || "localhost:3000"}${req.url}`;
    const webReq = new Request(fullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const nextRes = await POST2(webReq);
    const data = await nextRes.json();
    res.status(nextRes.status).json(data);
  } catch (err) {
    console.error("Error in /api/analyze-sentence:", err);
    res.status(500).json({ error: err.message || "Failed to analyze sentence" });
  }
});
app.post("/api/tutor/create-unit", async (req, res) => {
  try {
    const { topic = "Daily Routine", language = "Spanish", level = "A1" } = req.body;
    const prompt = `Create an interactive language learning lesson unit for jubeidanci.
Topic: "${topic}"
Target Language: ${language}
CEFR Level: ${level}

Return a valid JSON object with the following structure:
{
  "title": "Unit Title",
  "description": "Short unit overview",
  "vocabulary": [
    { "word": "word in target lang", "translation": "English translation", "example": "Example sentence", "partOfSpeech": "noun/verb/adj" }
  ],
  "exercises": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Question text in English or target language",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Correct Option",
      "explanation": "Why this is correct"
    },
    {
      "id": 2,
      "type": "fill_in_the_blank",
      "sentence": "Sentence with ___ blank in target lang",
      "correctWord": "word",
      "options": ["word", "wrong1", "wrong2"],
      "translation": "English translation of full sentence"
    },
    {
      "id": 3,
      "type": "translation",
      "prompt": "Translate this sentence",
      "sourceText": "Original sentence",
      "correctTranslation": "Accurate translation in target lang",
      "acceptableAlternatives": ["Alternative translation"]
    }
  ]
}`;
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error) {
    console.error("Error in /api/tutor/create-unit:", error);
    res.status(500).json({ error: error.message || "Failed to generate unit" });
  }
});
async function startServer() {
  const PORT = Number(process.env.PORT) || 3e3;
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path2.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(__dirname, "dist", "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`jubeidanci Server running on http://localhost:${PORT}`);
  });
}
startServer();
