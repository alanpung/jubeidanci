# Fix: Article Reader Client-Side Crash (React Rules of Hooks Violation)

## Problem

When loading an article at `/read/[id]`, the app crashes with:
> "Application error: a client-side exception has occurred"

## Root Cause

In `app/(main)/read/[id]/page.tsx`, a recent "optimizations" commit (`42d6f7b`, 2026-02-23) introduced a **React Rules of Hooks violation**.

Two `useMemo` calls were placed **after** conditional early returns (lines 213-227):

```tsx
// Lines 196-208: Conditional early return
if (error || !article) {
    return ( ... "Article not found" ... );
}

// Lines 213-227: useMemo called AFTER the conditional return
const blocks = useMemo(...);         // <-- VIOLATION
const sourceDomain = useMemo(...);   // <-- VIOLATION
```

React requires that hooks are always called in the same order on every render. When `article` is null (initial render while loading), the early return fires and the `useMemo` hooks are never called. On subsequent renders when `article` is populated, the hooks execute. This changes the hook call count/order between renders, which React explicitly forbids and causes an unrecoverable crash.

## Research Findings

- Before the optimization commit, `blocks` was a plain `JSON.parse()` call and `sourceDomain` was an IIFE -- no hooks were involved, so no violation existed.
- The commit wrapped both in `useMemo` for performance but didn't move them above the early returns.
- There are no error boundaries protecting this page, so the hooks violation crashes the entire app.

## Design Decision

Move both `useMemo` calls above all conditional early returns. This is safe because:
- When `article` is null, `article?.translatedContent` is `undefined` and `article?.sourceUrl` is `undefined` -- both memos will return safe defaults (empty array and empty string).
- The dependency arrays use optional chaining, so they work fine with null article.
- This preserves the memoization optimization while respecting the Rules of Hooks.

## Edge Cases / Attention Points

- `JSON.parse(article.translatedContent)` could throw on malformed data -- we should handle this gracefully inside the memo.
- `new URL(article.sourceUrl)` could throw on invalid URLs -- already handled with try/catch.
- The `isInProgress` variable is also computed after the early returns but is NOT a hook, so it's fine to leave in place. However, for consistency, we can move it too.

## Todo

1. Move `useMemo` for `blocks` above all conditional early returns, using optional chaining for null safety
2. Move `useMemo` for `sourceDomain` above all conditional early returns, using optional chaining for null safety
3. Add try/catch inside the `blocks` memo to prevent `JSON.parse` crashes
4. Verify the fix with `bun run build`
