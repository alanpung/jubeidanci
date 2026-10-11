# Research: Skip Speaking/Listening Exercises

## Overview

The goal is to allow users to skip speaking and listening exercises when they can't use audio (e.g., in a quiet public space, no headphones). The exercise should be marked as completed without updating the SRS (spaced repetition system).

## Architecture Summary

### Exercise Flow

1. `LessonView` (`app/(main)/lesson/[courseId]/[unitId]/[lessonIndex]/lesson-view.tsx`) orchestrates the lesson
2. It uses `useLesson` hook to track `currentIndex`, `results[]`, `isComplete`, `mistakeCount`
3. Each exercise component receives `onResult(correct, answer)` and `onContinue()` callbacks
4. When user finishes an exercise, the component calls `onResult(correct, answer)` then the shell's "Continue" button triggers `onContinue()` which calls `advance()` from `useLesson`
5. When all exercises are done (`isComplete = true`), `LessonView` calls `completeLesson()` server action

### How Results Are Recorded

In `useLesson` (`hooks/use-lesson.ts`):
- `recordResult(correct, userAnswer)` pushes to a `results[]` array with shape:
  ```ts
  { exerciseIndex, exerciseType, correct, userAnswer }
  ```
- `advance()` increments `currentIndex` or sets `isComplete = true`

### How SRS Is Updated (Key!)

In `completeLesson()` (`lib/actions/lesson.ts:33-133`):
- For each result, it looks up the exercise from the unit markdown
- Extracts SRS words via `extractSrsWords(exercise)` from `lib/srs-words.ts`
- Calls `recordWordPractice(userId, word, language, "", result.correct)` for each word
- **Flashcard-review exercises are already skipped** (line 91: `if (exercise.type === "flashcard-review") continue;`)

To skip SRS for skipped exercises, we need to either:
- (a) Filter out skipped results in `completeLesson()`, or
- (b) Mark the userAnswer in a way that `completeLesson()` can detect and skip

### Speaking Exercise (`components/exercises/speaking.tsx`)

- Props: `{ exercise, onResult, onContinue, language }`
- Uses `useExercise()` hook for status state machine (`answering` -> `correct`/`incorrect`)
- Wraps content in `<ExerciseShell>` which renders Check/Continue buttons
- Has NO manual "Check" button (`canCheck={false}`) — answer is auto-checked after transcription
- Flow: plays TTS -> user records -> sends to STT API -> compares words -> auto-calls `checkAnswer()` and `onResult()`
- The ExerciseShell provides the "Continue" button after checking

### Listening Exercise (`components/exercises/listening.tsx`)

- Props: `{ exercise, onResult, onContinue, language, autoplayAudio? }`
- Three sub-modes: `ListeningTypeAnswer`, `ListeningChoices`, `ListeningWordBank`
- All three use `<ExerciseShell>` for Check/Continue buttons
- All three use `useExercise()` for status tracking
- The parent `Listening` component creates `useExercise()` and passes `status`/`checkAnswer` to sub-modes

### ExerciseShell (`components/exercises/exercise-shell.tsx`)

- Common wrapper providing the Check button (when `status === "answering"`) and Continue button (when `status === "correct"` or `"incorrect"`)
- Also handles Enter key for Check/Continue
- Takes: `status`, `onCheck`, `onContinue`, `canCheck`, `correctAnswer`, `language`

### Existing Skip Pattern

There's already a `SkipInvalid` component in `lesson-view.tsx:245-257` that auto-skips invalid exercises:
```tsx
function SkipInvalid({ onResult, onContinue }) {
  useEffect(() => {
    onResult(true, "[skipped]");
    onContinue();
  }, [onResult, onContinue]);
  return null;
}
```
This marks as correct with `"[skipped]"` as the answer. However, this DOES trigger SRS updates (as `result.correct = true`). For our skip feature, we want to NOT trigger SRS.

### Button Component (`components/ui/button.tsx`)

- Supports variants: `primary`, `secondary`, `danger`, `ghost`, `outline`
- Supports sizes: `sm`, `md`, `lg`
- Standard Lingo design system with the 3D border-bottom effect

## Key Observations

1. **SRS filtering happens in `completeLesson()`** — this is the single place where we need to check for skipped exercises and exclude them from SRS processing.

2. **The `userAnswer` field is a string** — we can use a sentinel value like `"[skipped]"` to indicate a skipped exercise. The `SkipInvalid` component already uses this pattern.

3. **Both Speaking and Listening exercises use `ExerciseShell`** — but the skip button should appear during the `"answering"` state, before the user attempts the exercise.

4. **The skip button should be separate from ExerciseShell's Check/Continue flow** — it needs to trigger `onResult()` and `onContinue()` directly, bypassing the normal check flow.

5. **Mistake count** — A skipped exercise should probably NOT count as a mistake (since the user chose to skip, not answered incorrectly). We mark `correct: true` so `mistakeCount` isn't incremented, but we filter it out of SRS.

6. **The `exerciseType` field in results is the exercise type string** — we can use the `userAnswer` field rather than the type to detect skips, since the type is needed for tracking.

## Files That Need Changes

| File | Change |
|------|--------|
| `components/exercises/speaking.tsx` | Add "Skip, I can't speak now" button |
| `components/exercises/listening.tsx` | Add "Skip, I can't listen now" button to all 3 sub-modes |
| `lib/actions/lesson.ts` | Skip SRS updates for exercises with `userAnswer === "[skipped]"` |
