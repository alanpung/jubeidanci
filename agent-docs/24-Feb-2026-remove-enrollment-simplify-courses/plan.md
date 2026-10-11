# Plan: Remove Enrollment & Simplify Course Navigation

## Goal

1. Remove the enrollment gate -- clicking a course goes straight to units/lessons
2. Remove "Continue Learning" section from `/units`
3. Keep "My Units" and "My Courses" sections
4. Add progress bars to "My Courses" cards
5. Clicking a course shows units directly (no "Start Course" button)

## Changes by File

### 1. DELETE `app/(main)/units/continue-learning.tsx`

- Entire file removed. No longer needed.

### 2. `app/(main)/units/page.tsx`

- Remove import of `ContinueLearning` and `getUserEnrolledCourses`
- Remove the `enrolled` fetch from `Promise.all`
- Remove `<ContinueLearning courses={enrolled} />`
- Pass `userId` to `<MyCourses>` so it can fetch progress data

### 3. `lib/content/types.ts`

- Remove `EnrolledCourseInfo` type (no longer used)
- Add `lessonCount` and `completedLessons` fields to `OwnedCourseInfo`

### 4. `lib/db/queries/courses.ts`

- Remove `getUserEnrolledCourses()` function entirely
- Modify `getUserOwnedCourses()` to also compute `lessonCount` and `completedLessons` (same approach used in `getUserEnrolledCourses` -- parse markdown for lesson counts, query `lessonCompletion` for completed counts)

### 5. `app/(main)/units/my-courses.tsx`

- Add a progress bar to `OwnedCourseCard`, matching the style from `StandaloneUnits`
- The component already receives `OwnedCourseInfo` -- we just need the new fields

### 6. `app/(main)/units/learning-path.tsx`

- Remove the `enrollment` prop from `LearningPathProps`
- Remove the enrollment gate (the `if (!enrollment)` block that shows "Start Course")
- Remove import of `enrollInCourse`
- Remove the `useTransition`/`useRouter` that was only for enrollment
- The component already computes lesson states from `completions` -- this continues to work

### 7. `app/(main)/units/[courseId]/page.tsx`

- Simplify: call `getUserProgress()` but only use `completions` (ignore `enrollment`)
- Pass only `completions` to `<LearningPath>` (no `enrollment` prop)

### 8. `lib/actions/progress.ts`

- Remove `enrollInCourse()` function
- Simplify `getUserProgress()` to only return completions (remove enrollment fetch)
- Keep `getUnitProgress()` and `getUserStatsData()` unchanged

### 9. `lib/actions/lesson.ts`

- Remove the `advanceEnrollment()` function
- Remove the `advanceEnrollment()` call from `completeLesson()`
- Remove `userCourseEnrollment` import

### 10. `lib/db/queries/courses.ts` (imports cleanup)

- Remove `userCourseEnrollment` import if no longer referenced

## What We Keep Untouched

- `lib/db/schema.ts` -- Keep the `userCourseEnrollment` table definition in the schema. We won't use it, but removing it would require a migration. Can be cleaned up later.
- `app/(main)/lesson/*/lesson-view.tsx` -- Already works for both course and standalone modes
- `components/learning-path/unit-card.tsx` -- Already has progress bar
- `components/learning-path/lesson-node.tsx` -- No enrollment dependency
- Standalone unit flow (`/unit/[unitId]/*`) -- Completely independent of enrollment
- Browse page (`/units/browse`) -- No enrollment dependency

## Implementation Order (Todo)

1. Update `lib/content/types.ts` -- Add progress fields to `OwnedCourseInfo`, remove `EnrolledCourseInfo`
2. Update `lib/db/queries/courses.ts` -- Remove `getUserEnrolledCourses()`, add progress to `getUserOwnedCourses()`
3. Update `lib/actions/progress.ts` -- Remove `enrollInCourse()`, simplify `getUserProgress()`
4. Update `lib/actions/lesson.ts` -- Remove `advanceEnrollment()` and its call
5. Delete `app/(main)/units/continue-learning.tsx`
6. Update `app/(main)/units/page.tsx` -- Remove "Continue Learning" section
7. Update `app/(main)/units/learning-path.tsx` -- Remove enrollment gate
8. Update `app/(main)/units/[courseId]/page.tsx` -- Stop passing enrollment
9. Update `app/(main)/units/my-courses.tsx` -- Add progress bars to course cards
10. Verify build passes

