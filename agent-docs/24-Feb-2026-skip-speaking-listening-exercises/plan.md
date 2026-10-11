# Plan: Skip Speaking/Listening Exercises

## Design Decisions

### Skip = mark as correct, no SRS update
- When a user skips, we call `onResult(true, "[skipped]")` then `onContinue()`.
- Marking as `correct: true` means it won't increment `mistakeCount` and won't penalize the user's perfect score. This is intentional — the user isn't failing, they're deferring.
- The sentinel value `"[skipped]"` in `userAnswer` lets the server-side `completeLesson()` identify skipped exercises and exclude them from SRS processing.

### Skip button placement
- The skip button should appear during the `"answering"` state only (before the user has attempted the exercise).
- It should be placed **below** the exercise content but **above** the Check button, as a low-emphasis text-style button so it doesn't compete visually with the primary action.
- Style: `ghost` variant button with muted text, no uppercase, normal weight — clearly secondary to the main interaction.

### Button text
- Speaking: **"Skip, I can't speak now"**
- Listening: **"Skip, I can't listen now"**

### No changes to ExerciseShell
- The skip button lives inside each exercise component, not in the shell. This keeps the skip logic exercise-specific and avoids adding complexity to the shared shell component.

## Implementation

### 1. `components/exercises/speaking.tsx`

Add a skip button visible when `status === "answering"`, positioned below the microphone area:

```tsx
{status === "answering" && (
  <div className="flex justify-center mt-2">
    <button
      onClick={() => {
        checkAnswer(true);
        onResult(true, "[skipped]");
      }}
      className="text-sm text-lingo-text-light hover:text-lingo-text transition-colors"
    >
      Skip, I can&apos;t speak now
    </button>
  </div>
)}
```

After `checkAnswer(true)` is called, the ExerciseShell transitions to `status === "correct"` showing the Continue button, which the user clicks to advance. This maintains the same flow as normal completion.

### 2. `components/exercises/listening.tsx`

Add a similar skip button to all three sub-mode components (`ListeningChoices`, `ListeningTypeAnswer`, `ListeningWordBank`). The button goes inside each sub-component's `<ExerciseShell>` children, at the bottom of the exercise content area.

```tsx
{status === "answering" && (
  <div className="flex justify-center mt-4">
    <button
      onClick={() => {
        checkAnswer(true);
        onResult(true, "[skipped]");
      }}
      className="text-sm text-lingo-text-light hover:text-lingo-text transition-colors"
    >
      Skip, I can&apos;t listen now
    </button>
  </div>
)}
```

### 3. `lib/actions/lesson.ts`

In the SRS processing loop (around line 88), add a check to skip exercises where `userAnswer === "[skipped]"`:

```ts
for (const result of input.results) {
  if (result.userAnswer === "[skipped]") continue; // <-- NEW
  const exercise = lesson.exercises[result.exerciseIndex] as Exercise | undefined;
  if (!exercise) continue;
  if (exercise.type === "flashcard-review") continue;
  // ... existing SRS logic
}
```

This is a one-line addition that mirrors the existing `flashcard-review` skip pattern.

## Todo List

1. Add skip button to `components/exercises/speaking.tsx`
2. Add skip button to `ListeningChoices` in `components/exercises/listening.tsx`
3. Add skip button to `ListeningTypeAnswer` in `components/exercises/listening.tsx`
4. Add skip button to `ListeningWordBank` in `components/exercises/listening.tsx`
5. Add `"[skipped]"` filter in `lib/actions/lesson.ts` SRS loop
