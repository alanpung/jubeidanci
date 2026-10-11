# Plan: Article Translation Stuck-Forever Fix

## Research Findings

### The Real Problem

The issue is NOT about the `status === "failed"` UI (that red banner already exists). The problem is that **the status never reaches "failed" in the first place** — the article gets stuck in `"fetching"` or `"translating"` forever, and the frontend shows an infinite spinner.

### How it gets stuck

`processTranslation()` is called fire-and-forget from the AI tool (`tools.ts:480`). The backend *does* have a try/catch in `process.ts:169` that sets `status: "failed"` — but this only works if the process stays alive. Several scenarios cause the status to stay as `"fetching"` or `"translating"` permanently:

1. **Server restart / deploy during processing** — The fire-and-forget promise is lost. Status stays as-is in DB forever.
2. **Process crash / OOM** — Same result.
3. **DB update to "failed" itself fails** — The catch at `process.ts:172-186` tries to write "failed" to DB, but if the DB is unreachable at that moment, it silently fails too.
4. **Unhandled rejection in background** — The `.catch()` at `tools.ts:480-486` only logs, doesn't update DB status.

In all these cases, the frontend (`read/[id]/page.tsx:156-175`) polls every 2 seconds indefinitely, showing the blue "Fetching article..." or "Translating..." spinner forever. There is no timeout, no max-retry, and no staleness detection.

The same issue occurs in the `ArticleCard` in chat (`article-card.tsx:26-47`) — it also polls forever.

### What the user sees

- **Reader page**: Blue progress banner with spinner saying "Fetching article..." or "Translating..." that never goes away. No content below. No way to escape except the back button.
- **Chat card**: Progress bar that never completes, with "View Progress" button.

### Solution

The fix needs two parts:

**A. Frontend: Detect stale articles and show error state**

Add a staleness check on the frontend. If an article has been in `"fetching"` or `"translating"` for too long (based on `createdAt`), treat it as failed and show the error UI. Reasonable timeouts:
- `"fetching"`: 2 minutes (direct fetch timeout is 30s + Jina is 45s = ~75s max)
- `"translating"`: 5 minutes (generous for large articles with many chunks)

When stale, stop polling and show the friendly error state.

**B. Frontend: Show a clear, friendly error UI**

When the article is detected as stale OR has `status === "failed"`, replace the current subtle banner / infinite spinner with a prominent error state:
- Friendly copy: "Couldn't read this article, but other articles should work :)"
- Red/error styling (red background tint, red border, using `lingo-red` tokens)
- "Back to articles" CTA button
- Keep the header (back button, title, source link, delete button) for context

### Design Decisions

1. **Staleness is detected on the frontend using `createdAt`**. We compare `Date.now()` against `article.createdAt`. This avoids needing a backend cron job or migration. The `createdAt` field already exists in the schema.
2. **Thresholds**: 2 min for fetching, 5 min for translating. These are generous — real processing takes well under these limits.
3. **Both the reader page AND the chat card** need staleness detection.
4. **The chat card** should also show a clear failed state when stale (friendly message, change button to "View Details" or similar).
5. **No backend changes** — the backend error handling is already correct for normal failure paths. The stuck state is inherently a frontend problem (backend process died, frontend doesn't know).

### Edge Cases

- **Article that's legitimately still processing**: The 2min/5min timeouts are generous enough. A normal fetch takes <30s and translation of even a large article takes <3min.
- **Clock skew**: `createdAt` comes from the server; `Date.now()` is client time. Minor skew (<1min) won't matter given our generous thresholds.
- **Partial content + stale**: If some blocks were translated before the process died, we still show the error state. Partial translations are incomplete and confusing.

## Todo List

1. Update `app/(main)/read/[id]/page.tsx`:
   - Add staleness detection logic (compare `createdAt` against thresholds)
   - When stale, stop polling and treat as failed
   - Replace the current error banner + infinite spinner with a prominent, friendly error state with red styling
   - Show "Couldn't read this article, but other articles should work :)" message
   - Add "Back to articles" CTA

2. Update `components/chat/article-card.tsx`:
   - Add staleness detection logic
   - When stale, stop polling, show red X, friendly error message
   - Update button behavior for failed/stale state
