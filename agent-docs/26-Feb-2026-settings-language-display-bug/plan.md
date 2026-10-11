# Bug Fix: Settings shows "Japanese" and "Bulgarian" regardless of actual user preferences

## Research Findings

### The Bug
Users visit `/settings` and see:
- **Learning Language**: Japanese
- **Native Language**: Bulgarian

...regardless of what they actually have in the database.

### Architecture
- **Server Component** (`app/(main)/settings/page.tsx`): Fetches `targetLanguage` and `nativeLanguage` from DB, passes them as props.
- **Client Component** (`app/(main)/settings/settings-view.tsx`): Renders two `<select>` dropdowns with `value={targetLanguage ?? ""}` and `value={nativeLanguage ?? ""}`.

### Root Cause

The key observation is that **Japanese (`ja`) is the last item in `TARGET_LANGUAGES`** and **Bulgarian (`bg`) is the last item in `NATIVE_LANGUAGES`**. Seeing the last `<option>` in a list is the classic symptom of a **hydration mismatch causing the `<select>` to become uncontrolled**.

The specific mechanism in `settings-view.tsx:44-60`:

```jsx
<select value={targetLanguage ?? ""}>
  {!targetLanguage && <option value="">Select a language</option>}
  {TARGET_LANGUAGES.map((code) => (
    <option key={code} value={code}>{getLanguageName(code)}</option>
  ))}
</select>
```

**Problem 1 - Conditional placeholder causes hydration mismatch:**
- When `targetLanguage` is `null` (new users who haven't set one), the server renders the placeholder `<option value="">Select a language</option>` plus all 11 language options (12 options total).
- But if there's any hydration timing issue or if the server/client `Intl.DisplayNames` output differs slightly, React detects a mismatch and falls back to uncontrolled behavior.
- When uncontrolled, the browser shows whichever option it defaults to — typically the last one: **Japanese**.

**Problem 2 - The `value=""` doesn't match any option when placeholder is absent:**
- If `targetLanguage` is `null`, the value becomes `""`. But if the conditional placeholder is not rendered (due to hydration issues), there's no `<option value="">` to match, so the `<select>` is effectively uncontrolled and the browser shows the last option.

**Problem 3 - Missing `/settings` revalidation:**
- `updateNativeLanguage()` in `lib/actions/profile.ts:53-54` revalidates `/chat` and `/prompts` but **NOT `/settings`**.
- `updateTargetLanguage()` in `lib/actions/preferences.ts:40` revalidates `/` but **NOT `/settings`**.
- This means if a user changes their language (from settings or via AI chat), revisiting settings may show stale cached data.

### All Relevant Files

| File | Lines | Relevance |
|---|---|---|
| `app/(main)/settings/page.tsx` | 8-25 | Server component, fetches language data |
| `app/(main)/settings/settings-view.tsx` | 11,13-17,44-60,64-80 | Client component, renders `<select>` dropdowns |
| `lib/languages.ts` | 1-21 | `getLanguageName()`, `supportedLanguages` |
| `lib/actions/profile.ts` | 41-55, 57-63 | `updateNativeLanguage()`, `getNativeLanguage()` |
| `lib/actions/preferences.ts` | 12-22, 24-41 | `getTargetLanguage()`, `updateTargetLanguage()` |
| `lib/auth.ts` | 33-38 | Sets `nativeLanguage: "en"` on signup, does NOT set `targetLanguage` |
| `lib/db/schema.ts` | 80-88 | `userPreferences` table — both fields nullable |
| `lib/constants.ts` | 2 | `DEFAULT_NATIVE_LANGUAGE = "en"` |

---

## Fix Plan

### Step 1: Fix the `<select>` hydration issue in `settings-view.tsx`
- **Always** render the placeholder `<option value="">` for **both** selects, not conditionally. This ensures server and client HTML always match.
- Ensure the `value` prop always resolves to a string that matches an existing `<option>`. When the DB value is `null`, the value will be `""`, which now always matches the placeholder option.

**Before** (Learning Language select, line 54):
```jsx
{!targetLanguage && <option value="">Select a language</option>}
```
**After:**
```jsx
<option value="">Select a language</option>
```

### Step 2: Fix revalidation gaps
- In `updateNativeLanguage()` (`lib/actions/profile.ts`): add `revalidatePath("/settings")`
- In `updateTargetLanguage()` (`lib/actions/preferences.ts`): add `revalidatePath("/settings")`

### Step 3: Add `export const dynamic = 'force-dynamic'` to settings page
- In `app/(main)/settings/page.tsx`: Add this export to ensure the page is always dynamically rendered and never served from cache.

---

## TODO

- [ ] Step 1: Fix conditional placeholder in `<select>` for Learning Language in `settings-view.tsx` — always render `<option value="">Select a language</option>`
- [ ] Step 2: Add `revalidatePath("/settings")` to `updateNativeLanguage()` in `lib/actions/profile.ts`
- [ ] Step 3: Add `revalidatePath("/settings")` to `updateTargetLanguage()` in `lib/actions/preferences.ts`
- [ ] Step 4: Add `export const dynamic = 'force-dynamic'` to `app/(main)/settings/page.tsx`
