# Research: Course Creation, Unit Management, Visibility Locking, and Browse Route

## 1. Current Architecture Overview

### Framework & Stack
- **Next.js 16** (App Router), React 19, TypeScript, Tailwind CSS 4, Bun runtime
- **DB:** PostgreSQL via `drizzle-orm` 
- **Auth:** `better-auth` (email/password + Google OAuth)
- Admin check: `isAdminEmail()` in `lib/ai/models.ts` — purely email-based from `ADMIN_EMAILS` env var

### Routing Structure (Main Group)
All routes under `app/(main)/` require authentication (layout redirects to `/sign-in`).

```
/units                         -> page.tsx (main Learn page)
/units/[courseId]              -> Course detail page
/units/[courseId]/[unitIndex]  -> (empty, unused)
/units/edit/[unitId]           -> Unit markdown editor
/unit/[unitId]                 -> Standalone unit detail
/unit/[unitId]/lesson/[lessonIndex] -> Standalone lesson
/lesson/[courseId]/[unitId]/[lessonIndex] -> Course lesson
```

### Navigation
- **Sidebar** (`components/layout/sidebar.tsx`): 5 items — Chat, Units, Read, Words, Settings
- **Mobile Nav** (`components/layout/mobile-nav.tsx`): Same 5 items at bottom
- Active state uses prefix matching: `pathname.startsWith(item.href + "/")`
- This means `/units/browse` would automatically highlight "Units" in sidebar — no nav changes needed

---

## 2. Database Schema (Key Tables)

### `course` table (`lib/db/schema.ts:260-273`)
```
id: text PK
title: text NOT NULL
sourceLanguage: text NOT NULL
targetLanguage: text NOT NULL
level: text NOT NULL
visibility: text (nullable — null=private, "public"=public)
published: boolean NOT NULL default true
createdBy: text FK -> user.id (ON DELETE SET NULL)
createdAt: timestamp
updatedAt: timestamp
```

### `unit` table (`lib/db/schema.ts:275-294`)
```
id: text PK (auto UUID)
courseId: text FK -> course.id (ON DELETE SET NULL, nullable)
title: text NOT NULL
description: text NOT NULL
icon: text NOT NULL
color: text NOT NULL
markdown: text NOT NULL
targetLanguage: text NOT NULL
sourceLanguage: text (nullable)
level: text (nullable)
visibility: text (nullable — null=private, "public"=public)
createdBy: text FK -> user.id (ON DELETE SET NULL)
createdAt: timestamp
updatedAt: timestamp
```

### `userUnitLibrary` table (`lib/db/schema.ts:298-315`)
```
id: text PK (auto UUID)
userId: text FK -> user.id
unitId: text FK -> unit.id
addedAt: timestamp
UNIQUE(userId, unitId)
```

### `userCourseEnrollment` table (`lib/db/schema.ts:90-104`)
```
id: text PK (auto UUID)
userId: text FK -> user.id
courseId: text NOT NULL
currentUnitId: text (nullable)
currentLessonIndex: integer default 0
UNIQUE(userId, courseId)
```

### `userPreferences` table (`lib/db/schema.ts:80-88`)
```
userId: text PK FK -> user.id
nativeLanguage: text (nullable)
targetLanguage: text (nullable)
preferredModel: text (nullable)
updatedAt: timestamp
```

### Relations
- `course` hasMany `unit` (via `unit.courseId`)
- `unit` belongsTo `course`

---

## 3. Current /units Page Structure

### Server Page (`app/(main)/units/page.tsx`)
Fetches in parallel:
1. `listCoursesWithLessonCounts(filters, userId)` — courses visible to user
2. `getAvailableFilters(userId)` — filter options
3. `getUserEnrolledCourses(userId)` — enrolled courses with progress
4. `getStandaloneUnits(userId)` — owned + library units (no courseId)
5. `getBrowsableUnits(userId)` — public standalone units to discover

Pre-filters courses by `sourceLanguage = nativeLanguage`.

Renders (in order):
1. `+ New Unit` button (links to `/chat?prompt=...`)
2. `<ContinueLearning>` — enrolled courses with progress bars
3. `<StandaloneUnits>` — "My Units" section (owned + library)
4. `<BrowseUnits>` — "Browse Public Units" section
5. `<CourseBrowser>` — "Browse Courses" with filter dropdowns

### Client Components

**`standalone-units.tsx`** — "My Units" section:
- Card for each unit with icon, title, description, language, level, lesson count, progress bar
- Visibility badge ("Public" / "Private")
- Owner actions: "Edit Markdown" link, "Make Public" button (if private)
- Admin actions: "Make Private" button (if public)
- Library unit actions: "Remove" button
- `handleMakePublic()` uses `window.confirm()` with warning message

**`browse-units.tsx`** — "Browse Public Units":
- Filter dropdowns for targetLanguage and level (derived from unit data)
- Each card links to `/unit/{id}` with "+ Add" button for library

**`course-browser.tsx`** — "Browse Courses":
- Filter dropdowns for sourceLanguage, targetLanguage, level
- Renders `<CourseCard>` grid

**`course-card.tsx`** — Simple card linking to `/units/{courseId}`:
- Shows title, source -> target language, level badge, unit/lesson counts

---

## 4. Visibility System

### Current Implementation

**Making things public:**
- `makeUnitPublic(unitId)` in `lib/actions/units.ts:119-149`
  - Requires ownership (`createdBy === userId`)
  - Sets `visibility: "public"`
  - UI confirmation: "This decision is irreversible"
- `makeCoursePublic(courseId)` in `lib/actions/units.ts:182-212`
  - Same pattern — owner only

**Making things private:**
- `makeUnitPrivate(unitId)` in `lib/actions/units.ts:151-180`
  - **Admin-only** (checked via `isAdminEmail`)
- `makeCoursePrivate(courseId)` in `lib/actions/units.ts:214-243`
  - **Admin-only**

### Visibility Filtering in Queries
- Courses shown if: `visibility = "public"` OR `createdBy = userId`
- Units within courses: same pattern
- Browsable units: `visibility = "public"` AND NOT owned by user AND NOT in user library
- Standalone units: `createdBy = userId` OR `id IN userUnitLibrary`

---

## 5. Unit Editor

### Edit Page (`app/(main)/units/edit/[unitId]/page.tsx`)
- Fetches unit via `getUnitForEdit(unitId, userId)` — checks ownership
- If not found or not owned, redirects to `/units`

### Editor Component (`app/(main)/units/edit/[unitId]/unit-editor.tsx`)
- Textarea for markdown editing
- Save button calls `updateUnitMarkdown(unitId, markdown)`
- Delete button calls `deleteUnit(unitId)` with confirmation
- **Currently:** No check for visibility status — owner can always edit

### `updateUnitMarkdown()` Server Action (`lib/actions/units.ts:11-88`)
- Verifies ownership (`createdBy === userId`)
- Strips code fences, parses markdown, validates at least 1 lesson
- Updates title, description, icon, color, markdown, language, level
- **Currently:** No check for visibility — owner can edit even if public

### `getUnitForEdit()` Query (`lib/db/queries/courses.ts:463-484`)
- Simple ownership check: `createdBy !== userId` → null
- **No admin bypass** for editing

---

## 6. Course Creation — Currently Missing

### What exists:
- Courses can be seeded from filesystem (`lib/db/seed-content.ts`)
- Course IDs are currently manually set (from filename in seed)
- No UI or server action for creating courses from the app
- No way to add/remove units from a course through the UI

### Course data model:
- `course.id` is a plain text PK (not auto-generated UUID)
- `course.createdBy` exists but seeded courses have `null` for it
- Units reference courses via `unit.courseId` FK (nullable, SET NULL on delete)

---

## 7. Existing Content Parsers

### Course Parser (`lib/content/course-parser.ts`)
```
Frontmatter: courseTitle, description, sourceLanguage, targetLanguage, level, id
```
Used only in seeding flow.

### Unit Parser (`lib/content/unit-parser.ts`)
Parses markdown with frontmatter:
```
title, description, icon, color, targetLanguage, sourceLanguage, level, courseId
```
Plus lesson blocks separated by `---` delimiters.

---

## 8. Key Findings & Implications for the Task

### A. Course Creation (NEW)
- Need: Server action to create a course (title, sourceLanguage, targetLanguage, level)
- Need: Generate a course ID (could use slug from title, or UUID)
- Need: Set `createdBy` to current user
- Need: UI form in the `/units` page (or a modal)

### B. Add/Remove Units to Course (NEW)
- Current: `unit.courseId` is a nullable FK — can be set/unset
- Need: Server action to set `unit.courseId` for a given unit (must verify ownership of both unit and course)
- Need: Server action to remove unit from course (`unit.courseId = null`)
- Need: UI in the course detail page or units page to manage this

### C. Course Visibility (EXISTS — needs enhancement)
- `makeCoursePublic()` and `makeCoursePrivate()` already exist
- Need: Add same UI controls as units (badge + make public/private buttons)
- Need: Update warning message to include the new "cannot edit once public" rule

### D. "Cannot Edit Once Public" Rule (NEW)
- Affects: `updateUnitMarkdown()` — must check if unit is public and user is not admin
- Affects: `deleteUnit()` — same check
- Affects: `getUnitForEdit()` — should block non-admin access to public units
- Affects: Course editing (if we add it) — same pattern
- Affects: Adding/removing units from a public course
- Affects: UI — must update confirmation warning to mention this
- Must allow admins to bypass this restriction

### E. Move Browsing to `/units/browse` (NEW)
- Currently: All browsing UI (CourseBrowser, BrowseUnits) is on `/units`
- Need: New route `app/(main)/units/browse/page.tsx`
- Need: Move `<CourseBrowser>` and `<BrowseUnits>` components there
- Need: `/units` page to link to `/units/browse`
- Need: Pre-select `nativeLanguage` in browse dropdown (if set)
- Need: If `nativeLanguage` is null, show "All languages" selected

### F. Navigation
- Sidebar and mobile-nav already use prefix matching for `/units`
- `/units/browse` will automatically be highlighted under "Units" — no changes needed

### G. Types That Need Changes
- `CourseListItem` (`lib/content/types.ts:150-158`) — may need `visibility`, `createdBy`
- May need new type for course management view
- `StandaloneUnitInfo` already has `visibility`, `isOwner`

---

## 9. Files That Will Be Modified

### Server Actions
- `lib/actions/units.ts` — Add edit-lock checks, course creation, unit-course management actions
- `lib/actions/library.ts` — Possibly no changes

### Database Queries
- `lib/db/queries/courses.ts` — Add query for user's own courses, modify `getUnitForEdit` for admin bypass

### Pages/Components
- `app/(main)/units/page.tsx` — Simplify (move browse sections out), add course management
- `app/(main)/units/standalone-units.tsx` — Update visibility warning, add edit lock UI
- `app/(main)/units/browse-units.tsx` — Move to browse route
- `app/(main)/units/course-browser.tsx` — Move to browse route
- `app/(main)/units/course-card.tsx` — Add visibility badge + management actions
- NEW: `app/(main)/units/browse/page.tsx` — New browse page

### Types
- `lib/content/types.ts` — May need new/extended types

### Unit Editor
- `app/(main)/units/edit/[unitId]/page.tsx` — Add admin bypass, block public unit editing
- `lib/actions/units.ts` `updateUnitMarkdown()` — Add public check
