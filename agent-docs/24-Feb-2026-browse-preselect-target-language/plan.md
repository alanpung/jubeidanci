# Plan: Preselect Target Language in Browse Dropdowns

## Changes Required

### 1. `app/(main)/units/browse/page.tsx`
- Import `getTargetLanguage` from `@/lib/actions/preferences`
- Fetch the user's `targetLanguage` alongside `nativeLanguage`
- Pass `targetLanguage` as `initialTargetLanguage` prop to both `<BrowseUnits>` and `<CourseBrowser>`

### 2. `app/(main)/units/browse-units.tsx`
- Add `initialTargetLanguage?: string | null` to `BrowseUnitsProps`
- Initialize `targetLanguage` state with `initialTargetLanguage ?? ""` instead of `""`

### 3. `app/(main)/units/course-browser.tsx`
- Add `initialTargetLanguage?: string | null` to `CourseBrowserProps`
- Initialize `targetLanguage` state with `initialTargetLanguage ?? ""` instead of `""`

## Todo

- [ ] Update `browse/page.tsx` to fetch `targetLanguage` and pass it as prop
- [ ] Update `browse-units.tsx` to accept and use `initialTargetLanguage` prop
- [ ] Update `course-browser.tsx` to accept and use `initialTargetLanguage` prop
