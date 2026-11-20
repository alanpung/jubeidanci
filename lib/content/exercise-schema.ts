import { z } from "zod";

const noAudio = z.array(z.string()).optional().describe("Words to skip TTS for");

// Empty is allowed: grammar/structure exercises (e.g. KET grammar standalone
// units) test a form rather than a vocabulary item, so they carry no SRS word.
// Downstream extractSrsWords() falls back to the sentence text, and the SRS
// report skips empty lists.
const srsWords = z.union([z.string(), z.array(z.string())]).describe("Target-language word(s) to track in SRS for this exercise");

export const multipleChoiceSchema = z.object({
  type: z.literal("multiple-choice"),
  text: z.string().describe("The question or prompt"),
  choices: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("Answer choices (2-4 items)"),
  correctIndex: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based index of the correct choice"),
  randomOrder: z.boolean().optional().describe("Shuffle choices at runtime"),
  noAudio,
  srsWords,
});

export const translationSchema = z.object({
  type: z.literal("translation"),
  text: z.string().describe("Instruction, e.g. 'Translate to English'"),
  sentence: z.string().describe("The sentence to translate"),
  answer: z.string().describe("The primary correct translation"),
  acceptAlso: z
    .array(z.string())
    .default([])
    .describe("Alternative accepted translations"),
  noAudio,
  srsWords,
});

export const writingSchema = z.object({
  type: z.literal("writing"),
  text: z.string().describe("Instruction, e.g. 'Write this essay in English'"),
  sentence: z.string().describe("The full Chinese prompt (one paragraph)"),
  answer: z.string().describe("The model English essay, revealed after submitting"),
  acceptAlso: z
    .array(z.string())
    .default([])
    .describe("Alternative acceptable model essays"),
  // Faithful, compact translation of `sentence` — the minimal required content,
  // free of the padding/elaboration that the full `answer` carries. This is the
  // grading gold for content-coverage (`missing`): a learner who covers the
  // Chinese prompt and adds their own words should never lose points for not
  // echoing the model essay's extra detail.
  core: z.string().optional(),
  // The Chinese model essay (中文范文) for A1/A2/B1. B2 and Advanced
  // deliberately omit it so the learner writes without Chinese scaffolding.
  // It is also inlined into `sentence` so it renders inside the prompt card.
  chineseEssay: z.string().optional(),
  // Chinese translation of the model answer, revealed after submit below the
  // English essay. B2 / Advanced only; display-only, not used in grading.
  modelAnswerZh: z.string().optional(),
  // CEFR level inherited from the unit frontmatter. Without declaring it here,
  // z.object() strips it and the grader falls back to A2 expectations.
  level: z.string().optional(),
  noAudio,
  srsWords,
});

export const fillInTheBlankSchema = z.object({
  type: z.literal("fill-in-the-blank"),
  sentence: z
    .string()
    .describe("Sentence with ___ marking the blank, e.g. 'Der ___ ist groß'"),
  blank: z.string().describe("The correct word for the blank"),
  translation: z.string().optional().describe("Chinese translation of the sentence"),
  acceptAlso: z
    .array(z.string())
    .default([])
    .describe("Alternative accepted blank words"),
  noAudio,
  srsWords,
});

export const matchingPairsSchema = z.object({
  type: z.literal("matching-pairs"),
  pairs: z
    .array(
      z.object({
        left: z.string().describe("Word in target language"),
        right: z.string().describe("English translation"),
      })
    )
    .min(2)
    .max(6)
    .describe("Pairs to match"),
  randomOrder: z.boolean().optional().describe("Shuffle pairs at runtime"),
  noAudio,
  srsWords,
});

export const wordBankSchema = z.object({
  type: z.literal("word-bank"),
  text: z.string().describe("Instruction or sentence to construct"),
  words: z
    .array(z.string())
    .describe("Available word tiles (include 1-2 distractors)"),
  answer: z.array(z.string()).describe("The correct word sequence"),
  randomOrder: z.boolean().optional().describe("Shuffle tiles at runtime"),
  noAudio,
  srsWords,
});

export const listeningSchema = z.object({
  type: z.literal("listening"),
  text: z.string().describe("The sentence to listen to"),
  ttsLang: z.string().describe("Language code for TTS, e.g. 'de'"),
  mode: z
    .enum(["choices", "word-bank"])
    .optional()
    .describe("'choices' for multiple-choice, 'word-bank' for reconstruction"),
  choices: z
    .array(z.string())
    .min(2)
    .max(4)
    .optional()
    .describe("Answer choices when mode is 'choices' (2-4 items)"),
  correctIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based index of the correct choice"),
  noAudio,
  srsWords,
});

export const speakingSchema = z.object({
  type: z.literal("speaking"),
  sentence: z.string().describe("The sentence the user should say aloud"),
  noAudio,
  srsWords,
});

export const freeTextSchema = z.object({
  type: z.literal("free-text"),
  text: z.string().describe("Instruction shown to user"),
  afterSubmitPrompt: z
    .string()
    .describe("AI prompt template — use {userResponse} as placeholder"),
  noAudio,
  srsWords: srsWords.optional(),
});

export const flashcardReviewSchema = z.object({
  type: z.literal("flashcard-review"),
  front: z.string().describe("Front of the card (markdown)"),
  back: z.string().optional().describe("Back of the card (markdown)"),
  meaning: z.string().optional().describe("Meaning of the word (e.g. English definition or meaning)"),
  translation: z.string().optional().describe("Translation in Chinese"),
  pos: z.string().optional().describe("Part of speech"),
  ipa: z.string().optional().describe("Phonetic transcription"),
  level: z.string().optional().describe("CEFR Level"),
  cefrLevel: z.string().optional().describe("CEFR Level"),
  noAudio,
  srsWords,
});

export const exerciseSchema = z.discriminatedUnion("type", [
  multipleChoiceSchema,
  translationSchema,
  writingSchema,
  fillInTheBlankSchema,
  matchingPairsSchema,
  wordBankSchema,
  listeningSchema,
  speakingSchema,
  freeTextSchema,
  flashcardReviewSchema,
]);

export type ChatExercise = z.infer<typeof exerciseSchema>;
