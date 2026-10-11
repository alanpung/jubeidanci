const fs = require("fs");
const path = require("path");

const contentDir = path.join(process.cwd(), "content");

// 1. Collect all 2000 words already used in A1 and A2 flashcard units
const existingUnitFiles = fs
  .readdirSync(contentDir)
  .filter((f) => /^(a1|a2)-flashcard-unit-\d+\.md$/.test(f));

const usedWords = new Set();
for (const file of existingUnitFiles) {
  const txt = fs.readFileSync(path.join(contentDir, file), "utf8");
  const matches = [...txt.matchAll(/^srsWords:\s*"([^"]+)"/gm)];
  for (const m of matches) {
    usedWords.add(m[1].toLowerCase().trim());
  }
}

console.log(`Initial used words in A1 + A2 units: ${usedWords.size}`);

// 2. Load english_merged.json and words/en/b1..c2.json
const mergedPath = path.join(process.cwd(), "words", "english_merged.json");
const merged = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
const mergedMap = new Map();
for (const w of merged) {
  const lower = (w.word || "").toLowerCase().trim();
  if (lower) mergedMap.set(lower, w);
}

const enFiles = {
  B1: JSON.parse(fs.readFileSync(path.join(process.cwd(), "words/en/b1.json"), "utf8")),
  B2: JSON.parse(fs.readFileSync(path.join(process.cwd(), "words/en/b2.json"), "utf8")),
  C1: JSON.parse(fs.readFileSync(path.join(process.cwd(), "words/en/c1.json"), "utf8")),
  C2: JSON.parse(fs.readFileSync(path.join(process.cwd(), "words/en/c2.json"), "utf8")),
};

function sanitizeYamlString(str) {
  if (!str) return "";
  return String(str)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .trim();
}

const courseConfig = {
  B1: {
    id: "b1-flashcard-course",
    courseTitle: "B1 Flashcard",
    description: "Comprehensive B1 Intermediate Flashcard Vocabulary Course with 10 Units (1,000 Words total) by Alan P",
    level: "B1",
    units: [
      { title: "Social Interactions & Opinions", icon: "🗣️", color: "#2196F3" },
      { title: "Travel, Tourism & Exploration", icon: "🧳", color: "#00BCD4" },
      { title: "Work, Business & Ambition", icon: "💼", color: "#3F51B5" },
      { title: "Education, Learning & Skills", icon: "🎓", color: "#4CAF50" },
      { title: "Media, News & Communication", icon: "📰", color: "#FF9800" },
      { title: "Health, Lifestyle & Well-being", icon: "🧘", color: "#E91E63" },
      { title: "Environment, Climate & Nature", icon: "🌱", color: "#009688" },
      { title: "Science, Technology & Innovation", icon: "🔬", color: "#673AB7" },
      { title: "Arts, Literature & Entertainment", icon: "🎭", color: "#9C27B0" },
      { title: "Society, Law & Community", icon: "⚖️", color: "#FF5722" },
    ],
  },
  B2: {
    id: "b2-flashcard-course",
    courseTitle: "B2 Flashcard",
    description: "Comprehensive B2 Upper-Intermediate Flashcard Vocabulary Course with 10 Units (1,000 Words total) by Alan P",
    level: "B2",
    units: [
      { title: "Global Issues & Politics", icon: "🌐", color: "#3F51B5" },
      { title: "Economy, Finance & Trade", icon: "📈", color: "#4CAF50" },
      { title: "Psychology, Emotion & Behavior", icon: "🧠", color: "#E91E63" },
      { title: "Science, Research & Discovery", icon: "🧪", color: "#00BCD4" },
      { title: "Media, Journalism & Ethics", icon: "🎙️", color: "#FF9800" },
      { title: "Law, Crime & Justice", icon: "🏛️", color: "#607D8B" },
      { title: "Environment, Sustainability & Energy", icon: "♻️", color: "#009688" },
      { title: "Culture, Heritage & Philosophy", icon: "🏺", color: "#9C27B0" },
      { title: "Workplace, Management & Strategy", icon: "📊", color: "#2196F3" },
      { title: "Academic & Analytical Discourse", icon: "📑", color: "#673AB7" },
    ],
  },
  C1: {
    id: "c1-flashcard-course",
    courseTitle: "C1 Flashcard",
    description: "Comprehensive C1 Advanced Flashcard Vocabulary Course with 10 Units (1,000 Words total) by Alan P",
    level: "C1",
    units: [
      { title: "Academic Research & Methodology", icon: "🏛️", color: "#673AB7" },
      { title: "Rhetoric, Persuasion & Debate", icon: "🎙️", color: "#E91E63" },
      { title: "Macroeconomics & Global Markets", icon: "💹", color: "#4CAF50" },
      { title: "Diplomacy, Governance & Policy", icon: "🤝", color: "#3F51B5" },
      { title: "Scientific Inquiry & Ethics", icon: "🧬", color: "#00BCD4" },
      { title: "Philosophy, Cognition & Mind", icon: "💡", color: "#FF9800" },
      { title: "Sociology, Demographics & Culture", icon: "🌍", color: "#009688" },
      { title: "Jurisprudence & Constitutional Law", icon: "⚖️", color: "#795548" },
      { title: "Literary Criticism & Aesthetics", icon: "🖋️", color: "#9C27B0" },
      { title: "Advanced Idiomatic & Nuanced Expression", icon: "✨", color: "#2196F3" },
    ],
  },
  C2: {
    id: "c2-flashcard-course",
    courseTitle: "C2 Flashcard",
    description: "Comprehensive C2 Mastery Flashcard Vocabulary Course with 10 Units (1,000 Words total) by Alan P",
    level: "C2",
    units: [
      { title: "Epistemology & Abstract Thought", icon: "🔮", color: "#9C27B0" },
      { title: "High Rhetoric & Oratory Mastery", icon: "📜", color: "#3F51B5" },
      { title: "Geopolitics & Statecraft", icon: "♟️", color: "#607D8B" },
      { title: "Jurisprudence, Equity & Doctrine", icon: "🏛️", color: "#795548" },
      { title: "Aesthetics, Artistry & Critique", icon: "🎨", color: "#E91E63" },
      { title: "Scientific Paradigms & Complexity", icon: "🌌", color: "#00BCD4" },
      { title: "Socio-Economic Theory & Institutions", icon: "🏦", color: "#4CAF50" },
      { title: "Psychological Nuance & Temperament", icon: "🎭", color: "#FF9800" },
      { title: "Archaic, Formal & Erudite Register", icon: "✒️", color: "#673AB7" },
      { title: "Apex Lexical Precision & Idiom", icon: "👑", color: "#009688" },
    ],
  },
};

for (const lvl of ["B1", "B2", "C1", "C2"]) {
  const selected = [];

  // Pass 1: words in words/en/<lvl>.json that also have level === lvl in english_merged.json
  for (const item of enFiles[lvl]) {
    if (selected.length >= 1000) break;
    const word = (item.word || "").trim();
    const lower = word.toLowerCase();
    if (word.length < 2 || !/^[a-zA-Z][a-zA-Z\-]*$/.test(word) || usedWords.has(lower)) continue;
    const m = mergedMap.get(lower);
    if (!m) continue;
    const mLvl = (m.cefr_level || m.level || "").toUpperCase();
    if (mLvl === lvl && (item.translation_zh || m.definition_zh) && (item.meaning || m.english_translation)) {
      usedWords.add(lower);
      selected.push({
        word: m.word || word,
        meaning: sanitizeYamlString(m.english_translation || item.meaning || word),
        translation: sanitizeYamlString(m.definition_zh || item.translation_zh || m.english_translation || word),
      });
    }
  }

  // Pass 2: if < 1000, pick from remaining words in english_merged.json that have cefr_level === lvl
  if (selected.length < 1000) {
    const candidates = merged.filter((m) => {
      const word = (m.word || "").trim();
      const lower = word.toLowerCase();
      const mLvl = (m.cefr_level || m.level || "").toUpperCase();
      return (
        mLvl === lvl &&
        word.length >= 4 &&
        /^[a-zA-Z][a-zA-Z\-]*$/.test(word) &&
        !usedWords.has(lower) &&
        m.definition_zh &&
        m.english_translation
      );
    });

    for (const m of candidates) {
      if (selected.length >= 1000) break;
      const word = (m.word || "").trim();
      const lower = word.toLowerCase();
      usedWords.add(lower);
      selected.push({
        word,
        meaning: sanitizeYamlString(m.english_translation || word),
        translation: sanitizeYamlString(m.definition_zh || m.english_translation || word),
      });
    }
  }

  if (selected.length !== 1000) {
    throw new Error(`Expected 1000 words for ${lvl}, got ${selected.length}`);
  }

  const cfg = courseConfig[lvl];
  const lowerLvl = lvl.toLowerCase();

  // Write course markdown file
  const courseMd = [
    "---",
    `id: "${cfg.id}"`,
    `courseTitle: "${cfg.courseTitle}"`,
    `description: "${cfg.description}"`,
    `sourceLanguage: "en"`,
    `targetLanguage: "en"`,
    `level: "${cfg.level}"`,
    "---",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(contentDir, `${lowerLvl}-flashcard-course.md`), courseMd, "utf8");

  // Write 10 unit markdown files (100 words each: 10 lessons x 10 words)
  for (let uIdx = 0; uIdx < 10; uIdx++) {
    const unitNum = uIdx + 1;
    const uMeta = cfg.units[uIdx];
    const unitWords = selected.slice(uIdx * 100, (uIdx + 1) * 100);

    const lines = [
      "---",
      `unitTitle: "Unit ${unitNum}: ${uMeta.title}"`,
      `description: "${uMeta.title} - 100 ${lvl} Flashcard Vocabulary Words (10 Lessons x 10 Words)"`,
      `icon: "${uMeta.icon}"`,
      `color: "${uMeta.color}"`,
      `targetLanguage: "en"`,
      `sourceLanguage: "en"`,
      `level: "${lvl}"`,
      `courseId: "${cfg.id}"`,
      `questionType: "flashcard-review"`,
      "---",
    ];

    for (let lIdx = 0; lIdx < 10; lIdx++) {
      const lessonNum = lIdx + 1;
      const lessonWords = unitWords.slice(lIdx * 10, (lIdx + 1) * 10);
      lines.push(
        "---",
        `lessonTitle: "Lesson ${lessonNum}: ${uMeta.title} Part ${lessonNum}"`,
        `description: "Practice 10 key ${lvl} vocabulary flashcards for ${uMeta.title}"`,
        `icon: "${uMeta.icon}"`,
        `color: "${uMeta.color}"`,
        "---"
      );

      lessonWords.forEach((w, wIdx) => {
        lines.push(
          "[flashcard-review]",
          `front: "${sanitizeYamlString(w.word)}"`,
          `meaning: "${w.meaning}"`,
          `translation: "${w.translation}"`,
          `srsWords: "${sanitizeYamlString(w.word)}"`
        );
        if (wIdx < lessonWords.length - 1) {
          lines.push("");
        }
      });
    }

    lines.push("");
    fs.writeFileSync(
      path.join(contentDir, `${lowerLvl}-flashcard-unit-${unitNum}.md`),
      lines.join("\n"),
      "utf8"
    );
  }

  console.log(`Generated ${lvl} course and 10 units (${selected.length} words)`);
}

console.log(`Total unique words across A1-C2 flashcard courses: ${usedWords.size}`);
