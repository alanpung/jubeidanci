# Plan: Fix Listening Exercise `mode: choices`

## Goal

Allow content authors to provide explicit choices for listening exercises with `mode: choices`, using the same `- "text" (correct)` syntax as `multiple-choice` exercises. When `mode: choices` is set, `choices` is **required**. No backward compatibility with auto-generated distractors -- the `generateDistractors` function and `shuffleWithSeed` are removed since they are no longer needed.

## Target Markdown Syntax

```
[listening]
text: "El gato es negro"
ttsLang: es-ES
mode: choices
choices:
  - "El gato es negro" (correct)
  - "El perro es negro"
  - "El gato es blanco"
srsWords: "gato" "negro"
```

This mirrors the `multiple-choice` syntax exactly.

## Changes by File

### 1. `lib/content/types.ts` -- Add required fields when mode is choices

Add `choices?: string[]` and `correctIndex?: number` to the interface. These are optional at the type level since they only apply when `mode: "choices"`:

```typescript
export interface ListeningExercise {
  type: "listening";
  text: string;
  ttsLang: string;
  mode?: "choices" | "word-bank";
  choices?: string[];        // NEW - required when mode is "choices"
  correctIndex?: number;     // NEW - required when mode is "choices"
  noAudio?: string[];
  srsWords: string | string[];
}
```

### 2. `lib/content/exercise-schema.ts` -- Add conditionally required fields

Use Zod `.refine()` or `.superRefine()` to enforce that `choices` and `correctIndex` are present when `mode: "choices"`:

```typescript
export const listeningSchema = z.object({
  type: z.literal("listening"),
  text: z.string(),
  ttsLang: z.string(),
  mode: z.enum(["choices", "word-bank"]).optional(),
  choices: z.array(z.string()).min(2).max(4).optional(),
  correctIndex: z.number().int().min(0).optional(),
  noAudio,
  srsWords,
}).refine(
  (data) => data.mode !== "choices" || (data.choices !== undefined && data.correctIndex !== undefined),
  { message: "choices and correctIndex are required when mode is 'choices'", path: ["choices"] }
);
```

### 3. `lib/content/parser.ts` -- Parse choices in `parseListening`

When `mode` is `"choices"`, parse the `- "text" (correct)` list items (same logic as `parseMultipleChoice`). No fallback -- if `mode: choices` but no choice lines, schema validation will catch the error:

```typescript
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
```

### 4. `components/exercises/listening.tsx` -- Use author-provided choices, remove `generateDistractors`

Remove `generateDistractors` and `shuffleWithSeed`. The `ListeningChoices` component now requires `exercise.choices` and `exercise.correctIndex`:

```typescript
const { choices, correctIndex } = useMemo(() => {
  return {
    choices: exercise.choices!,
    correctIndex: exercise.correctIndex!,
  };
}, [exercise.choices, exercise.correctIndex]);
```

The default mode (no `mode` set) currently also renders `ListeningChoices` with auto-generated distractors. Since we're removing that, the default mode (no `mode`) should render a **text input** instead -- the user types what they hear. This is the original "type what you hear" behavior described in the docs: "User listens to TTS audio and types what they hear." We need to add a simple text input component for the default mode.

**Updated component routing:**
- `mode: "choices"` -> `ListeningChoices` (uses `exercise.choices` / `exercise.correctIndex`)
- `mode: "word-bank"` -> `ListeningWordBank` (existing, unchanged)
- no `mode` (default) -> `ListeningTypeAnswer` (NEW - text input, user types what they hear)

### 5. `lib/content/exercise-syntax.ts` -- Document the choices field

Update the listening exercise documentation table and add an example with `mode: choices`:

Add `choices (list)` field to the table:
```
| choices (list) | when mode=choices | `- "text"` items, one with `(correct)` |
```

Add a second example showing `mode: choices`.

### 6. `lib/content/parser.test.ts` -- Add tests

Add test cases:
- `mode: choices` with author-provided choices and `(correct)` marker -- verify `choices` and `correctIndex` are parsed
- `mode: choices` without choices -- verify schema validation error

---

## What We Are NOT Changing

- The `word-bank` mode is unaffected
- No changes to audio generation (`scripts/generate-audio.ts`)

---

## Implementation Todo List

1. [ ] Update `ListeningExercise` interface in `lib/content/types.ts` -- add `choices?: string[]` and `correctIndex?: number`
2. [ ] Update `listeningSchema` in `lib/content/exercise-schema.ts` -- add `choices`, `correctIndex`, and refine to require them when `mode: "choices"`
3. [ ] Update `parseListening` in `lib/content/parser.ts` -- parse choice lines when `mode: "choices"`
4. [ ] Update `components/exercises/listening.tsx` -- remove `generateDistractors`/`shuffleWithSeed`, use `exercise.choices`/`exercise.correctIndex` in `ListeningChoices`, add `ListeningTypeAnswer` for default mode
5. [ ] Update listening docs in `lib/content/exercise-syntax.ts` -- document `choices` field and add example
6. [ ] Add tests in `lib/content/parser.test.ts` -- test `mode: choices` with explicit choices
7. [ ] Run existing tests to verify nothing is broken
