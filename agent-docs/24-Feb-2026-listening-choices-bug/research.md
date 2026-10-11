# Research: Listening Exercise `mode: choices` Bug

## Summary

The user suspects there is a bug with the listening exercise when `mode: choices` is set -- specifically that there is no way to provide custom choices and this is not documented in `exercise-syntax.ts`. **This is confirmed.** The `mode: choices` feature is half-implemented: the mode value is accepted but there is no mechanism for content authors to supply their own choices. Instead, the component auto-generates low-quality distractors by rearranging words from the `text` field.

---

## Affected Files (Full Stack Trace)

### 1. `lib/content/exercise-syntax.ts` (lines 172-188) -- Documentation

The listening exercise syntax reference documents `mode` as optional with values `choices` or `word-bank`, but **does not document a `choices` field** for the listening type. Compare with `multiple-choice` (line 103) which documents `choices (list)` as required.

Current listening docs:
```
| Field | Required | Description |
|-------|----------|-------------|
| text  | yes      | The text that will be spoken |
| ttsLang | yes    | BCP-47 language code for TTS |
| mode  | no       | `choices` or `word-bank` for alternate UI |
| srsWords | yes   | Target-language word(s) for SRS |
```

There is no `choices` field, and no example showing how `mode: choices` would work with author-provided choices.

### 2. `lib/content/types.ts` (lines 105-112) -- TypeScript Interface

```typescript
export interface ListeningExercise {
  type: "listening";
  text: string;
  ttsLang: string;
  mode?: "choices" | "word-bank";
  noAudio?: string[];
  srsWords: string | string[];
}
```

No `choices` or `correctIndex` fields exist on the interface. When `mode` is `"choices"`, the component has no way to receive author-defined choices from the exercise data.

### 3. `lib/content/exercise-schema.ts` (lines 77-87) -- Zod Validation Schema

```typescript
export const listeningSchema = z.object({
  type: z.literal("listening"),
  text: z.string(),
  ttsLang: z.string(),
  mode: z.enum(["choices", "word-bank"]).optional(),
  noAudio,
  srsWords,
});
```

No `choices` field. Any `choices` field added to markdown content would be silently dropped/rejected during validation.

### 4. `lib/content/parser.ts` (lines 237-245) -- Markdown Parser

```typescript
function parseListening(lines: string[]): ListeningExercise {
  const noAudio: string[] = [];
  const rawText = stripNoAudio(getField(lines, "text"));
  if (rawText.flagged) noAudio.push("text");
  const ttsLang = getField(lines, "ttsLang");
  const mode = getOptionalField(lines, "mode") as "choices" | "word-bank" | undefined;
  const srsWords = parseSrsWords(lines) ?? "";
  return { type: "listening", text: rawText.text, ttsLang, srsWords, ...(mode && { mode }), ...(noAudio.length && { noAudio }) };
}
```

The parser reads `mode` but does NOT parse any choices list. Compare with `parseMultipleChoice` (lines 166-189) which has full choice-parsing logic including `(correct)` marker detection.

### 5. `components/exercises/listening.tsx` (lines 122-215) -- React Component

The `ListeningChoices` component (used for both default mode and `mode: choices`) auto-generates choices:

```typescript
const { choices, correctIndex } = useMemo(() => {
  const distractors = generateDistractors(exercise.text);
  const all = [exercise.text, ...distractors];
  const seed = exercise.text.length * 7 + exercise.text.charCodeAt(0);
  const shuffled = shuffleWithSeed(all, seed);
  return {
    choices: shuffled,
    correctIndex: shuffled.indexOf(exercise.text),
  };
}, [exercise.text]);
```

The `generateDistractors` function (lines 19-32) creates distractors by:
- Swapping the two middle words of the text (distractor 1)
- Swapping the first and last words (distractor 2)
- For texts with <=2 words: appending `?` and `!`

This produces low-quality, non-meaningful alternatives. There is **no code path** that uses author-provided choices.

### 6. `lib/content/parser.test.ts` (lines 235-261) -- Tests

Tests exist for basic listening parsing and `mode: word-bank`, but **no test** for `mode: choices` with author-provided choices data.

---

## How Other Exercise Types Handle Choices (for comparison)

### `multiple-choice` exercise
- **Interface** (`types.ts:69-77`): Has `choices: string[]` and `correctIndex: number`
- **Schema** (`exercise-schema.ts:7-23`): Validates `choices` array (2-4 items) and `correctIndex`
- **Parser** (`parser.ts:166-189`): Parses `- "text" (correct)` list items, extracts choices and marks correct index
- **Syntax docs** (`exercise-syntax.ts:96-115`): Documents `choices (list)` field with `(correct)` marker syntax
- **Component** (`multiple-choice.tsx`): Receives `exercise.choices` and `exercise.correctIndex` directly from parsed data

### `word-bank` exercise (standalone)
- **Interface** (`types.ts:114-122`): Has `words: string[]` and `answer: string[]`
- **Parser** (`parser.ts:264-283`): Parses `words:` and `answer:` quoted lists

---

## The Bug in Detail

The bug is that `mode: choices` is accepted as a valid value for listening exercises across the entire stack (types, schema, parser), but there is no mechanism for content authors to provide meaningful choices. The component falls back to auto-generating distractors by rearranging the words of the correct answer, which:

1. Produces nonsensical sentences (e.g., swapping "El" and "negro" in "El gato es negro" gives "negro gato es El")
2. Does not allow pedagogically meaningful distractors (e.g., similar-sounding sentences)
3. Makes the exercise trivially easy (the correct answer is the only grammatically valid option)

The `mode: "word-bank"` path works correctly because it splits `exercise.text` into individual word tiles, requiring no additional data from the content author. But `mode: "choices"` fundamentally needs author-provided alternatives to be useful.

---

## Conclusion

The fix requires adding a `choices` field (with a correct marker) to the listening exercise across all layers:
1. **exercise-syntax.ts** -- Document the `choices` list field and `(correct)` marker for listening exercises with `mode: choices`
2. **types.ts** -- Add `choices?: string[]` and `correctIndex?: number` to `ListeningExercise`
3. **exercise-schema.ts** -- Add conditional `choices` and `correctIndex` fields to `listeningSchema`
4. **parser.ts** -- Add choice-parsing logic to `parseListening` (similar to `parseMultipleChoice`)
5. **listening.tsx** -- Use `exercise.choices` / `exercise.correctIndex` when provided; fall back to `generateDistractors` when `mode: choices` but no explicit choices given (backward compat)
6. **parser.test.ts** -- Add tests for `mode: choices` with author-provided choices
