import type {
  Exercise,
  MultipleChoiceExercise,
  TranslationExercise,
  WritingExercise,
  FillInTheBlankExercise,
  MatchingPairsExercise,
  ListeningExercise,
  WordBankExercise,
  SpeakingExercise,
  FreeTextExercise,
  FlashcardReviewExercise,
} from "./types";
import { exerciseSchema } from "./exercise-schema";

/**
 * Parse raw markdown content (after frontmatter) into Exercise[].
 * Strips // comments, splits on [type-tag] boundaries, and parses each block.
 * `---` separators between exercises are optional and ignored.
 */
export function parseExercisesFromMarkdown(content: string): Exercise[] {
  const lines = content
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line));

  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\[.+?\]\s*$/.test(line.trim())) {
      if (current.length > 0) {
        blocks.push(current.join("\n").trim());
      }
      current = [line];
    } else if (/^\s*---\s*$/.test(line)) {
      // skip separator lines
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }

  return blocks.filter(Boolean).map(parseExercise);
}

export function parseExercise(block: string): Exercise {
  const typeMatch = block.match(/^\[(.+?)\]/);
  if (!typeMatch) throw new Error(`No exercise type found in block: ${block}`);
  const type = typeMatch[1];
  const lines = block
    .slice(typeMatch[0].length)
    .trim()
    .split("\n")
    .map((l) => l.trim());

  let exercise: Exercise;
  switch (type) {
    case "multiple-choice":
      exercise = parseMultipleChoice(lines);
      break;
    case "translation":
      exercise = parseTranslation(lines);
      break;
    case "writing":
      exercise = parseWriting(lines);
      break;
    case "fill-in-the-blank":
      exercise = parseFillInTheBlank(lines);
      break;
    case "matching-pairs":
      exercise = parseMatchingPairs(lines);
      break;
    case "listening":
      exercise = parseListening(lines);
      break;
    case "word-bank":
    case "word-order":
      exercise = parseWordBank(lines);
      break;
    case "speaking":
      exercise = parseSpeaking(lines);
      break;
    case "free-text":
      exercise = parseFreeText(lines);
      break;
    case "flashcard-review":
      exercise = parseFlashcardReview(lines);
      break;
    default:
      throw new Error(`Unknown exercise type: ${type}`);
  }

  return validateExercise(exercise);
}

/**
 * Validate a parsed exercise against the Zod schema.
 * Throws a descriptive error that AI can read and fix.
 */
function validateExercise(exercise: Exercise): Exercise {
  const result = exerciseSchema.safeParse(exercise);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  - ${path}: ${issue.message}`;
    });

    throw new Error(
      `Invalid [${exercise.type}] exercise:\n${issues.join("\n")}\n` +
      `Parsed data: ${JSON.stringify(exercise, null, 2)}`
    );
  }

  // Enforce: listening mode "choices" requires choices + correctIndex
  if (result.data.type === "listening" && result.data.mode === "choices") {
    if (!result.data.choices || result.data.correctIndex === undefined) {
      throw new Error(
        `Invalid [listening] exercise:\n  - choices: choices and correctIndex are required when mode is 'choices'\n` +
        `Parsed data: ${JSON.stringify(exercise, null, 2)}`
      );
    }
  }

  return result.data;
}

const NO_AUDIO_RE = /\s*\[no-audio\]\s*$/;

export function stripNoAudio(text: string): { text: string; flagged: boolean } {
  if (NO_AUDIO_RE.test(text)) {
    return { text: text.replace(NO_AUDIO_RE, "").trim().replace(/^"(.*)"$/, "$1"), flagged: true };
  }
  return { text, flagged: false };
}

export function getField(lines: string[], key: string): string {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  if (!line) throw new Error(`Missing field: ${key}`);
  return line.slice(key.length + 1).trim().replace(/^"(.*)"$/, "$1");
}

export function hasFlag(lines: string[], key: string): boolean {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  if (!line) return false;
  return line.slice(key.length + 1).trim() === "true";
}

export function getOptionalField(lines: string[], key: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  if (!line) return undefined;
  return line.slice(key.length + 1).trim().replace(/^"(.*)"$/, "$1");
}

function parseSrsWords(lines: string[]): string | string[] | undefined {
  const startIdx = lines.findIndex((l) => l.startsWith("srsWords:"));
  if (startIdx === -1) return undefined;

  // Inline value: srsWords: "word" or srsWords: "word1" "word2"
  const inlineValue = lines[startIdx].slice("srsWords:".length).trim();
  if (inlineValue) {
    const matches = inlineValue.match(/"([^"]+)"/g);
    if (matches) {
      const words = matches.map((m) => m.replace(/"/g, ""));
      return words.length === 1 ? words[0] : words;
    }
    // Unquoted single word
    return inlineValue;
  }

  // List format: - "word" (with optional legacy = "translation" which we ignore)
  const words: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^- "(.+?)"(\s*=\s*".*")?/);
    if (!match) break;
    words.push(match[1]);
  }
  if (words.length === 0) return undefined;
  return words.length === 1 ? words[0] : words;
}

function parseMultipleChoice(lines: string[]): MultipleChoiceExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");

  const mcSrsIdx = lines.findIndex((l) => l.startsWith("srsWords:"));
  const choiceLines = lines.filter((l, i) => l.startsWith('- "') && (mcSrsIdx === -1 || i < mcSrsIdx));
  const choices: string[] = [];
  let correctIndex = 0;

  choiceLines.forEach((line, i) => {
    const match = line.match(/^- "(.+?)"\s*(\(correct\))?/);
    if (match) {
      const c = stripNoAudio(match[1]);
      choices.push(c.text);
      if (c.flagged) noAudio.push(`choice:${i}`);
      if (match[2]) correctIndex = i;
    }
  });

  const randomOrder = hasFlag(lines, "random_order");
  const srsWords = parseSrsWords(lines) ?? "";
  return { type: "multiple-choice", text: rawText.text, choices, correctIndex, srsWords, ...(randomOrder && { randomOrder }), ...(noAudio.length && { noAudio }) };
}

function parseTranslation(lines: string[]): TranslationExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");
  const rawSentence = stripNoAudio(getField(lines, "sentence"));
  if (rawSentence.flagged) noAudio.push("sentence");

  const answer = getField(lines, "answer");
  const acceptAlsoLine = lines.find((l) => l.startsWith("acceptAlso:"));
  const acceptAlso: string[] = [];
  if (acceptAlsoLine) {
    const matches = acceptAlsoLine.match(/"([^"]+)"/g);
    if (matches) acceptAlso.push(...matches.map((m) => m.replace(/"/g, "")));
  }

  const srsWords = parseSrsWords(lines) ?? "";
  return { type: "translation", text: rawText.text, sentence: rawSentence.text, answer, acceptAlso, srsWords, ...(noAudio.length && { noAudio }) };
}

/**
 * Parse a [writing] block — the whole-essay writing exercise.
 *
 * Same field names as [translation] (see `WritingExercise`): `sentence` holds
 * the complete Chinese prompt, `answer` the model English essay and
 * `acceptAlso` the alternative phrasings. The difference is purely how the
 * player presents it: one textarea for the whole essay instead of one input
 * per word.
 */
function parseWriting(lines: string[]): WritingExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");
  const rawSentence = stripNoAudio(getField(lines, "sentence"));
  if (rawSentence.flagged) noAudio.push("sentence");

  const answer = getField(lines, "answer");
  const acceptAlsoLine = lines.find((l) => l.startsWith("acceptAlso:"));
  const acceptAlso: string[] = [];
  if (acceptAlsoLine) {
    const matches = acceptAlsoLine.match(/"([^"]+)"/g);
    if (matches) acceptAlso.push(...matches.map((m) => m.replace(/"/g, "")));
  }

  const srsWords = parseSrsWords(lines) ?? "";
  return { type: "writing", text: rawText.text, sentence: rawSentence.text, answer, acceptAlso, srsWords, ...(noAudio.length && { noAudio }) };
}

function generateChineseTranslation(sentence: string, blank: string): string | undefined {
  const completed = sentence.replace("___", blank).toLowerCase();
  const vocabMap: Record<string, string> = {
    "wake": "醒来", "wakes": "醒来", "wake up": "醒来/起床", "wakes up": "醒来/起床",
    "brush": "刷", "brushes": "刷", "teeth": "牙齿",
    "shower": "淋浴", "bath": "洗澡",
    "eat": "吃", "eats": "吃", "breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐",
    "drink": "喝", "drinks": "喝", "coffee": "咖啡", "tea": "茶", "water": "水", "juice": "果汁",
    "pack": "收拾", "packs": "收拾", "bag": "包", "backpack": "背包",
    "get": "得/穿", "gets": "得/穿", "dressed": "穿好衣服",
    "comb": "梳", "combs": "梳", "hair": "头发",
    "go": "去", "goes": "去", "school": "学校", "work": "工作", "home": "家",
    "set": "设置", "sets": "设置", "alarm": "闹钟",
    "wash": "洗", "washes": "洗", "face": "脸", "hands": "手",
    "put on": "穿上", "shoes": "鞋子", "shirt": "衬衫", "pants": "裤子",
    "father": "父亲/爸爸", "mother": "母亲/妈妈", "brother": "兄弟", "sister": "姐妹",
    "grandfather": "爷爷/外公", "grandmother": "奶奶/外婆", "uncle": "叔叔/舅舅", "aunt": "阿姨/姑姑",
    "apple": "苹果", "banana": "香蕉", "rice": "米饭", "noodles": "面条", "milk": "牛奶",
    "read": "读", "reads": "读", "book": "书", "listen": "听", "music": "音乐",
    "play": "玩/踢/打", "plays": "玩/踢/打", "football": "足球", "basketball": "篮球"
  };

  const words = completed.split(/\s+/);
  const matchedMeanings = words.map(w => vocabMap[w.replace(/[^a-z]/g, "")]).filter(Boolean);

  let pronoun = "";
  if (completed.startsWith("i ")) pronoun = "我";
  else if (completed.startsWith("you ")) pronoun = "你";
  else if (completed.startsWith("he ")) pronoun = "他";
  else if (completed.startsWith("she ")) pronoun = "她";
  else if (completed.startsWith("we ")) pronoun = "我们";
  else if (completed.startsWith("they ")) pronoun = "他们";
  else if (completed.startsWith("my ")) pronoun = "我的";

  if (matchedMeanings.length > 0) {
    const action = matchedMeanings.join("");
    return `${pronoun || ""}${action}`;
  }

  // No word in this sentence is in vocabMap, so no meaningful hint can be
  // assembled. Return nothing rather than a placeholder like "请完成句子" —
  // a missing hint is better than a misleading one. Content files should
  // carry an explicit `translation:` line for every exercise.
  return undefined;
}

function parseFillInTheBlank(lines: string[]): FillInTheBlankExercise {
  const noAudio: string[] = [];
  const rawSentence = stripNoAudio(getField(lines, "sentence"));
  if (rawSentence.flagged) noAudio.push("sentence");
  const blank = getField(lines, "blank");
  
  let translation = getOptionalField(lines, "translation");
  if (translation) {
    translation = translation.replace(/\s*\(提示:.*?\)/g, "").trim();
  }
  if (!translation) {
    translation = generateChineseTranslation(rawSentence.text, blank);
  }

  const acceptAlsoLine = lines.find((l) => l.startsWith("acceptAlso:"));
  const acceptAlso: string[] = [];
  if (acceptAlsoLine) {
    const matches = acceptAlsoLine.match(/"([^"]+)"/g);
    if (matches) acceptAlso.push(...matches.map((m) => m.replace(/"/g, "")));
  }

  const commonSynonyms: Record<string, string[]> = {
    "wake": ["get up", "awaken"],
    "wakes": ["gets up", "awakens"],
    "brush": ["clean"],
    "brushes": ["cleans"],
    "eat": ["have", "consume"],
    "eats": ["has", "consumes"],
    "drink": ["have", "sip"],
    "drinks": ["has", "sips"],
    "get": ["receive", "obtain"],
    "gets": ["receives", "obtains"],
    "go": ["travel", "head"],
    "goes": ["travels", "heads"],
    "watch": ["view", "see"],
    "watches": ["views", "sees"],
    "take": ["have", "grab"],
    "takes": ["has", "grabs"],
    "make": ["prepare"],
    "makes": ["prepares"],
    "read": ["browse"],
    "reads": ["browses"],
    "listen": ["hear"],
    "listens": ["hears"],
    "play": ["do"],
    "plays": ["does"],
    "clean": ["tidy", "wash"],
    "cleans": ["tidies", "washes"],
    "cook": ["prepare"],
    "cooks": ["prepares"],
    "buy": ["purchase"],
    "buys": ["purchases"],
    "walk": ["stroll"],
    "walks": ["strolls"],
    "arrive": ["reach", "get"],
    "arrives": ["reaches", "gets"],
    "leave": ["depart"],
    "leaves": ["departs"],
    "start": ["begin"],
    "starts": ["begins"],
    "finish": ["complete", "end"],
    "finishes": ["completes", "ends"],
    "feel": ["experience"],
    "feels": ["experiences"],
    "sleep": ["rest"],
    "sleeps": ["rests"],
    "use": ["utilize"],
    "uses": ["utilizes"],
    "wear": ["put on"],
    "wears": ["puts on"],
    "check": ["inspect"],
    "checks": ["inspects"],
    "set": ["put"],
    "sets": ["puts"],
    "wash": ["clean"],
    "washes": ["cleans"],
    "write": ["jot"],
    "writes": ["jots"],
    "sit": ["take a seat"],
    "sits": ["takes a seat"],
    "meet": ["see"],
    "meets": ["sees"],
    "visit": ["see"],
    "visits": ["sees"],
    "enjoy": ["like"],
    "enjoys": ["likes"],
    "sweep": ["clean"],
    "sweeps": ["cleans"],
    "water": ["irrigate"],
    "waters": ["irrigates"],
    "fold": ["bend"],
    "folds": ["bends"],
    "lock": ["secure"],
    "locks": ["secures"],
    "say": ["tell"],
    "says": ["tells"],
    "fall": ["drop"],
    "falls": ["drops"]
  };

  const parts = rawSentence.text.split("___");
  const nextWord = parts[1] ? parts[1].trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") : "";

  const lowerBlank = blank.toLowerCase().trim();
  if (commonSynonyms[lowerBlank]) {
    for (let alt of commonSynonyms[lowerBlank]) {
      const altWords = alt.split(/\s+/);
      if (nextWord && altWords.length > 1 && altWords[altWords.length - 1].toLowerCase() === nextWord) {
        alt = altWords.slice(0, -1).join(" ");
      }
      if (!acceptAlso.some(a => a.toLowerCase() === alt.toLowerCase()) && alt.toLowerCase() !== lowerBlank) {
        acceptAlso.push(alt);
      }
    }
  }

  // Clean up any existing acceptAlso entries if particle matches nextWord
  for (let i = 0; i < acceptAlso.length; i++) {
    const aWords = acceptAlso[i].split(/\s+/);
    if (nextWord && aWords.length > 1 && aWords[aWords.length - 1].toLowerCase() === nextWord) {
      acceptAlso[i] = aWords.slice(0, -1).join(" ");
    }
  }

  const srsWords = parseSrsWords(lines) ?? "";
  return { 
    type: "fill-in-the-blank", 
    sentence: rawSentence.text, 
    blank, 
    translation,
    acceptAlso, 
    srsWords, 
    ...(noAudio.length && { noAudio }) 
  };
}

function parseMatchingPairs(lines: string[]): MatchingPairsExercise {
  const noAudio: string[] = [];
  const srsIdx = lines.findIndex((l) => l.startsWith("srsWords:"));
  const pairLines = lines.filter((l, i) => l.startsWith("- ") && (srsIdx === -1 || i < srsIdx));
  const pairs = pairLines.map((l, i) => {
    const match = l.match(/^- "(.+?)"\s*=\s*"(.+?)"/);
    if (!match) throw new Error(`Invalid pair: ${l}`);
    const left = stripNoAudio(match[1]);
    const right = stripNoAudio(match[2]);
    if (left.flagged) noAudio.push(`left:${i}`);
    if (right.flagged) noAudio.push(`right:${i}`);
    return { left: left.text, right: right.text };
  });
  const randomOrder = hasFlag(lines, "random_order");
  const srsWords = parseSrsWords(lines) ?? (pairs.length === 1 ? pairs[0].left : pairs.map((p) => p.left));
  return { type: "matching-pairs", pairs, srsWords, ...(randomOrder && { randomOrder }), ...(noAudio.length && { noAudio }) };
}

function parseListening(lines: string[]): ListeningExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");
  const ttsLang = getField(lines, "ttsLang");
  const mode = getOptionalField(lines, "mode") as "choices" | "word-bank" | undefined;
  const srsWords = parseSrsWords(lines) ?? "";

  // Parse author-provided choices when mode is "choices"
  let choices: string[] | undefined;
  let correctIndex: number | undefined;
  if (mode === "choices") {
    const srsIdx = lines.findIndex((l) => l.startsWith("srsWords:"));
    const choiceLines = lines.filter((l, i) => l.startsWith('- "') && (srsIdx === -1 || i < srsIdx));
    choices = [];
    correctIndex = 0;
    choiceLines.forEach((line, i) => {
      const match = line.match(/^- "(.+?)"\s*(\(correct\))?/);
      if (match) {
        const c = stripNoAudio(match[1]);
        choices!.push(c.text);
        if (c.flagged) noAudio.push(`choice:${i}`);
        if (match[2]) correctIndex = i;
      }
    });
  }

  return {
    type: "listening",
    text: rawText.text,
    ttsLang,
    srsWords,
    ...(mode && { mode }),
    ...(choices && { choices, correctIndex }),
    ...(noAudio.length && { noAudio }),
  };
}

function parseSpeaking(lines: string[]): SpeakingExercise {
  const noAudio: string[] = [];
  const rawSentence = stripNoAudio(getField(lines, "sentence"));
  if (rawSentence.flagged) noAudio.push("sentence");
  const srsWords = parseSrsWords(lines) ?? "";
  return { type: "speaking", sentence: rawSentence.text, srsWords, ...(noAudio.length && { noAudio }) };
}

function parseFreeText(lines: string[]): FreeTextExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");
  const afterSubmitPrompt = getField(lines, "afterSubmitPrompt");
  const srsWords = parseSrsWords(lines);
  return { type: "free-text", text: rawText.text, afterSubmitPrompt, ...(srsWords && { srsWords }), ...(noAudio.length && { noAudio }) };
}

function parseWordBank(lines: string[]): WordBankExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");
  const wordsLine = lines.find((l) => l.startsWith("words:"));
  const answerLine = lines.find((l) => l.startsWith("answer:"));
  const words = wordsLine
    ? (wordsLine.match(/"([^"]+)"/g) || []).map((m) => {
        const w = stripNoAudio(m.replace(/"/g, ""));
        if (w.flagged) noAudio.push(`word:${w.text}`);
        return w.text;
      })
    : [];
  const answer = answerLine
    ? (answerLine.match(/"([^"]+)"/g) || []).map((m) => m.replace(/"/g, ""))
    : [];
  const randomOrder = hasFlag(lines, "random_order");
  const srsWords = parseSrsWords(lines) ?? "";
  return { type: "word-bank", text: rawText.text, words, answer, srsWords, ...(randomOrder && { randomOrder }), ...(noAudio.length && { noAudio }) };
}

function parseFlashcardReview(lines: string[]): FlashcardReviewExercise {
  const front = getField(lines, "front");
  const back = getOptionalField(lines, "back") || "";
  const meaning = getOptionalField(lines, "meaning");
  const translation = getOptionalField(lines, "translation");
  const pos = getOptionalField(lines, "pos");
  const ipa = getOptionalField(lines, "ipa");
  const level = getOptionalField(lines, "level") || getOptionalField(lines, "cefrLevel");
  const srsWords = parseSrsWords(lines) ?? "";
  const finalBack = back || [meaning, translation].filter(Boolean).join("\n") || "";
  return {
    type: "flashcard-review",
    front,
    back: finalBack,
    ...(meaning && { meaning }),
    ...(translation && { translation }),
    ...(pos && { pos }),
    ...(ipa && { ipa }),
    ...(level && { level, cefrLevel: level }),
    srsWords,
  };
}
