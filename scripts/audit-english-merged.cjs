#!/usr/bin/env node
/**
 * Report-only quality checks for words/english_merged.json.
 *
 * This script never modifies dictionary data. It reports objective gaps and
 * heuristic warnings for human review; it cannot establish that a definition,
 * IPA transcription, or example is linguistically correct.
 *
 * Usage: node scripts/audit-english-merged.cjs
 *        node scripts/audit-english-merged.cjs --json
 */
const fs = require("node:fs");
const path = require("node:path");

const DICT_PATH = path.join(process.cwd(), "words", "english_merged.json");
const asText = (value) => (typeof value === "string" ? value.trim() : "");
const hasChinese = (value) => /[\u3400-\u9fff]/u.test(value);
const canonicalPos = new Set([
  "noun", "n", "verb", "v", "vt", "vi", "be-verb", "have-verb", "do-verb",
  "adjective", "adj", "a", "s", "adverb", "adv", "r", "preposition", "prep", "pp",
  "conjunction", "conj", "cj", "pronoun", "pron", "pn", "determiner", "det",
  "article", "art", "numeral", "num", "number", "interjection", "intj", "int", "interj",
  "auxiliary", "aux", "modal", "phrase", "idiom", "abbreviation", "abbr",
  "adjectival", "adverbial", "proper noun", "pronoun/determiner",
]);
const normalizeTag = (part) => part.toLowerCase().trim().replace(/\.$/, "");

if (!fs.existsSync(DICT_PATH)) {
  console.error(`Dictionary not found: ${DICT_PATH}`);
  process.exit(1);
}

let entries;
try {
  entries = JSON.parse(fs.readFileSync(DICT_PATH, "utf8"));
} catch (error) {
  console.error(`Could not parse ${DICT_PATH}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(entries)) {
  console.error("Expected the dictionary root to be a JSON array.");
  process.exit(1);
}

const findings = [];
const seenWords = new Map();
const flag = (index, word, field, category, value, note) => {
  findings.push({ index, word: word || "<missing word>", field, category, value, note });
};

entries.forEach((entry, index) => {
  const word = asText(entry?.word);
  const row = index + 1;
  if (!word) flag(row, word, "word", "missing", "", "No usable headword.");
  else {
    const key = word.toLowerCase();
    if (seenWords.has(key)) {
      flag(row, word, "word", "duplicate", word, `Also appears at array row ${seenWords.get(key)}.`);
    } else seenWords.set(key, row);
  }

  const ipa = asText(entry?.ipa);
  if (!ipa) flag(row, word, "ipa", "missing", "", "No pronunciation supplied.");
  else {
    if (ipa.toLowerCase() === word.toLowerCase()) {
      flag(row, word, "ipa", "suspicious", ipa, "IPA field is identical to the headword.");
    }
    if (/[\u3400-\u9fff]/u.test(ipa) || /[<>]|https?:\/\//i.test(ipa)) {
      flag(row, word, "ipa", "suspicious", ipa, "Contains non-phonetic text or markup; review manually.");
    }
  }

  const pos = asText(entry?.pos);
  if (!pos) flag(row, word, "pos", "missing", "", "No part-of-speech tag supplied.");
  else {
    const tags = pos.split(/[,/;|]+|\s+(?!noun\b)/i).map(normalizeTag).filter(Boolean);
    const unknown = tags.filter((tag) => !canonicalPos.has(tag));
    if (unknown.length) {
      flag(row, word, "pos", "unrecognized", pos, `Unrecognized tag(s): ${unknown.join(", ")}.`);
    }
  }

  const zh = asText(entry?.definition_zh);
  if (!zh) flag(row, word, "definition_zh", "missing", "", "No Chinese definition supplied.");
  else if (!hasChinese(zh)) {
    flag(row, word, "definition_zh", "suspicious", zh, "No Chinese characters; may be a placeholder or untranslated gloss.");
  } else if (word && zh.toLowerCase() === word.toLowerCase()) {
    flag(row, word, "definition_zh", "suspicious", zh, "Chinese definition is identical to the headword.");
  }

  const en = asText(entry?.english_translation);
  if (!en) flag(row, word, "english_translation", "missing", "", "No English gloss supplied.");
  else if (hasChinese(en)) {
    flag(row, word, "english_translation", "suspicious", en, "English gloss contains Chinese; check field placement.");
  } else if (word && en.toLowerCase() === word.toLowerCase()) {
    flag(row, word, "english_translation", "suspicious", en, "English gloss is only the headword.");
  }

  const example = asText(entry?.example_sentence_english);
  if (!example) flag(row, word, "example_sentence_english", "missing", "", "No example sentence supplied.");
  else {
    if (hasChinese(example)) {
      flag(row, word, "example_sentence_english", "suspicious", example, "Example field contains Chinese; verify whether it is an English sentence or translation.");
    }
    if (/this is an example using the word|example sentence for|\bword\s+["']?\w+["']?\s+is used here/i.test(example)) {
      flag(row, word, "example_sentence_english", "placeholder", example, "Looks like a generic placeholder rather than a contextual example.");
    }
    if (word && example.toLowerCase() === word.toLowerCase()) {
      flag(row, word, "example_sentence_english", "placeholder", example, "Example is only the headword.");
    }
    if (!/[.!?]["')\]]?$/u.test(example)) {
      flag(row, word, "example_sentence_english", "suspicious", example, "Does not end with sentence punctuation.");
    }
  }
});

const counts = Object.fromEntries([...new Set(findings.map((item) => item.category))]
  .map((category) => [category, findings.filter((item) => item.category === category).length]));
const report = {
  file: path.relative(process.cwd(), DICT_PATH),
  entries: entries.length,
  findings: findings.length,
  counts,
  note: "Heuristic audit only; suspicious items require human review. No files were modified.",
  items: findings,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Dictionary audit: ${report.file}`);
  console.log(`Entries: ${report.entries}; findings: ${report.findings}`);
  console.log("Findings by category:", Object.keys(counts).length ? counts : "none");
  if (findings.length) {
    console.log("\nrow\tword\tfield\tcategory\tnote\tvalue");
    for (const item of findings) {
      const safe = (value) => String(value).replace(/[\t\r\n]+/g, " ");
      console.log([item.index, item.word, item.field, item.category, item.note, item.value]
        .map(safe).join("\t"));
    }
  }
  console.log(`\n${report.note}`);
}
