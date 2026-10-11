# Plan: Move Skip Buttons to Top & Make Blue

## Goal
Move the "Skip, I can't speak/listen now" buttons from the bottom of each exercise to the top (right after the `<h2>` heading), and restyle them as visible blue buttons.

## Changes

### New Styling
Replace the current subtle gray text style:
```
text-sm text-lingo-text-light hover:text-lingo-text transition-colors
```

With a visible blue button style:
```
w-full rounded-xl border-2 border-lingo-blue bg-blue-50 px-4 py-2 text-sm font-bold text-lingo-blue hover:bg-blue-100 transition-all mb-4
```

This uses the same blue style already present in the codebase (e.g., word bank selected items) but as a full-width outlined button that's clearly visible.

### File Changes

#### 1. `components/exercises/speaking.tsx`
- **Remove** skip button from lines 234-246 (bottom of children)
- **Add** skip button right after the `<h2>` at line 148, before the sentence display card

#### 2. `components/exercises/listening.tsx` - 3 locations:
- **ListeningChoices**: Remove from lines 205-217, add after `<h2>` at line 172
- **ListeningTypeAnswer**: Remove from lines 296-308, add after `<h2>` at line 276
- **ListeningWordBank**: Remove from lines 449-461, add after `<h2>` at line 403

### Button Markup (new)
```tsx
{status === "answering" && (
  <div className="flex justify-center mb-4">
    <button
      onClick={() => {
        checkAnswer(true);
        onResult(true, "[skipped]");
      }}
      className="w-full rounded-xl border-2 border-lingo-blue bg-blue-50 px-4 py-2 text-sm font-bold text-lingo-blue hover:bg-blue-100 transition-all"
    >
      Skip, I can&apos;t speak now
    </button>
  </div>
)}
```

## Todo List
1. Update `speaking.tsx` - remove old skip button, add new blue one after heading
2. Update `ListeningChoices` in `listening.tsx` - remove old, add new after heading
3. Update `ListeningTypeAnswer` in `listening.tsx` - remove old, add new after heading
4. Update `ListeningWordBank` in `listening.tsx` - remove old, add new after heading
