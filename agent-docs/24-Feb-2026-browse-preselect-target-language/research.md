# Research: Browse Page Dropdown Preselection

## Current Behavior

The `/units/browse` page has two sections with dropdowns:

### 1. BrowseUnits (`browse-units.tsx`)
- **Target Language dropdown**: defaults to `""` ("All languages") — no preselection
- **Level dropdown**: defaults to `""` ("All levels")
- The component receives only `units: StandaloneUnitInfo[]` as props — no language preference info

### 2. CourseBrowser (`course-browser.tsx`)
- **Source Language dropdown**: preselected to user's `nativeLanguage` via `initialSourceLanguage` prop
- **Target Language dropdown**: defaults to `""` ("All target languages") — no preselection
- **Level dropdown**: defaults to `""` ("All levels")

### Data Flow

1. `browse/page.tsx` (server component):
   - Fetches `nativeLanguage` via `getNativeLanguage(userId)` from `lib/actions/profile.ts`
   - Does NOT fetch `targetLanguage` at all
   - Passes `nativeLanguage` as `initialSourceLanguage` to `CourseBrowser`
   - Passes only `units` to `BrowseUnits`

2. `getTargetLanguage()` exists in `lib/actions/preferences.ts` (line 12-22) but is not used on the browse page.

3. The `userPreferences` table has both `nativeLanguage` and `targetLanguage` columns.

## Problem

The target language dropdown in both `BrowseUnits` and `CourseBrowser` should be preselected to the user's `targetLanguage` preference from the database, but currently they default to "All" (empty string).

## Key Files

| File | Path |
|------|------|
| Browse page (server) | `app/(main)/units/browse/page.tsx` |
| BrowseUnits (client) | `app/(main)/units/browse-units.tsx` |
| CourseBrowser (client) | `app/(main)/units/course-browser.tsx` |
| getTargetLanguage | `lib/actions/preferences.ts` |
| getNativeLanguage | `lib/actions/profile.ts` |
