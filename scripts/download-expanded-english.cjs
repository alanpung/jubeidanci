const fs = require("fs");
const path = require("path");

const EN_FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";
const GOOGLE_10K_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt";
const KO_FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ko/ko_50k.txt";

const POS_GUESSES = {
  ing: "verb",
  ed: "verb",
  ly: "adverb",
  able: "adjective",
  ible: "adjective",
  ful: "adjective",
  less: "adjective",
  ous: "adjective",
  ive: "adjective",
  ment: "noun",
  tion: "noun",
  sion: "noun",
  ness: "noun",
  ity: "noun",
  er: "noun",
  or: "noun",
  ism: "noun",
  ist: "noun",
};

function guessPos(word) {
  const w = word.toLowerCase();
  for (const [suffix, pos] of Object.entries(POS_GUESSES)) {
    if (w.endsWith(suffix) && w.length > suffix.length + 2) {
      return pos;
    }
  }
  return "noun";
}

function assignCefrLevel(rank) {
  if (rank <= 1000) return "A1";
  if (rank <= 2500) return "A2";
  if (rank <= 5000) return "B1";
  if (rank <= 10000) return "B2";
  if (rank <= 16000) return "C1";
  return "C2";
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
      return `We must ${word} this carefully.`;
    case "adjective":
      return `This is a very ${word} approach.`;
    case "adverb":
      return `She reacted ${word} to the news.`;
    case "noun":
    default:
      return `The ${word} plays an important role.`;
  }
}

async function processEnglish() {
  console.log("Reading existing words/english.json...");
  const jsonPath = path.join(process.cwd(), "words", "english.json");
  let existingWords = [];
  if (fs.existsSync(jsonPath)) {
    existingWords = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }
  console.log(`Current English entries: ${existingWords.length}`);

  const wordMap = new Map();

  // Load existing words into Map
  existingWords.forEach((item) => {
    if (item && item.word) {
      const key = item.word.toLowerCase().trim();
      wordMap.set(key, {
        word: key,
        pos: item.pos || "noun",
        cefr_level: item.cefr_level || "A1",
        english_translation: item.english_translation || item.word,
        example_sentence_native: item.example_sentence_native || getDefaultExample(key, item.pos || "noun"),
        example_sentence_english: item.example_sentence_english || getDefaultExample(key, item.pos || "noun"),
        useful_for_flashcard: item.useful_for_flashcard !== false,
        word_frequency: item.word_frequency || 1000,
        goethe_b1_wordlist: item.goethe_b1_wordlist || false,
      });
    }
  });

  console.log("Fetching Google 10k English word list...");
  const resGoogle = await fetch(GOOGLE_10K_URL);
  const textGoogle = await resGoogle.text();
  const googleWords = textGoogle.split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean);

  let rankCounter = 1;
  googleWords.forEach((w) => {
    if (!/^[a-z]{2,20}$/.test(w)) return;
    rankCounter++;
    if (!wordMap.has(w)) {
      const pos = guessPos(w);
      const cefr = assignCefrLevel(rankCounter);
      wordMap.set(w, {
        word: w,
        pos: pos,
        cefr_level: cefr,
        english_translation: getDefaultTranslation(w, pos, cefr),
        example_sentence_native: getDefaultExample(w, pos),
        example_sentence_english: getDefaultExample(w, pos),
        useful_for_flashcard: true,
        word_frequency: rankCounter,
      });
    }
  });

  console.log("Fetching HermitDave 50k English frequency list...");
  const res50k = await fetch(EN_FREQ_URL);
  const text50k = await res50k.text();
  const lines50k = text50k.split("\n");

  let freqRank = 10000;
  for (const line of lines50k) {
    if (wordMap.size >= 22000) break; // Expand English up to 22,000 words!
    const parts = line.trim().split(" ");
    if (!parts[0]) continue;
    const w = parts[0].toLowerCase();
    if (!/^[a-z]{2,20}$/.test(w)) continue;

    freqRank++;
    if (!wordMap.has(w)) {
      const pos = guessPos(w);
      const cefr = assignCefrLevel(freqRank);
      wordMap.set(w, {
        word: w,
        pos: pos,
        cefr_level: cefr,
        english_translation: getDefaultTranslation(w, pos, cefr),
        example_sentence_native: getDefaultExample(w, pos),
        example_sentence_english: getDefaultExample(w, pos),
        useful_for_flashcard: true,
        word_frequency: freqRank,
      });
    }
  }

  const finalWords = Array.from(wordMap.values());

  const levelOrder = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  finalWords.sort((a, b) => {
    const orderA = levelOrder[a.cefr_level] || 99;
    const orderB = levelOrder[b.cefr_level] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.word_frequency || 99999) - (b.word_frequency || 99999);
  });

  finalWords.forEach((w, idx) => {
    w.word_frequency = idx + 1;
  });

  const breakdown = {};
  finalWords.forEach((w) => {
    breakdown[w.cefr_level] = (breakdown[w.cefr_level] || 0) + 1;
  });

  console.log(`Saving ${finalWords.length} English words to words/english.json...`);
  fs.writeFileSync(jsonPath, JSON.stringify(finalWords, null, 2), "utf8");
  console.log("CEFR Breakdown for English:", breakdown);
}

async function processKorean() {
  console.log("Checking words/korean.json...");
  const jsonPath = path.join(process.cwd(), "words", "korean.json");
  let existing = [];
  if (fs.existsSync(jsonPath)) {
    existing = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }

  const map = new Map();
  existing.forEach((w) => {
    if (w && w.word) map.set(w.word, w);
  });

  console.log("Fetching Korean frequency list...");
  const res = await fetch(KO_FREQ_URL);
  const text = await res.text();
  const lines = text.split("\n");

  let count = 0;
  for (const line of lines) {
    if (map.size >= 1500) break;
    const parts = line.trim().split(" ");
    if (!parts[0]) continue;
    const word = parts[0];
    if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(word) && word.length >= 1 && word.length <= 10) {
      count++;
      if (!map.has(word)) {
        const cefr = count <= 200 ? "A1" : count <= 600 ? "A2" : count <= 1000 ? "B1" : count <= 1300 ? "B2" : "C1";
        map.set(word, {
          word: word,
          pos: "noun",
          cefr_level: cefr,
          english_translation: `${word} (Korean word, level ${cefr})`,
          example_sentence_native: `${word} 예문입니다.`,
          example_sentence_english: `This is an example for ${word}.`,
          useful_for_flashcard: true,
          word_frequency: count,
        });
      }
    }
  }

  const finalKo = Array.from(map.values());
  console.log(`Saving ${finalKo.length} Korean words to words/korean.json...`);
  fs.writeFileSync(jsonPath, JSON.stringify(finalKo, null, 2), "utf8");
}

async function main() {
  await processEnglish();
  await processKorean();
  console.log("All downloads & processing finished!");
}

main().catch(console.error);
