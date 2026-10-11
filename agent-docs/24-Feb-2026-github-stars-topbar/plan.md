# Plan: Add GitHub Stars Badge to Authenticated Top Bar

## Overview

Add a compact GitHub link with star count to the top bar that signed-in users see, matching the style already used on the landing page but sized appropriately for the header.

## Changes

### Step 1: Extract `getGitHubStars()` to a shared utility

**Create `lib/github.ts`**
- Move the `getGitHubStars()` function from `app/page.tsx` into `lib/github.ts` so it can be reused by both the landing page and the layouts.

**Update `app/page.tsx`**
- Import `getGitHubStars` from `@/lib/github` instead of defining it locally.
- Remove the local function definition.

### Step 2: Update `TopBar` component to accept and render GitHub stars

**Modify `components/layout/top-bar.tsx`**
- Add `githubStars?: number | null` to the `TopBarProps` interface.
- Add a compact GitHub badge between the stats section and the right-side user info. It will be placed next to the stats on the left-center area.
- The badge will be:
  - A link to `https://github.com/pretzelai/openlingo` opening in a new tab
  - Compact: smaller padding than the landing page version, fitting `h-16` bar height
  - Contains: GitHub octocat SVG (16x16) + star SVG (12x12) + formatted count
  - Hidden on very small screens (`hidden sm:inline-flex`) to avoid overcrowding mobile
  - Same visual style as landing page (rounded-full, border, bg-white, hover effects) but scaled down

### Step 3: Pass GitHub stars from layouts to TopBar

**Modify `app/(main)/layout.tsx`**
- Import `getGitHubStars` from `@/lib/github`.
- Fetch stars in parallel with existing stats fetches.
- Pass `githubStars={stars}` to `<TopBar>`.

**Modify `app/(public-or-auth)/layout.tsx`**
- Same changes as above, but only in the authenticated branch.

## Todo List

1. Create `lib/github.ts` with extracted `getGitHubStars()` function
2. Update `app/page.tsx` to import from `lib/github.ts`
3. Update `components/layout/top-bar.tsx` to accept `githubStars` prop and render badge
4. Update `app/(main)/layout.tsx` to fetch and pass GitHub stars
5. Update `app/(public-or-auth)/layout.tsx` to fetch and pass GitHub stars
