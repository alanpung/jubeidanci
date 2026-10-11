# Research: Public Unit/Course Links + Sharing

## Current Architecture

### Routing Structure
- All authenticated routes live under `app/(main)/` which has a layout guard
- Auth pages live under `app/(auth)/` with no guard
- Landing page at `app/page.tsx` is public

### Key Routes Involved
| Route | File | Description |
|-------|------|-------------|
| `/unit/:unitId` | `app/(main)/unit/[unitId]/page.tsx` | Standalone unit detail (auth-gated by layout) |
| `/units/:courseId` | `app/(main)/units/[courseId]/page.tsx` | Course detail (auth-gated by layout) |
| `/unit/:unitId/lesson/:lessonIndex` | `app/(main)/unit/[unitId]/lesson/[lessonIndex]/page.tsx` | Lesson page |
| `/lesson/:courseId/:unitId/:lessonIndex` | `app/(main)/lesson/[courseId]/[unitId]/[lessonIndex]/page.tsx` | Course lesson page |
| `/sign-in` | `app/(auth)/sign-in/page.tsx` | Sign in page |
| `/sign-up` | `app/(auth)/sign-up/page.tsx` | Sign up page |

### Authentication Flow
1. **Layout-level guard**: `app/(main)/layout.tsx` calls `getSession()` and redirects to `/sign-in` if no session. This protects ALL routes under `(main)/`.
2. **No middleware.ts**: There is no Next.js middleware in the project.
3. **Server action guard**: All server actions use `requireSession()` which throws "Unauthorized".
4. **Post-login redirect**: Both sign-in and sign-up forms redirect to `DEFAULT_PATH = "/chat"` after success. Google OAuth uses `callbackURL: DEFAULT_PATH`.

### Unit Data Flow
- `getUnitWithContent(unitId)` in `lib/db/queries/courses.ts:409` fetches any unit by ID **without visibility checks**. It just does `db.select().from(unit).where(eq(unit.id, unitId))`.
- Units have a `visibility` column: `null` = private, `"public"` = public.
- The standalone unit page (`app/(main)/unit/[unitId]/page.tsx`) renders `StandaloneUnitPath` which shows the zigzag lesson path with `LessonNode` components linking to `/unit/:unitId/lesson/:lessonIndex`.

### Course Data Flow
- `getCourseWithContent(courseId, userId?)` in `lib/db/queries/courses.ts:133` fetches a course with visibility checks: public OR owned by the user.
- The course detail page (`app/(main)/units/[courseId]/page.tsx`) renders `LearningPath` which shows units as expandable cards with lesson nodes linking to `/lesson/:courseId/:unitId/:lessonIndex`.

### Current Sharing Capabilities
- **NONE**: No share buttons, copy-to-clipboard, or public link generation exists.
- No `navigator.clipboard` or `navigator.share` usage.

### Visibility Model
- `unit.visibility`: `null` (private) or `"public"`
- `course.visibility`: `null` (private) or `"public"`
- Public/Private badges already shown in `standalone-units.tsx` and `my-courses.tsx`

### Key Components
- `StandaloneUnitPath` (`app/(main)/unit/[unitId]/standalone-unit-path.tsx`): Client component rendering zigzag lesson path for a standalone unit. Uses `UnitCard`, `LessonNode`, `PathConnector`.
- `LearningPath` (`app/(main)/units/learning-path.tsx`): Client component for course learning path.
- `LessonNode` (`components/learning-path/lesson-node.tsx`): Renders individual lesson nodes with states: completed, current, locked.
- `UnitCard` (`components/learning-path/unit-card.tsx`): Renders unit card header with progress bar.

### Progress/Completion Dependencies
- `getUnitProgress(unitId)` in `lib/actions/progress.ts` requires a session (`requireSession()`).
- `getUserProgress(courseId)` similarly requires a session.
- The unit/course pages use these to show completion state.

## Problem Analysis

The core challenge is that the `(main)` layout gate blocks unauthenticated users from accessing ANY content page. To make public units/courses viewable by anonymous users, we need to create a separate route group that doesn't require auth.

### Option A: New Public Route Group
Create `app/(public)/unit/[unitId]/page.tsx` as a separate route outside `(main)/`. This page would:
- Check if unit is public
- Render a read-only version of the unit path
- Show CTA to sign up / sign in when clicking lessons

### Option B: Move Unit Pages Outside (main) with Conditional Auth
Move the unit page outside the `(main)` group and conditionally render with/without auth.

### Preferred: Option A
Option A is cleaner because:
- Does not disrupt existing authenticated experience
- The URL stays the same (`/unit/:unitId`)
- We just move/create the route outside the `(main)` group
- We can check if user is logged in and render the full experience vs. a public preview

Actually, the simplest approach: Move `/unit/[unitId]` out of `(main)/` into a new route group that optionally checks auth. If no auth, show the public preview. If auth, show the full experience with sidebar.

**Wait** -- there's a conflict. Next.js App Router doesn't allow the same route segment in two different route groups. So `/unit/[unitId]` can only exist in one place. We need to move it out of `(main)` entirely.

### Final Approach
1. Create `app/(public)/` route group with a simpler layout (no sidebar, no auth requirement)
2. Move `app/(main)/unit/[unitId]/page.tsx` to `app/(public)/unit/[unitId]/page.tsx`
3. The new page checks for session optionally:
   - If authenticated: render full experience (with sidebar layout injected or redirected to main)
   - If not authenticated: render a public preview of the unit with a CTA overlay
4. For lessons: keep them in `(main)/` since they need auth. When an unauthenticated user clicks a lesson, redirect to `/sign-up?redirect=/unit/:unitId/lesson/:lessonIndex`
5. Update sign-in/sign-up forms to support `redirect` query param

### Actually, Best Approach
The cleanest approach is:
1. Create new route group `app/(public)/` with its own layout (minimal, no auth gate)
2. Move unit detail page to `app/(public)/unit/[unitId]/page.tsx`
3. In this page: optionally check auth, fetch unit, verify it's public (if not authenticated)
4. If user is authenticated, wrap with the full (main) layout (sidebar etc.)
5. If user is not authenticated, show a clean public preview with a CTA
6. Redirect to signup URL includes the return path

For the redirect-after-login:
- Add `?redirect=` support to sign-in/sign-up forms
- Store redirect URL in sign-in/sign-up pages
- After successful auth, redirect to the stored URL instead of DEFAULT_PATH

### Copy Link Button
- Add a "Copy Link" badge-style button to `standalone-units.tsx` (for public units) and `my-courses.tsx` (for public courses)
- Use `navigator.clipboard.writeText()` with the public URL
- Style: gray badge with a link/copy icon, similar to the existing Public/Private badges but interactive
