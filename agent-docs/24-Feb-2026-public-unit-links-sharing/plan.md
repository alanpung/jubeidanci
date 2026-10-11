# Plan: Public Unit/Course Links + Copy Link Button

## Overview

Make public unit and course pages accessible without authentication, so links like `/unit/:unitId` and `/units/:courseId` can be shared. Anonymous visitors see a read-only preview of the learning path; clicking any lesson redirects to sign-up, and after signing in/up they are returned to the original URL. Also add a "Copy Link" badge-style button to public units and courses in the management views.

## Architecture Approach

Since Next.js App Router does not allow the same route segment in two different route groups, we will **move** the unit detail and course detail pages out of the `(main)` route group into a new top-level route that conditionally handles auth.

### Key Design Decisions

1. **New route group `app/(public-or-auth)/`**: This group will have its own layout that optionally checks for auth. If authenticated, it renders the full sidebar/topbar layout. If not, it renders a minimal public layout.

2. **Public preview for anonymous users**: Anonymous visitors see the unit's learning path (zigzag lesson nodes), but all lessons show as "locked" with a CTA. Clicking anywhere actionable redirects to `/sign-up?redirect=<current-url>`.

3. **Redirect-after-auth**: Update sign-in and sign-up forms to accept a `redirect` query parameter. After successful auth, redirect to the stored URL instead of `DEFAULT_PATH`.

4. **Visibility check**: The public page only shows units/courses with `visibility === "public"`. Private content returns 404 for anonymous users but works normally for the owner/admin.

5. **Copy Link button**: Add a gray badge-style "Copy Link" button with a link icon to `standalone-units.tsx` and `my-courses.tsx` for public units/courses.

## Implementation Steps

### Step 1: Create the `(public-or-auth)` route group with a conditional layout

Create `app/(public-or-auth)/layout.tsx`:
- Call `getSession()` (non-throwing)
- If authenticated: render with `<Sidebar>`, `<TopBar>`, `<MobileNav>` (same as `(main)` layout)
- If not authenticated: render a minimal layout with just a header bar (OpenLingo logo + Sign Up button)

### Step 2: Move unit detail page to `(public-or-auth)`

Move `app/(main)/unit/[unitId]/page.tsx` -> `app/(public-or-auth)/unit/[unitId]/page.tsx`:
- Optionally get session (don't redirect if missing)
- Fetch unit with `getUnitWithContent(unitId)`  
- **Visibility check**: If unit is NOT public AND user is not authenticated, return `notFound()`
- **Visibility check**: If unit is NOT public AND user is authenticated but not the owner, return `notFound()`
- If authenticated: call `getUnitProgress()` and render `StandaloneUnitPath` (same as current)
- If not authenticated: render `PublicUnitPath` (new component) with all lessons locked + sign-up CTA

Move associated files too:
- `app/(main)/unit/[unitId]/standalone-unit-path.tsx` -> `app/(public-or-auth)/unit/[unitId]/standalone-unit-path.tsx`
- `app/(main)/unit/[unitId]/loading.tsx` -> `app/(public-or-auth)/unit/[unitId]/loading.tsx`

### Step 3: Create the `PublicUnitPath` component

Create `app/(public-or-auth)/unit/[unitId]/public-unit-path.tsx`:
- Similar to `StandaloneUnitPath` but:
  - All lessons show as "locked" (no progress tracking)
  - Clicking any lesson node redirects to `/sign-up?redirect=/unit/:unitId`
  - A prominent CTA banner at the top: "Sign up to start learning!"

### Step 4: Move course detail page to `(public-or-auth)`

Move `app/(main)/units/[courseId]/page.tsx` -> `app/(public-or-auth)/units/[courseId]/page.tsx`:
- Same pattern: optional auth, visibility check, public preview for anon users
- If authenticated: render `LearningPath` with progress (same as current)
- If not authenticated: render `PublicLearningPath` (new) with all lessons locked

Move `app/(main)/units/[courseId]/loading.tsx` too.

### Step 5: Create the `PublicLearningPath` component

Create `app/(public-or-auth)/units/[courseId]/public-learning-path.tsx`:
- Based on `LearningPath` but with all lessons locked
- Clicking anything redirects to `/sign-up?redirect=/units/:courseId`

### Step 6: Update sign-in/sign-up forms to support `redirect` param

Modify `components/auth/sign-in-form.tsx`:
- Accept `redirect` prop (or read from URL search params)
- After successful sign-in, `router.push(redirect || DEFAULT_PATH)`
- Pass `callbackURL: redirect || DEFAULT_PATH` to Google OAuth

Modify `components/auth/sign-up-form.tsx`:
- Same changes

Modify `app/(auth)/sign-in/page.tsx` and `app/(auth)/sign-up/page.tsx`:
- Read `redirect` from searchParams
- Pass to forms
- Also add cross-links with redirect preserved (sign-in <-> sign-up)

### Step 7: Add "Copy Link" button to public units in `standalone-units.tsx`

In `app/(main)/units/standalone-units.tsx`, add a "Copy Link" badge button:
- Only shown when `isPublic` is true
- Gray badge style matching existing badges
- Uses `navigator.clipboard.writeText()` to copy the full URL
- Shows brief "Copied!" feedback
- Positioned in the actions bar

### Step 8: Add "Copy Link" button to public courses in `my-courses.tsx`

In `app/(main)/units/my-courses.tsx`, add a "Copy Link" badge button:
- Same pattern as units
- Only shown when `isPublic` is true
- Copies the course URL

### Step 9: Update lesson routes to redirect unauthenticated users

The lesson pages remain in `(main)/` (they require auth to run exercises). But the `(main)` layout redirect should preserve the intended URL.

Modify `app/(main)/layout.tsx`:
- When redirecting unauthenticated users, include `?redirect=<current-path>` in the sign-in redirect URL

### Step 10: Ensure `getUnitWithContent` returns visibility info

Update `getUnitWithContent()` in `lib/db/queries/courses.ts` to also return the `visibility` and `createdBy` fields, so the public page can check access.

Similarly, ensure `getCourseWithContent()` returns `visibility` and `createdBy`.

## Todo List

- [ ] 1. Update `UnitWithContent` type and `getUnitWithContent()` to include `visibility` and `createdBy`
- [ ] 2. Update `Course` type and `getCourseWithContent()` to include `visibility` and `createdBy`
- [ ] 3. Create `app/(public-or-auth)/layout.tsx` with conditional auth layout
- [ ] 4. Move unit detail page to `app/(public-or-auth)/unit/[unitId]/` and add public mode
- [ ] 5. Create `PublicUnitPath` component for anonymous users
- [ ] 6. Move course detail page to `app/(public-or-auth)/units/[courseId]/` and add public mode
- [ ] 7. Create `PublicLearningPath` component for anonymous users
- [ ] 8. Update sign-in/sign-up forms and pages to support `redirect` query param
- [ ] 9. Update `(main)` layout to pass redirect URL when redirecting to sign-in
- [ ] 10. Add "Copy Link" button to public units in `standalone-units.tsx`
- [ ] 11. Add "Copy Link" button to public courses in `my-courses.tsx`
- [ ] 12. Test the build compiles without errors
