# Implementation Plan

## Feature 3: Graceful Parser Failure Handling (implement first — lowest risk, unblocks other features)

### 3.1 Create safe parser wrapper

**File:** `lib/content/loader.ts`

Add a new function `getUnitLessonsSafe(markdown: string): { lessons: UnitLesson[]; parseError: boolean }` that wraps `getUnitLessons()` in try/catch. On failure, returns `{ lessons: [], parseError: true }`.

### 3.2 Update types

**File:** `lib/content/types.ts`

Add `parseError?: boolean` to `StandaloneUnitInfo`. Add `parseError?: boolean` to `UnitWithContent`.

### 3.3 Update all query functions to use safe parser

**File:** `lib/db/queries/courses.ts`

Replace all 5 unguarded `getUnitLessons()` calls with `getUnitLessonsSafe()`:

1. **Line 119** in `listCoursesWithLessonCounts()` — use safe version, skip broken units in count
2. **Line 178** in `getCourseWithContent()` — use safe version, include `parseError` flag on unit
3. **Line 280** in `getUserEnrolledCourses()` — use safe version, skip broken units in count
4. **Line 364** in `getStandaloneUnits()` — use safe version, include `parseError` flag
5. **Line 411** in `getUnitWithContent()` — use safe version, include `parseError` flag

### 3.4 Update standalone-units UI to show error badge

**File:** `app/(main)/units/standalone-units.tsx`

When `unit.parseError === true`:
- Replace the clickable `<Link>` with a non-clickable `<div>` styled with `opacity-60 cursor-not-allowed`
- Show a red badge: "Can't be parsed" next to the Public/Private badge
- Hide the progress bar (lessonCount is 0)
- Keep Edit Markdown link visible for owners so they can fix it

### 3.5 Update unit detail page to handle parse errors

**File:** `app/(main)/unit/[unitId]/page.tsx`

If `unit.parseError`, show an error message instead of the lesson path. For owners, show a link to the edit page.

### 3.6 Update course detail to handle unparseable units within a course

**File:** `app/(main)/units/learning-path.tsx`

Units with `parseError` should show greyed out with a "Can't be parsed" indicator instead of lesson nodes.

---

## Feature 2: Make Public / Make Private (implement second — needed by Feature 1)

### 2.1 Create server actions for visibility toggling

**File:** `lib/actions/units.ts`

Add:
- `makeUnitPublic(unitId: string)` — verifies ownership via session, sets `visibility = "public"`. Returns success/error.
- `makeUnitPrivate(unitId: string)` — verifies admin via `isAdminEmail(session.user.email)`, sets `visibility = null`. Also deletes any `userUnitLibrary` entries for this unit (to be added in Feature 1).
- `makeCoursePublic(courseId: string)` — verifies ownership, sets `visibility = "public"` on the course.
- `makeCoursePrivate(courseId: string)` — admin only, sets `visibility = null`.

### 2.2 Update standalone-units UI with Make Public button

**File:** `app/(main)/units/standalone-units.tsx`

For units where `isOwner && visibility !== "public"`:
- Show a "Make Public" button in the owner actions row (next to "Edit Markdown")
- On click, show a confirmation dialog (browser `confirm()` is fine, or a simple modal) with the warning:
  - "This decision is irreversible. All users will have access to this unit. Your name will be shown as the author."
- On confirm, call `makeUnitPublic(unitId)`
- On success, refresh the page (`router.refresh()`)

### 2.3 Update standalone-units UI with Make Private button (admin only)

**File:** `app/(main)/units/standalone-units.tsx`

Need to receive `isAdmin` prop from parent. For units where `isAdmin && visibility === "public"`:
- Show a "Make Private" button (styled in red/warning)
- On click, call `makeUnitPrivate(unitId)`

### 2.4 Pass isAdmin prop from page to components

**File:** `app/(main)/units/page.tsx`

Compute `isAdmin` server-side using `isAdminEmail(session?.user?.email)` and pass it down to `<StandaloneUnits>`.

---

## Feature 1: Unit/Course Browser with "Add to My Units"

### 1.1 Create userUnitLibrary table

**File:** `lib/db/schema.ts`

Add new table:
```typescript
export const userUnitLibrary = pgTable(
  "user_unit_library",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    unitId: text("unit_id").notNull().references(() => unit.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_unit_library_unique").on(table.userId, table.unitId)]
);
```

### 1.2 Generate and run migration

Run `bun run db:generate` to create migration, then `bun run db:migrate` (or `db:push`) to apply.

### 1.3 Create server actions for library management

**File:** `lib/actions/units.ts`

Add:
- `addUnitToLibrary(unitId: string)` — inserts into `userUnitLibrary` (onConflictDoNothing). Validates that the unit exists and is public. Returns success/error.
- `removeUnitFromLibrary(unitId: string)` — deletes from `userUnitLibrary`. Returns success/error.

### 1.4 Auto-add to library on lesson completion

**File:** `lib/actions/lesson.ts`

In `completeLesson()`, after the existing logic, check:
- If the unit has no courseId (standalone) AND is public AND `createdBy !== userId` → insert into `userUnitLibrary` (onConflictDoNothing)

This means starting to practice a public unit auto-adds it. We already have `unitRow` fetched at that point, we just need to also select `visibility` and `createdBy`.

### 1.5 Update getStandaloneUnits query to include library units

**File:** `lib/db/queries/courses.ts`

Modify `getStandaloneUnits()`:
- Currently: `WHERE courseId IS NULL AND (createdBy = userId OR visibility = 'public')`
- New "My Units" query: `WHERE courseId IS NULL AND (createdBy = userId OR unitId IN (SELECT unitId FROM userUnitLibrary WHERE userId = :userId))`
- This means "My Units" shows: units I created + units I explicitly added to library
- Add `isInLibrary: boolean` to the return type

### 1.6 Create a "Browse Public Units" section/query

**File:** `lib/db/queries/courses.ts`

Add new function `getBrowsableUnits(userId: string)`:
- Fetches units where `courseId IS NULL AND visibility = 'public' AND createdBy != userId AND unitId NOT IN (SELECT unitId FROM userUnitLibrary WHERE userId = :userId)`
- Returns same shape as `StandaloneUnitInfo` but without completion data (user hasn't started these)
- Include filters: targetLanguage, level

### 1.7 Create BrowseUnits component

**File:** `app/(main)/units/browse-units.tsx` (new file)

A client component similar to `CourseBrowser`:
- Shows public standalone units the user hasn't added yet
- Each card shows: title, description, language, level, lesson count, author name
- Has an "Add to My Units" button that calls `addUnitToLibrary()`
- Clicking the unit title/card navigates to `/unit/{id}` (which auto-adds on practice)
- Include language/level filter dropdowns

### 1.8 Add "Remove from Library" option for non-owned library units

**File:** `app/(main)/units/standalone-units.tsx`

For units where `!isOwner && isInLibrary`:
- Show a "Remove" button in the actions row
- On click, call `removeUnitFromLibrary(unitId)`

### 1.9 Update the /units page layout

**File:** `app/(main)/units/page.tsx`

Add the `getBrowsableUnits()` call to the `Promise.all`. Pass browsable units to a new `<BrowseUnits>` component. Final page layout order:
1. Continue Learning (enrolled courses)
2. My Units (owned + library standalone units)
3. Browse Units (public standalone units not yet in library)
4. Browse Courses (existing)

### 1.10 Update StandaloneUnitInfo type

**File:** `lib/content/types.ts`

Add `isInLibrary?: boolean` to `StandaloneUnitInfo`.

---

## DB Migration Summary

One new table needed:
- `user_unit_library` (id, userId, unitId, addedAt) with unique index on (userId, unitId)

No existing tables need column changes — visibility and createdBy already exist.

---

## Implementation Todo List

1. [ ] **3.1** Create `getUnitLessonsSafe()` in `lib/content/loader.ts`
2. [ ] **3.2** Add `parseError` to types in `lib/content/types.ts`
3. [ ] **3.3** Update all 5 `getUnitLessons()` calls in `lib/db/queries/courses.ts` to use safe version
4. [ ] **3.4** Update `standalone-units.tsx` for parse error UI (red badge, inactive look, no link)
5. [ ] **3.5** Update `app/(main)/unit/[unitId]/page.tsx` for parse error handling
6. [ ] **3.6** Update `learning-path.tsx` for unparseable units in courses
7. [ ] **2.1** Create `makeUnitPublic`, `makeUnitPrivate`, `makeCoursePublic`, `makeCoursePrivate` server actions
8. [ ] **2.2** Add "Make Public" button with irreversibility warning in `standalone-units.tsx`
9. [ ] **2.3** Add "Make Private" button (admin only) in `standalone-units.tsx`
10. [ ] **2.4** Pass `isAdmin` from page to components
11. [ ] **1.1** Create `userUnitLibrary` table in schema
12. [ ] **1.2** Generate and run DB migration
13. [ ] **1.3** Create `addUnitToLibrary`, `removeUnitFromLibrary` server actions
14. [ ] **1.4** Auto-add to library in `completeLesson()`
15. [ ] **1.5** Update `getStandaloneUnits()` to include library units
16. [ ] **1.6** Create `getBrowsableUnits()` query
17. [ ] **1.7** Create `BrowseUnits` component
18. [ ] **1.8** Add "Remove from Library" in `standalone-units.tsx`
19. [ ] **1.9** Update `/units` page layout with browse section
20. [ ] **1.10** Update `StandaloneUnitInfo` type with `isInLibrary`
