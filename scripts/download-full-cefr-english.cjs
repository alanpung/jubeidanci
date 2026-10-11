const fs = require("fs");
const path = require("path");

const CEFRJ_URL = "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv";
const OCTANOVE_URL = "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv";

const POS_MAP = {
  n: "noun",
  noun: "noun",
  v: "verb",
  verb: "verb",
  adj: "adjective",
  adjective: "adjective",
  adv: "adverb",
  adverb: "adverb",
  prep: "preposition",
  preposition: "preposition",
  conj: "conjunction",
  conjunction: "conjunction",
  pron: "pronoun",
  pronoun: "pronoun",
  det: "determiner",
  determiner: "determiner",
  num: "numeral",
  numeral: "numeral",
  int: "interjection",
  interjection: "interjection",
  modal: "verb",
  auxiliary: "verb",
};

function normalizePos(rawPos) {
  if (!rawPos) return "noun";
  const clean = rawPos.toLowerCase().trim();
  return POS_MAP[clean] || clean || "noun";
}

function normalizeCefr(rawCefr) {
  if (!rawCefr) return "A1";
  const clean = rawCefr.toUpperCase().trim();
  if (clean.startsWith("A1")) return "A1";
  if (clean.startsWith("A2")) return "A2";
  if (clean.startsWith("B1")) return "B1";
  if (clean.startsWith("B2")) return "B2";
  if (clean.startsWith("C1")) return "C1";
  if (clean.startsWith("C2")) return "C2";
  return "A1";
}

function getDefaultTranslation(word, pos, cefrLevel) {
  const capWord = word.charAt(0).toUpperCase() + word.slice(1);
  switch (pos) {
    case "verb":
      return `to ${word} (${pos}, CEFR ${cefrLevel})`;
    case "adjective":
      return `${word} (${pos}, CEFR ${cefrLevel})`;
    case "adverb":
      return `in a ${word} manner (${pos}, CEFR ${cefrLevel})`;
    case "noun":
    default:
      return `${capWord} (${pos}, CEFR ${cefrLevel})`;
  }
}

function getDefaultExample(word, pos) {
  switch (pos) {
    case "verb":
      return `We need to ${word} this carefully.`;
    case "adjective":
      return `This is a very ${word} situation.`;
    case "adverb":
      return `She spoke ${word} during the meeting.`;
    case "noun":
    default:
      return `The ${word} was important for everyone.`;
  }
}

async function main() {
  console.log("Fetching CEFR-J (A1-B2) and Octanove (C1-C2) vocabulary datasets...");
  const [res1, res2] = await Promise.all([fetch(CEFRJ_URL), fetch(OCTANOVE_URL)]);
  const [csv1, csv2] = await Promise.all([res1.text(), res2.text()]);

  const jsonPath = path.join(process.cwd(), "words", "english.json");
  const wordMap = new Map();


  let indexCounter = 1;

  // Function to process lines from CSV
  const processCsv = (csvText) => {
    const lines = csvText.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(",");
      if (parts.length < 3) continue;

      const rawHeadword = parts[0].trim();
      const rawPos = parts[1].trim();
      const rawCefr = parts[2].trim();

      // Clean headword (handle slashes like a.m./P.M. or multi-words)
      const headwords = rawHeadword.split("/").map((w) => w.trim()).filter(Boolean);

      for (const hw of headwords) {
        const cleanWord = hw.toLowerCase().replace(/[^a-z0-9 '\-]/g, "").trim();
        if (!cleanWord || cleanWord.length < 1) continue;

        const cefr = normalizeCefr(rawCefr);
        const pos = normalizePos(rawPos);

        indexCounter++;

        if (!wordMap.has(cleanWord)) {
          wordMap.set(cleanWord, {
            word: cleanWord,
            pos: pos,
            cefr_level: cefr,
            english_translation: getDefaultTranslation(cleanWord, pos, cefr),
            example_sentence_native: getDefaultExample(cleanWord, pos),
            example_sentence_english: getDefaultExample(cleanWord, pos),
            useful_for_flashcard: true,
            word_frequency: indexCounter,
          });
        } else {
          // If word already exists, ensure proper CEFR level assignment
          const existing = wordMap.get(cleanWord);
          if (!existing.cefr_level || existing.cefr_level === "A1") {
            existing.cefr_level = cefr;
          }
        }
      }
    }
  };

  console.log("Processing CEFR-J dataset (A1, A2, B1, B2)...");
  processCsv(csv1);

  console.log("Processing Octanove dataset (C1, C2)...");
  processCsv(csv2);

  const finalWords = Array.from(wordMap.values());

  // Sort words by CEFR level and word frequency
  const levelOrder = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  finalWords.sort((a, b) => {
    const orderA = levelOrder[a.cefr_level] || 99;
    const orderB = levelOrder[b.cefr_level] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.word.localeCompare(b.word);
  });

  // Assign clean sequential frequency values per level
  finalWords.forEach((w, idx) => {
    w.word_frequency = idx + 1;
  });

  const breakdown = {};
  finalWords.forEach((w) => {
    breakdown[w.cefr_level] = (breakdown[w.cefr_level] || 0) + 1;
  });

  console.log(`Writing ${finalWords.length} total words to words/english.json...`);
  fs.writeFileSync(jsonPath, JSON.stringify(finalWords, null, 2), "utf8");

  console.log("CEFR Level Breakdown:", breakdown);
  console.log("Successfully generated words/english.json!");
}

main().catch((err) => {
  console.error("Error generating English CEFR dictionary:", err);
  process.exit(1);
});
