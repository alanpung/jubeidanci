const fs = require("fs");
const path = require("path");

const DICT_FILES = [
  "/tmp/coca20000.json",
  "/tmp/oxford5000.json",
  "/tmp/level8.json",
  "/tmp/macmillan.json",
  "/tmp/kaoyan.json",
  "/tmp/toefl.json",
  "/tmp/hongbaoshu.json",
  "/tmp/level4.json",
  "/tmp/gre3000.json"
];

console.log("Loading dictionary reference datasets...");
const dictMap = new Map();

for (const file of DICT_FILES) {
  if (!fs.existsSync(file)) continue;
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const item of list) {
      const name = (item.name || item.word || "").toLowerCase().trim();
      if (!name) continue;

      let trans = "";
      if (Array.isArray(item.trans)) {
        trans = item.trans.join("; ");
      } else if (typeof item.trans === "string") {
        trans = item.trans;
      } else if (typeof item.translation === "string") {
        trans = item.translation;
      }

      if (!trans) continue;
      trans = trans.replace(/\r?\n/g, "; ").replace(/\s+/g, " ").trim();

      const existing = dictMap.get(name);
      if (!existing || trans.length > existing.trans.length) {
        dictMap.set(name, {
          trans,
          phone: item.usphone || item.ukphone || item.phone || "",
        });
      }
    }
  } catch (e) {
    console.error("Failed to read", file, e.message);
  }
}

console.log(`Loaded ${dictMap.size} unique English entries in master reference dictionary.`);

// Contraction dictionary
const CONTRACTIONS = {
  "'m": { trans: "am 的缩写（常用于 I'm）", pos: "verb", phone: "əm" },
  "'re": { trans: "are 的缩写（常用于 you're, we're, they're）", pos: "verb", phone: "ə" },
  "'s": { trans: "is / has 的缩写，或名词所有格", pos: "verb", phone: "s" },
  "'ve": { trans: "have 的缩写（常用于 I've, you've）", pos: "verb", phone: "v" },
  "'ll": { trans: "will / shall 的缩写（常用于 I'll, he'll）", pos: "modal", phone: "l" },
  "'d": { trans: "would / had 的缩写（常用于 I'd, you'd）", pos: "modal", phone: "d" },
  "n't": { trans: "not 的否定缩写（常用于 don't, can't, isn't）", pos: "adverb", phone: "nt" },
  "a": { trans: "art. 一（个，件…）；任一", pos: "determiner", phone: "eɪ" },
  "an": { trans: "art. 一（个，件…，用于元音发音前）", pos: "determiner", phone: "æn" },
  "the": { trans: "art. 这，那，这些，那些（定冠词）", pos: "determiner", phone: "ðə" },
};

function cleanDefinition(raw) {
  if (!raw) return "";
  let c = raw.trim();
  // Remove trailing or leading brackets if just pos
  return c;
}

function getLemmaDefinition(word, pos) {
  const w = word.toLowerCase().trim();

  // 1. Direct Contraction
  if (CONTRACTIONS[w]) {
    return CONTRACTIONS[w];
  }

  // 2. Direct exact match
  if (dictMap.has(w)) {
    return dictMap.get(w);
  }

  // 3. Adverbs in -ly
  if (w.endsWith("ly") && w.length > 4) {
    const base = w.slice(0, -2);
    if (dictMap.has(base)) {
      const b = dictMap.get(base);
      return { trans: `${b.trans}（…地，副词）`, phone: b.phone ? `${b.phone}li` : "" };
    }
    if (w.endsWith("ily") && dictMap.has(w.slice(0, -3) + "y")) {
      const b = dictMap.get(w.slice(0, -3) + "y");
      return { trans: `${b.trans}（…地，副词）`, phone: b.phone ? `${b.phone}li` : "" };
    }
  }

  // 4. Plural nouns in -s or -es
  if (w.endsWith("s") && w.length > 3) {
    let base = w.slice(0, -1);
    if (dictMap.has(base)) {
      const b = dictMap.get(base);
      return { trans: `${b.trans}（复数）`, phone: b.phone ? `${b.phone}s` : "" };
    }
    if (w.endsWith("es") && dictMap.has(w.slice(0, -2))) {
      base = w.slice(0, -2);
      const b = dictMap.get(base);
      return { trans: `${b.trans}（复数）`, phone: b.phone ? `${b.phone}ɪz` : "" };
    }
    if (w.endsWith("ies") && dictMap.has(w.slice(0, -3) + "y")) {
      base = w.slice(0, -3) + "y";
      const b = dictMap.get(base);
      return { trans: `${b.trans}（复数）`, phone: b.phone ? `${b.phone}z` : "" };
    }
  }

  // 5. Past tense -ed
  if (w.endsWith("ed") && w.length > 4) {
    let base = w.slice(0, -2);
    if (dictMap.has(base)) {
      const b = dictMap.get(base);
      return { trans: `${b.trans}（过去式/过去分词）`, phone: b.phone ? `${b.phone}d` : "" };
    }
    if (dictMap.has(w.slice(0, -1))) {
      base = w.slice(0, -1);
      const b = dictMap.get(base);
      return { trans: `${b.trans}（过去式/过去分词）`, phone: b.phone ? `${b.phone}d` : "" };
    }
  }

  // 6. Present participle -ing
  if (w.endsWith("ing") && w.length > 5) {
    let base = w.slice(0, -3);
    if (dictMap.has(base)) {
      const b = dictMap.get(base);
      return { trans: `${b.trans}（现在分词/动名词）`, phone: b.phone ? `${b.phone}ɪŋ` : "" };
    }
    if (dictMap.has(base + "e")) {
      base = base + "e";
      const b = dictMap.get(base);
      return { trans: `${b.trans}（现在分词/动名词）`, phone: b.phone ? `${b.phone}ɪŋ` : "" };
    }
  }

  // 7. Comparative / Superlative -er, -est
  if (w.endsWith("er") && w.length > 4 && dictMap.has(w.slice(0, -2))) {
    const b = dictMap.get(w.slice(0, -2));
    return { trans: `${b.trans}（更…，比较级）`, phone: b.phone ? `${b.phone}ər` : "" };
  }
  if (w.endsWith("est") && w.length > 5 && dictMap.has(w.slice(0, -3))) {
    const b = dictMap.get(w.slice(0, -3));
    return { trans: `${b.trans}（最…，最高级）`, phone: b.phone ? `${b.phone}ɪst` : "" };
  }

  // 8. Negative prefixes un-, in-, dis-, non-
  if (w.startsWith("un") && w.length > 4 && dictMap.has(w.slice(2))) {
    const b = dictMap.get(w.slice(2));
    return { trans: `不…，非…（${b.trans}的反义）`, phone: b.phone };
  }
  if (w.startsWith("dis") && w.length > 5 && dictMap.has(w.slice(3))) {
    const b = dictMap.get(w.slice(3));
    return { trans: `不…，除去…（${b.trans}的反义）`, phone: b.phone };
  }

  return null;
}

function makeNaturalSentence(word, pos, trans) {
  const w = word.trim();
  const t = trans ? trans.split(/[;；,，]/)[0].replace(/^[a-z]+\.\s*/i, "").trim() : w;

  if (w === "'m" || w === "am") return { en: "I am really glad to meet you here.", zh: "我很高兴在这里见到你。" };
  if (w === "'re" || w === "are") return { en: "We are always ready to help each other.", zh: "我们随时准备互相帮助。" };
  if (w === "'s" || w === "is") return { en: "It is a wonderful opportunity for everyone.", zh: "这对每个人来说都是一个极好的机会。" };
  if (w === "a" || w === "an") return { en: "She read an inspiring book yesterday.", zh: "她昨天读了一本鼓舞人心的书。" };
  if (w === "the") return { en: "The weather was perfect for our trip.", zh: "那天的天气非常适合我们的旅行。" };

  switch (pos?.toLowerCase()) {
    case "verb":
      return {
        en: `They decided to ${w} together in the afternoon.`,
        zh: `他们决定下午一起${t}。`,
      };
    case "adjective":
      return {
        en: `She gave a very ${w} explanation during the presentation.`,
        zh: `她在演讲中给出了非常${t}的解释。`,
      };
    case "adverb":
      return {
        en: `He spoke ${w} to make his point clear.`,
        zh: `他${t}地说着，以便把观点表达清楚。`,
      };
    case "noun":
    default:
      return {
        en: `The ${w} provided valuable insights for the discussion.`,
        zh: `这个${t}为讨论提供了宝贵的见解。`,
      };
  }
}

const levels = ["a1", "a2", "b1", "b2", "c1", "c2"];
let grandTotal = 0;
let grandFixed = 0;

for (const lvl of levels) {
  const filePath = path.join(process.cwd(), "words", "en", `${lvl}.json`);
  if (!fs.existsSync(filePath)) continue;

  const words = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let fixedCount = 0;

  for (const item of words) {
    grandTotal++;
    const w = (item.word || "").toLowerCase().trim();

    // Check if current translation is dummy
    const isDummyDef =
      !item.definition_zh ||
      item.definition_zh.includes("(") ||
      item.definition_zh.toLowerCase().includes(w) ||
      item.definition_zh.startsWith(w);

    const isDummyExample =
      !item.example_zh ||
      item.example_zh.includes("这是该项目一个非常") ||
      item.example_zh.includes("在日常生活中起着至关重要的作用") ||
      item.example_zh.includes("她在会议期间");

    const match = getLemmaDefinition(w, item.pos);

    if (match) {
      if (isDummyDef) {
        item.definition_zh = match.trans;
        item.english_translation = match.trans;
        fixedCount++;
      }
      if (match.phone && (!item.ipa || item.ipa === w || item.ipa.includes(" "))) {
        item.ipa = match.phone;
      }
    } else if (isDummyDef) {
      // If no match in standard dicts, synthesize clean descriptive definition
      const cleanPos = item.pos || "noun";
      item.definition_zh = `${w}（${cleanPos}）`;
      item.english_translation = item.definition_zh;
    }

    if (isDummyExample) {
      const sentence = makeNaturalSentence(w, item.pos, item.definition_zh);
      item.example_sentence_native = sentence.en;
      item.example_sentence_english = sentence.zh;
      item.example_zh = sentence.zh;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(words), "utf8");
  grandFixed += fixedCount;
  console.log(`Level ${lvl.toUpperCase()}: total=${words.length}, enriched=${fixedCount}`);
}

console.log(`Successfully enriched ${grandFixed} words across all levels!`);
