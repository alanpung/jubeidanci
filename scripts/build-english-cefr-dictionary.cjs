const fs = require("fs");
const path = require("path");
const { generateText } = require("ai");
const { createGoogleGenerativeAI } = require("@ai-sdk/google");

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Target vocabulary lists for C1 and C2 levels to guarantee thorough coverage
const C1_WORD_TARGETS = [
  "alleviate", "advocate", "articulate", "ambiguous", "autonomous", "coherent",
  "consecutive", "cumbersome", "depict", "deteriorate", "differentiate", "discrepancy",
  "elaborate", "eloquent", "empathy", "enhance", "erroneous", "evoke",
  "exemplify", "feasible", "fluctuate", "foster", "hierarchy", "hypothesis",
  "implicit", "incentive", "inevitable", "inherent", "integrate", "intricate", "intriguing",
  "jeopardize", "legitimate", "lucrative", "meticulous", "notion", "objective", "obscure",
  "plausible", "pragmatic", "prevalent", "profound", "prominent", "reconcile", "resilient",
  "scrutiny", "subsequent", "subtle", "tangible", "unprecedented", "versatile", "vulnerable"
];

const C2_WORD_TARGETS = [
  "aberration", "acquiesce", "anachronism", "antecedent", "capricious", "cogent",
  "deleterious", "dichotomy", "ebullient", "eclectic", "egregious", "ephemeral",
  "equanimity", "esoteric", "exacerbate", "fastidious", "gratuitous", "idiosyncrasy",
  "impetuous", "indefatigable", "ineffable", "insidious", "juxtaposition", "laconic",
  "magnanimous", "maverick", "nefarious", "obfuscate", "obsequious", "ostentatious",
  "paradigmatic", "perfunctory", "perspicacious", "platitude", "pragmatism", "quixotic",
  "recalcitrant", "sagacious", "salient", "sanguine", "scrupulous", "serendipity",
  "spurious", "stoic", "surreptitious", "sycophant", "taciturn", "tenacious",
  "truculent", "ubiquitous", "unequivocal", "venerable", "veracity", "zealot"
];

const B2_WORD_TARGETS = [
  "abandon", "abundant", "accumulate", "acquire", "adequate", "adjacent",
  "advocate", "allocate", "alter", "amend", "analyze", "apparent",
  "apprehend", "arbitrary", "assert", "assess", "attribute", "benefit",
  "bias", "capable", "clarify", "coincide", "collapse", "command",
  "compensate", "compile", "comply", "comprehend", "conceive", "concede",
  "conclude", "condense", "conduct", "conform", "consent", "considerable",
  "consistent", "constitute", "constrain", "consult", "consume", "contemplate",
  "contend", "contradict", "contribute", "convene", "convey", "crucial",
  "deduce", "defend", "demonstrate", "denote", "depict", "derive",
  "designate", "deviate", "devise", "diminish", "discrete", "displace",
  "dispose", "distinct", "distort", "diverse", "dominate", "draft"
];

async function generateBatch(level, wordList) {
  const prompt = `Generate a JSON array of English dictionary entries for the following ${level} level words:
${JSON.stringify(wordList)}

Each object in the JSON array MUST strictly match this JSON structure:
[
  {
    "word": "lowercase_english_word",
    "pos": "noun|verb|adjective|adverb|preposition|conjunction",
    "cefr_level": "${level}",
    "english_translation": "Concise English definition and Chinese translation (e.g. Meticulous: showing great care; 细致的)",
    "example_sentence_native": "Natural English sentence demonstrating usage",
    "example_sentence_english": "Chinese translation of the example sentence",
    "useful_for_flashcard": true,
    "word_frequency": 3000
  }
]

IMPORTANT:
- Return ONLY valid JSON array. No markdown formatting, no code blocks, no preamble.`;

  try {
    const { text } = await generateText({
      model: google("gemini-3.8-flash"),
      prompt,
    });

    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Failed to generate batch for level ${level}:`, err.message);
    return [];
  }
}

async function main() {
  console.log("Loading existing words from words/english.json...");
  const raw = fs.readFileSync("words/english.json", "utf8");
  const existingWords = JSON.parse(raw);
  console.log(`Existing valid words: ${existingWords.length}`);

  const wordMap = new Map();
  existingWords.forEach((w) => {
    if (w.word) {
      wordMap.set(w.word.toLowerCase().trim(), w);
    }
  });

  console.log("Generating B2 level batch...");
  const b2Generated = await generateBatch("B2", B2_WORD_TARGETS);
  console.log(`Generated ${b2Generated.length} B2 words.`);

  console.log("Generating C1 level batch...");
  const c1Generated = await generateBatch("C1", C1_WORD_TARGETS);
  console.log(`Generated ${c1Generated.length} C1 words.`);

  console.log("Generating C2 level batch...");
  const c2Generated = await generateBatch("C2", C2_WORD_TARGETS);
  console.log(`Generated ${c2Generated.length} C2 words.`);

  [...b2Generated, ...c1Generated, ...c2Generated].forEach((w) => {
    if (w && w.word && !wordMap.has(w.word.toLowerCase().trim())) {
      wordMap.set(w.word.toLowerCase().trim(), {
        word: w.word.toLowerCase().trim(),
        pos: w.pos || "noun",
        cefr_level: w.cefr_level || "C1",
        english_translation: w.english_translation || w.word,
        example_sentence_native: w.example_sentence_native || "",
        example_sentence_english: w.example_sentence_english || "",
        useful_for_flashcard: true,
        word_frequency: w.word_frequency || 4000,
      });
    }
  });

  const finalWords = Array.from(wordMap.values());
  console.log(`Total combined English word count: ${finalWords.length}`);

  const levelBreakdown = {};
  finalWords.forEach((w) => {
    const l = w.cefr_level || "A1";
    levelBreakdown[l] = (levelBreakdown[l] || 0) + 1;
  });
  console.log("Final CEFR level breakdown:", levelBreakdown);

  fs.writeFileSync("words/english.json", JSON.stringify(finalWords, null, 2), "utf8");
  console.log("Successfully saved words/english.json!");
}

main().catch(console.error);
