# Research: Remove Enrollment & Simplify Course Navigation

## Current Architecture

### `/units` Page (Main Learn Hub)
**File:** `app/(main)/units/page.tsx`

The page has 3 sections:
1. **"Continue Learning"** - Shows courses the user is **enrolled** in (via `getUserEnrolledCourses()`)
2. **"My Units"** - Standalone units the user owns or has added to their library (via `getStandaloneUnits()`)
3. **"My Courses"** - Courses the user has **created** (via `getUserOwnedCourses()`)

### Enrollment System (What Needs to Be Removed)

#### Database Table
**File:** `lib/db/schema.ts:90-104`
- `userCourseEnrollment` table stores: `userId`, `courseId`, `currentUnitId`, `currentLessonIndex`
- Has a unique index on `(userId, courseId)`
- This table tracks the user's "position" in a course (which unit and lesson they're on)

#### Server Actions
**File:** `lib/actions/progress.ts`

- `getUserProgress(courseId)` - Fetches enrollment record + lesson completions for a course
  - Returns `{ enrollment, completions }` where `enrollment` can be null if not enrolled
- `enrollInCourse(courseId)` - Creates a `userCourseEnrollment` record + initializes `userStats`
- `getUnitProgress(unitId)` - Just fetches lesson completions (no enrollment)
- `getUserStatsData()` - Fetches/creates user stats

#### The Enrollment Gate
**File:** `app/(main)/units/learning-path.tsx:62-81`

When `enrollment` is `null`, the `<LearningPath>` component renders a "Start Course" / "Ready to start learning?" prompt with a button that calls `enrollInCourse()`. Only after enrollment does it show the units and lessons.

#### Enrollment Advancement
**File:** `lib/actions/lesson.ts:180-242`

`advanceEnrollment()` is called when a lesson is completed. It advances the enrollment's `currentUnitId`/`currentLessonIndex` to the next lesson or next unit. This is used so "Continue Learning" can show the user where they left off.

### "Continue Learning" Section
**File:** `app/(main)/units/continue-learning.tsx`

- Shows enrolled courses with title, language, and a progress bar (completedLessons/totalLessons)
- Links to `/units/${course.id}` (the course detail page)
- Data comes from `getUserEnrolledCourses()` which joins enrollment + course + completions

### "My Courses" Section
**File:** `app/(main)/units/my-courses.tsx`

- Shows courses the user **created** (via `getUserOwnedCourses()`)
- Each card has: title, language, level, unit count, visibility badge
- Actions: Manage (add/remove units), Make Public, Delete
- **No progress bar** currently
- Links to `/units/${course.id}`

### "My Units" Section
**File:** `app/(main)/units/standalone-units.tsx`

- Shows standalone units (not in any course) that the user owns or has in their library
- **Has a progress bar** (completedLessons/lessonCount)
- Links to `/unit/${unit.id}`

### Course Detail Page
**File:** `app/(main)/units/[courseId]/page.tsx`

- Fetches course content via `getCourseWithContent(courseId, userId)`
- Fetches progress via `getUserProgress(course.id)` which returns `{ enrollment, completions }`
- Passes both to `<LearningPath>`

### LearningPath Component
**File:** `app/(main)/units/learning-path.tsx`

Two states:
1. **Not enrolled** -> Shows "Start Course" button
2. **Enrolled** -> Shows unit selector (list of UnitCards), and when clicking a unit, shows lesson nodes

The component uses completions to determine which lessons are completed, current, or locked.

### How Progress Is Tracked

Progress tracking is **independent of enrollment**. It uses the `lessonCompletion` table:
- `lessonCompletion` records `(userId, unitId, lessonIndex)` each time a lesson is completed
- This data is used to calculate progress in both standalone units and courses
- The enrollment system (`userCourseEnrollment`) is an **additional layer** on top that tracks where the user "should be" in a course

### Query: `getUserEnrolledCourses()`
**File:** `lib/db/queries/courses.ts:219-313`

Complex query that:
1. Gets all enrollments for the user
2. Fetches course details
3. Counts completed lessons per course (via `lessonCompletion` joined with `unit`)
4. Counts total lessons per course (by parsing markdown)
5. Returns `EnrolledCourseInfo` with `completedLessons`, `lessonCount`, etc.

### Query: `getUserOwnedCourses()`
**File:** `lib/db/queries/courses.ts:532-556`

Simple query that:
1. Gets courses created by the user
2. Counts units per course
3. Returns `OwnedCourseInfo` - **does NOT include progress data** (no `completedLessons`/`lessonCount`)

### Types
**File:** `lib/content/types.ts`

- `EnrolledCourseInfo` extends `CourseListItem` with `currentUnitId`, `currentLessonIndex`, `completedLessons`
- `OwnedCourseInfo` has `id`, `title`, languages, `level`, `visibility`, `unitCount`, `createdAt` -- no progress
- `CourseListItem` has `id`, `title`, languages, `level`, `unitCount`, `lessonCount`

### Lesson Routes
Two paths to lessons:
1. **Course-based:** `/lesson/[courseId]/[unitId]/[lessonIndex]` 
2. **Standalone:** `/unit/[unitId]/lesson/[lessonIndex]`

The `LessonView` component (`lesson-view.tsx`) handles both cases. It constructs `backUrl` based on whether `courseId` exists:
- With courseId: back to `/units/${courseId}?unit=${unitId}`
- Without courseId: back to `/unit/${unitId}`

## Key Findings

1. **Enrollment is an unnecessary gate** - Progress tracking works via `lessonCompletion` regardless of enrollment status. The enrollment system only adds the "position tracker" (`currentUnitId`/`currentLessonIndex`) and the enrollment gate UI.

2. **"Continue Learning" depends entirely on enrollment** - It uses `getUserEnrolledCourses()` which filters by enrollment records. To show courses the user has practiced (without enrollment), we need a different query approach.

3. **"My Courses" has no progress** - The `getUserOwnedCourses()` query doesn't fetch completion data. Adding progress bars requires extending this query or using a new one.

4. **The enrollment advancement in `lesson.ts`** is the only code that updates the enrollment table after initial creation. If we remove enrollment, this code becomes dead.

5. **Lesson completion works without enrollment** - `completeLesson()` in `lesson.ts` records completions in `lessonCompletion` table. The `advanceEnrollment()` call is a separate step that can be removed without affecting lesson tracking.

6. **The `LearningPath` component needs the enrollment check removed** - Currently at line 62 it returns the "Start Course" button when `!enrollment`. We need to always show the unit/lesson view.

## Files That Will Need Changes

| File | Change |
|------|--------|
| `app/(main)/units/page.tsx` | Remove `ContinueLearning`, merge course display into `MyCourses` with progress |
| `app/(main)/units/continue-learning.tsx` | **DELETE** entire file |
| `app/(main)/units/learning-path.tsx` | Remove enrollment gate (lines 62-81), remove enrollment prop |
| `app/(main)/units/[courseId]/page.tsx` | Stop fetching enrollment, just pass completions |
| `app/(main)/units/my-courses.tsx` | Add progress bars to owned course cards |
| `lib/actions/progress.ts` | Remove `enrollInCourse()`, simplify `getUserProgress()` to just return completions |
| `lib/actions/lesson.ts` | Remove `advanceEnrollment()` call from `completeLesson()` |
| `lib/db/queries/courses.ts` | Remove `getUserEnrolledCourses()`, add progress data to `getUserOwnedCourses()` |
| `lib/content/types.ts` | Remove `EnrolledCourseInfo`, add progress fields to `OwnedCourseInfo` |

## Files That Can Stay As-Is

| File | Reason |
|------|--------|
| `lib/db/schema.ts` | Keep `userCourseEnrollment` table in schema (can clean up later via migration) |
| `app/(main)/lesson/*/lesson-view.tsx` | Already handles both course and standalone modes |
| `components/learning-path/unit-card.tsx` | Already has progress bar support |
| `components/learning-path/lesson-node.tsx` | No enrollment dependency |
| `app/(main)/unit/*/page.tsx` | Standalone unit flow - no enrollment |
