# Research: Unit Browser, Public Units, and Parser Failure Handling

## Overview

Three features requested:

1. **Unit/Course Browser** with "Add to my units" functionality
2. **Make Public / Make Private** buttons for units/courses
3. **Graceful parser failure handling** for broken units

---

## Feature 1: Unit/Course Browser + "Add to My Units"

### Current Architecture

**"My Units" = Standalone Units** (units where `courseId IS NULL`). Displayed in `StandaloneUnits` component on `/units` page.

**Query:** `getStandaloneUnits()` at `lib/db/queries/courses.ts:305-370`

- Fetches units where `courseId IS NULL` AND (`createdBy = userId` OR `visibility = 'public'`)
- Returns `StandaloneUnitInfo` objects with: id, title, description, icon, color, targetLanguage, sourceLanguage, level, lessonCount, completedLessons, visibility, creatorName, isOwner

**Current problem:** Public standalone units already appear in "My Units" — but there's no way to:

1. Distinguish between "units I've added" vs "all public units I can see"
2. Explicitly "add" a public unit to my collection
3. Auto-add a unit when I start practicing it

**How units currently enter "My Units":**

- AI creates them via `createUnit` tool (`lib/ai/tools.ts:141-227`) with `createdBy: userId` and no `courseId`
- No other path exists

### The "Add to My Units" Concept

There's no DB concept of "user has added this unit to their collection" for units they don't own. Currently ownership is tracked only via `createdBy`.

**Options for implementing "Add to my units":**

1. **New junction table** `userUnitLibrary` (userId, unitId) — tracks which public units a user has added to their library
2. **Clone the unit** — copy the markdown and create a new unit owned by the user (wasteful, diverges)

Option 1 (junction table) is clearly the right approach. This separates "I created this" from "I added this to my library."

### Where the Unit Browser Lives

Currently:

- `CourseBrowser` (`app/(main)/units/course-browser.tsx:1-100`) — shows courses with filters, no standalone units
- `StandaloneUnits` (`app/(main)/units/standalone-units.tsx:1-129`) — shows "My Units" (owned + public standalones)

**What's needed:** A browse-able section for public standalone units that the user hasn't added yet, with an "Add to my units" button.

### Auto-add on Practice

When a user clicks on a public standalone unit and starts a lesson:

- Lesson page: `app/(main)/unit/[unitId]/lesson/[lessonIndex]/page.tsx:1-34`
- Completion: `completeLesson()` at `lib/actions/lesson.ts:32-127`

The `completeLesson` action is the natural place to auto-add the unit to the user's library (insert into `userUnitLibrary` if not exists).

---

## Feature 2: Make Public / Make Private

### Current Visibility Model

**Schema columns:**

- `unit.visibility` — `text`, nullable. `"public"` means public, null/absent means private (`lib/db/schema.ts:288`)
- `course.visibility` — same pattern (`lib/db/schema.ts:266`)

**Where visibility is checked:**

- `listCourses()` — `courses.ts:41-47` — filters by `visibility = 'public'` OR `createdBy = userId`
- `listCoursesWithLessonCounts()` — `courses.ts:101-109` — same pattern for units within courses
- `getCourseWithContent()` — `courses.ts:152-159` — unit visibility within course
- `getUserEnrolledCourses()` — `courses.ts:226-274` — enrolled courses with visible units
- `getStandaloneUnits()` — `courses.ts:326-330` — standalone units by visibility

**What exists:**

- The `StandaloneUnits` component already shows Public/Private badges (`standalone-units.tsx:47-55`)
- No server actions exist for toggling visibility

**What's needed:**

1. Server action `makeUnitPublic(unitId)` — sets `visibility = "public"`, verifiable by owner only
2. Server action `makeUnitPrivate(unitId)` — sets `visibility = null`, admin-only
3. Similarly for courses: `makeCoursePublic(courseId)`, `makeCoursePrivate(courseId)` (admin only)
4. UI: "Make Public" button for unit owners (with irreversibility warning)
5. UI: "Make Private" button for admin users

### Admin Detection

`isAdminEmail()` at `lib/ai/models.ts:53-56` — reads `ADMIN_EMAILS` env var (comma-separated). Currently only used for model selection.

Exported from `lib/ai/index.ts:6` as `isAdminEmail`.

**For the UI:** We need to pass `isAdmin` flag down to the client. The session includes `user.email`, so we can compute it server-side and pass as a prop.

---

## Feature 3: Graceful Parser Failure Handling

### The Parser Chain

1. `getUnitLessons(markdown)` at `lib/content/loader.ts:17-19` — calls `parseUnitMarkdown(markdown).lessons`
2. `parseUnitMarkdown(raw)` at `lib/content/unit-parser.ts:32-81`:
  - Uses `gray-matter` to extract frontmatter
  - Regex finds lesson blocks: `/^---[ \t]*\n([\s\S]*?)\n---[ \t]*$/gm`
  - For each block, calls `parseExercisesFromMarkdown()` on exercise content
3. `parseExercisesFromMarkdown(content)` at `lib/content/parser.ts:20-45`:
  - Splits on `[type-tag]` boundaries
  - Each block goes through `parseExercise()` which can **throw** on:
    - Missing exercise type tag (line 49)
    - Unknown exercise type (line 87)
    - Missing required fields (e.g., `getField()` throws at line 135)
    - Invalid pair format (line 237)
    - Zod validation failure (`validateExercise()` at line 97-122)

### Where Failures Crash the Page

**All calls to `getUnitLessons()` in `courses.ts` are UNGUARDED:**


| Location         | Line                         | Function                        | Impact                                        |
| ---------------- | ---------------------------- | ------------------------------- | --------------------------------------------- |
| `courses.ts:119` | `getUnitLessons(u.markdown)` | `listCoursesWithLessonCounts()` | Crashes course listing — entire `/units` page |
| `courses.ts:178` | `getUnitLessons(u.markdown)` | `getCourseWithContent()`        | Crashes course detail page                    |
| `courses.ts:280` | `getUnitLessons(u.markdown)` | `getUserEnrolledCourses()`      | Crashes "Continue Learning" section           |
| `courses.ts:364` | `getUnitLessons(u.markdown)` | `getStandaloneUnits()`          | Crashes "My Units" section                    |
| `courses.ts:411` | `getUnitLessons(u.markdown)` | `getUnitWithContent()`          | Crashes individual unit page                  |


**Already protected:**

- `lib/actions/lesson.ts:81-99` — SRS word extraction has try/catch
- `lib/content/loader.ts:59-80` — Content directory loading has try/catch

### Fix Strategy

Two complementary approaches:

**A. Safe parser wrapper:** Create `getUnitLessonsSafe(markdown)` that wraps `getUnitLessons` in try/catch and returns `{ lessons, parseError }`. Use this everywhere in `courses.ts`.

**B. UI handling:** When a unit has `parseError`:

- Show a red "Can't be parsed" badge
- Make the unit card non-clickable/greyed out
- Don't allow navigation to the unit detail page

### Type Changes Needed

`StandaloneUnitInfo` needs:

- `parseError?: boolean` — flag indicating the unit failed to parse

`CourseListItem` might need:

- Handling at the lesson-count level (skip unparseable units in count)

For `getCourseWithContent()` and `getUnitWithContent()`, units with parse errors should be returned with `lessons: []` and a `parseError: true` flag.

---

## Key Files Summary


| File                                    | Purpose                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `lib/db/schema.ts`                      | DB schema — needs new `userUnitLibrary` table                                                |
| `lib/db/queries/courses.ts`             | All unit/course queries — needs parser safety + library join                                 |
| `lib/content/types.ts`                  | TypeScript types — needs `parseError` field, `userUnitLibrary` types                         |
| `lib/content/loader.ts`                 | `getUnitLessons()` — needs safe wrapper                                                      |
| `lib/actions/units.ts`                  | Unit server actions — needs `makePublic`, `makePrivate`, `addToLibrary`, `removeFromLibrary` |
| `lib/actions/lesson.ts`                 | `completeLesson()` — needs auto-add to library                                               |
| `lib/ai/models.ts`                      | `isAdminEmail()` — already exists, needs re-export                                           |
| `app/(main)/units/page.tsx`             | Main page — needs to pass `isAdmin` flag, fetch browse data                                  |
| `app/(main)/units/standalone-units.tsx` | "My Units" UI — needs make-public button, remove button, parser error badge                  |
| `app/(main)/units/course-browser.tsx`   | Course browser — needs browse-standalone-units section                                       |
| `app/(main)/unit/[unitId]/page.tsx`     | Unit detail — needs parser error handling                                                    |


---

## Edge Cases to Consider

1. **User adds a public unit, then the owner makes it private** — The unit should still remain in the user's library? No — if the owner could make it private, that's admin-only and means it should be removed from everyone's library. We should probably cascade-delete library entries when a unit is made private.
2. **User owns a unit and also has it in library** — Shouldn't happen; owned units don't need library entries. The queries should handle `isOwner` separately from `isInLibrary`.
3. **Counting lessons for broken units** — Should return 0, not crash.
4. **User tries to navigate directly to `/unit/{id}/lesson/{index}` for a broken unit** — Should show error or redirect back.
5. **Make public is irreversible for non-admins** — Need clear UI warning. Once public, only admins can revert.

