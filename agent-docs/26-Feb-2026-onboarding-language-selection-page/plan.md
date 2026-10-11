# Onboarding Language Selection Page - Implementation Plan

## Background & Research

### Current Onboarding Flow

1. User signs up -> better-auth `databaseHooks.user.create.after` fires (`lib/auth.ts`)
2. Hook creates `userPreferences` row with `nativeLanguage: "en"` and `targetLanguage: null`
3. Auth forms redirect to `DEFAULT_PATH` (`/chat`) after signup/signin
4. Chat page loads, `ChatView` detects `!language` and auto-sends "I am a new user, I need onboarding"
5. AI asks the user what language they want to learn via conversation

**Problem:** This flow assumes all users speak English and relies on a chat-based onboarding which is not immediate or accessible for non-English speakers.

### Key Files Discovered


| File                                    | Role                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `lib/constants.ts`                      | `DEFAULT_PATH = "/chat"`, `DEFAULT_NATIVE_LANGUAGE = "en"`                           |
| `lib/auth.ts`                           | Better auth hook - creates prefs with `nativeLanguage: "en"`, `targetLanguage: null` |
| `lib/actions/preferences.ts`            | `getTargetLanguage()`, `updateTargetLanguage()`                                      |
| `lib/actions/profile.ts`                | `getNativeLanguage()`, `updateNativeLanguage()`                                      |
| `lib/languages.ts`                      | `supportedLanguages` (12 codes), `getLanguageName()`                                 |
| `app/(main)/settings/settings-view.tsx` | Has `TARGET_LANGUAGES` (11 non-en) and `NATIVE_LANGUAGES` (30 codes)                 |
| `components/auth/sign-up-form.tsx`      | Redirects to `DEFAULT_PATH` after signup                                             |
| `components/auth/sign-in-form.tsx`      | Redirects to `DEFAULT_PATH` after signin                                             |
| `components/chat/chat-view.tsx:127-134` | Auto-sends onboarding message when `!language`                                       |
| `app/(main)/layout.tsx`                 | Main layout with auth guard, sidebar, topbar                                         |


### Language Lists

- **Target languages (can learn):** de, fr, es, it, pt, ru, ar, hi, ko, zh, ja (11 — English excluded)
- **Native languages:** 30 codes: en, es, fr, de, pt, it, nl, ru, zh, ja, ko, ar, hi, tr, pl, sv, da, no, fi, cs, ro, hu, el, he, th, vi, id, ms, uk, bg
- **Display names:** `getLanguageName(code)` uses `Intl.DisplayNames(["en"], { type: "language" })`

### Design System

- Duolingo-inspired: `lingo-green`, `lingo-blue`, `lingo-border`, `lingo-bg`, `lingo-card`, `lingo-text`, `lingo-text-light`
- Buttons: 3D effect with `border-b-4`, `rounded-2xl`, `font-bold uppercase`
- Cards: `rounded-2xl border-2 border-lingo-border bg-white p-5`
- Existing selects: plain `<select>` elements with `rounded-lg border-2 border-lingo-border`

---

## Design Decisions

1. **Route group:** Place the onboarding page under `app/(auth)/onboarding/page.tsx` — it uses the same centered card layout as sign-in/sign-up, with no sidebar/topbar. However the (auth) layout card is `max-w-md` which is fine for big dropdowns.
2. **Server component with redirect guard:** The page will be a server component that:
  - Requires a session (redirect to `/sign-in` if none)
  - Checks if both `targetLanguage` AND `nativeLanguage` are set — if so, redirect to `DEFAULT_PATH`
  - Otherwise render the onboarding form
3. **Client component for the form:** `OnboardingForm` — takes `nativeLanguage` as prop (preselected from DB, defaults to "en"), renders two big `<select>` dropdowns and a "Get Started" button.
4. **Big dropdowns:** Use native `<select>` elements (consistent with the rest of the app) but styled larger: `rounded-xl border-2 px-4 py-4 text-lg` — similar to the `create-course-form.tsx` pattern but even bigger.
5. **Emoji flags in dropdowns:** Each language option in both dropdowns will be prefixed with its country/region flag emoji (e.g., "🇩🇪 German", "🇫🇷 French"). We'll add a `getLanguageFlag(code)` helper to `lib/languages.ts` that maps ISO 639-1 language codes to flag emojis. The mapping uses the most commonly associated country for each language (e.g., `pt` -> 🇧🇷 Brazil since most Portuguese learners target Brazilian Portuguese, `en` -> 🇬🇧, `zh` -> 🇨🇳, etc.). This helper will live in `lib/languages.ts` so it can be reused elsewhere in the future.

   Full flag mapping for all 30 native + 11 target language codes:
   ```
   en: 🇬🇧, es: 🇪🇸, fr: 🇫🇷, de: 🇩🇪, pt: 🇧🇷, it: 🇮🇹, nl: 🇳🇱, ru: 🇷🇺,
   zh: 🇨🇳, ja: 🇯🇵, ko: 🇰🇷, ar: 🇸🇦, hi: 🇮🇳, tr: 🇹🇷, pl: 🇵🇱, sv: 🇸🇪,
   da: 🇩🇰, no: 🇳🇴, fi: 🇫🇮, cs: 🇨🇿, ro: 🇷🇴, hu: 🇭🇺, el: 🇬🇷, he: 🇮🇱,
   th: 🇹🇭, vi: 🇻🇳, id: 🇮🇩, ms: 🇲🇾, uk: 🇺🇦, bg: 🇧🇬
   ```

6. **Post-submit flow:** On submit, call `updateTargetLanguage()` and `updateNativeLanguage()` server actions, then `router.push(DEFAULT_PATH)`.
6. **Redirect auth forms to `/onboarding` instead of `DEFAULT_PATH`:** Change `sign-up-form.tsx` and `sign-in-form.tsx` to redirect to `/onboarding` instead of `DEFAULT_PATH`. The onboarding page will handle the redirect to `DEFAULT_PATH` if the user already has languages set — making it a no-op passthrough for existing users.
7. **Remove chat auto-onboarding:** Remove the auto-send "I am a new user, I need onboarding" useEffect in `chat-view.tsx` since the dedicated onboarding page replaces it.
8. **Landing page "Go to App" link:** Keep pointing to `DEFAULT_PATH` (`/chat`) since logged-in users on the landing page are already onboarded.

---

## Edge Cases & Attention Points

- **Existing users with both languages set** who visit `/onboarding`: Server redirect to `DEFAULT_PATH` immediately. No flicker.
- **Existing users with target language but no native language** (unlikely but possible): Show the onboarding form — they need to confirm/set native language.
- **New users via Google OAuth:** Same flow — hook sets `nativeLanguage: "en"`, `targetLanguage: null`, so they land on onboarding.
- **The redirect parameter from sign-in/sign-up:** Currently `destination = redirectUrl || DEFAULT_PATH`. We need to change the fallback to `/onboarding`. If a `redirectUrl` is explicitly provided (e.g., user was trying to access a specific page), we should still honor that and go to the redirect URL — the user is presumably not new if they had a target page. Actually, we should always go to `/onboarding` first since it auto-redirects if languages are set — so it's a safe passthrough. We'll change the fallback only (when no redirectUrl is given).
- `**getLanguageName` uses English display names:** This is a known limitation. Since `Intl.DisplayNames` is initialized with `["en"]`, language names will display in English. This is acceptable for now — users can still recognize their native language name (e.g., "Spanish", "French" are recognizable). A future improvement could detect browser locale.

---

## Implementation Todo List

1. **Add `getLanguageFlag()` helper to `lib/languages.ts`** — Maps ISO 639-1 language codes to emoji flags. Covers all 30 native language codes plus the 11 target language codes.
2. **Create `/app/(auth)/onboarding/page.tsx`** — Server component:
   - `requireSession()` or redirect to `/sign-in`
   - Fetch `targetLanguage` and `nativeLanguage` from DB
   - If both are set, redirect to `DEFAULT_PATH`
   - Otherwise render `<OnboardingForm nativeLanguage={nativeLanguage} />`
3. **Create `/components/onboarding/onboarding-form.tsx`** — Client component:
   - Two big `<select>` dropdowns with emoji flags: "I want to learn" (target) and "I speak" (native, preselected)
   - Each `<option>` rendered as `{flag} {languageName}` (e.g., "🇩🇪 German")
   - "Get Started" button (primary, large)
   - On submit: call `updateTargetLanguage()` and `updateNativeLanguage()`, then `router.push(DEFAULT_PATH)`
   - Validation: both must be selected, target !== native
   - Loading state on submit button
4. **Update `sign-up-form.tsx`** — Change default destination from `DEFAULT_PATH` to `"/onboarding"` (line 28)
5. **Update `sign-in-form.tsx`** — Change default destination from `DEFAULT_PATH` to `"/onboarding"` (line 27)
6. **Remove chat auto-onboarding in `chat-view.tsx`** — Remove lines 127-134 (the useEffect that auto-sends "I am a new user, I need onboarding")
7. **Keep landing page as-is** — "Go to App" continues pointing to `DEFAULT_PATH` (`/chat`) since existing users shouldn't go through an extra redirect hop.

