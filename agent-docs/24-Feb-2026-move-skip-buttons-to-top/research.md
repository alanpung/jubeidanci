# Research: Skip Buttons in Exercises

## Current State

There are **4 skip button instances** across **2 files**:

### 1. `components/exercises/speaking.tsx` (lines 234-246)
- Text: "Skip, I can't speak now"
- Positioned at the very bottom of the exercise children, after error messages and recording controls
- Styled as subtle gray text: `text-sm text-lingo-text-light hover:text-lingo-text transition-colors`
- Only visible when `status === "answering"`

### 2. `components/exercises/listening.tsx` - 3 sub-components:
- **ListeningChoices** (lines 205-217): "Skip, I can't listen now" - after the choices list
- **ListeningTypeAnswer** (lines 296-308): "Skip, I can't listen now" - after the text input
- **ListeningWordBank** (lines 449-461): "Skip, I can't listen now" - after the word bank

All use identical styling: subtle gray text, no background, no border.

## Click Handler Behavior (identical for all 4)

```tsx
onClick={() => {
  checkAnswer(true);
  onResult(true, "[skipped]");
}}
```

- Marks exercise as "correct" (no penalty)
- Records `"[skipped]"` as the user answer
- SRS updates are skipped for `"[skipped]"` answers in `lib/actions/lesson.ts:88`
- Exercise transitions to "correct" state showing "Continue" button

## Exercise Layout Structure

Each exercise renders inside `<ExerciseShell>`:
```
ExerciseShell
├── flex-1 content area
│   ├── children (exercise-specific content)
│   │   ├── <h2> heading ("Speak this sentence" / "What do you hear?" / "Type what you hear")
│   │   ├── [main exercise content: speaker, input, choices, etc.]
│   │   └── [SKIP BUTTON - currently at bottom]  ← CURRENT POSITION
│   │
├── Check button area (when answering)
├── Correct feedback (when correct)
└── Incorrect feedback (when incorrect)
```

## Where "Top of Exercise" Is

Right after the `<h2>` heading in each component:
- **speaking.tsx:148** - after "Speak this sentence"
- **ListeningChoices:172** - after "What do you hear?"
- **ListeningTypeAnswer:276** - after "Type what you hear"
- **ListeningWordBank:403** - after "What do you hear?"

## Design Tokens Available

From `app/globals.css`:
- `--lingo-blue: #1cb0f6` - the blue color used for primary actions
- `--lingo-blue-dark: #1899d6` - darker blue for borders/hover
- The codebase uses a Duolingo-style button pattern: `bg-lingo-blue text-white border-b-4 border-lingo-blue-dark`
