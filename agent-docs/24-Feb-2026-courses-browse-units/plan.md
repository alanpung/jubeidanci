# Plan: Course Creation, Unit Management, Visibility Locking, and Browse Route

## Overview

Three main workstreams:
1. **Course CRUD + unit management** — Create courses, add/remove units
2. **Edit-lock on public content** — Once public, only admins can edit
3. **Move browsing to `/units/browse`** — New route with native_language preselection

---

## Workstream 1: Course Creation & Unit Management

### 1A. Server Actions (`lib/actions/units.ts`)

**New action: `createCourse(data)`**
- Params: `{ title, sourceLanguage, targetLanguage, level }`
- Auth: `requireSession()`, set `createdBy = userId`
- Generate ID: slugify title + short random suffix (e.g. `"german-basics-a1b2"`)
- Insert into `course` table with `visibility: null` (private), `published: true`
- Revalidate `/units`
- Return `{ success: true, courseId }` or error

**New action: `updateCourse(courseId, data)`**
- Params: `courseId` + `{ title, sourceLanguage, targetLanguage, level }`
- Auth: verify ownership (`createdBy === userId`) OR admin
- **Edit-lock**: if `visibility === "public"` and NOT admin, reject with error
- Update fields + `updatedAt`
- Revalidate `/units`

**New action: `deleteCourse(courseId)`**
- Auth: verify ownership OR admin
- **Edit-lock**: if `visibility === "public"` and NOT admin, reject
- Set all units in this course to `courseId = null` (detach, don't delete units)
- Delete the course row
- Revalidate `/units`

**New action: `addUnitToCourse(unitId, courseId)`**
- Auth: verify ownership of BOTH the unit and the course (OR admin)
- **Edit-lock**: if course is public and NOT admin, reject
- Set `unit.courseId = courseId`
- Revalidate paths

**New action: `removeUnitFromCourse(unitId)`**
- Auth: verify ownership of the unit AND the course it belongs to (OR admin)
- **Edit-lock**: if course is public and NOT admin, reject
- Set `unit.courseId = null`
- Revalidate paths

### 1B. Database Queries (`lib/db/queries/courses.ts`)

**New query: `getUserOwnedCourses(userId)`**
- Select courses where `createdBy = userId`
- Include unit count, visibility
- Used on the `/units` page for "My Courses" section

**New query: `getUserOwnedStandaloneUnits(userId)`**
- Select units where `createdBy = userId` AND `courseId IS NULL`
- Used when picking units to add to a course

**New query: `getCourseForManagement(courseId, userId)`**
- Get full course with its units (for the management UI)
- Includes visibility, createdBy info
- Admin bypass for visibility filtering

### 1C. Types (`lib/content/types.ts`)

**New type: `OwnedCourseInfo`**
```ts
interface OwnedCourseInfo {
  id: string;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
  level: string;
  visibility: string | null;
  unitCount: number;
  createdAt: Date;
}
```

### 1D. UI — `/units` Page Changes

**"My Courses" section** — new component `my-courses.tsx`:
- Shows courses owned by the user (from `getUserOwnedCourses`)
- Each course card shows: title, language pair, level, visibility badge, unit count
- Actions per card:
  - "Manage" link → opens management view (inline or modal)
  - "Make Public" button (if private) — with warning dialog
  - "Make Private" button (admin only, if public)
- "Make Public" warning text: *"Are you sure you want to make this course public? Once public, this course cannot be edited anymore. Only admins can make changes. All users will have access to this course."*

**"+ New Course" button** — next to existing "+ New Unit":
- Opens an inline form or modal with fields: Title, Source Language (dropdown), Target Language (dropdown), Level (dropdown)
- On submit: calls `createCourse()`, then refreshes

**Course management view** — new component `course-manager.tsx`:
- Shows the course's current units (ordered list)
- "Remove" button per unit (calls `removeUnitFromCourse`)
- "Add Unit" section: dropdown/list of user's standalone units (no courseId), with "Add" button per unit
- If course is public and user is NOT admin: all management actions disabled, show info message "This course is public and can no longer be edited."

---

## Workstream 2: Edit-Lock on Public Content

### 2A. Server-Side Enforcement

**`updateUnitMarkdown()` in `lib/actions/units.ts`:**
- After ownership check, add: if `visibility === "public"` AND NOT admin → return error "This unit is public and can no longer be edited. Only admins can make changes."

**`deleteUnit()` in `lib/actions/units.ts`:**
- Same check: if `visibility === "public"` AND NOT admin → reject

**`getUnitForEdit()` in `lib/db/queries/courses.ts`:**
- Add admin bypass: if user is admin, allow access regardless of ownership
- If unit is public AND user is not admin AND user is owner → still return null (block editing)
- This means the edit page will redirect to `/units` for public units (non-admin)

**All new course management actions** (from Workstream 1):
- Check course visibility before allowing changes

### 2B. UI Changes

**`standalone-units.tsx`:**
- If unit is public and user is owner (but NOT admin):
  - Hide "Edit Markdown" link
  - Show info text or locked icon: "Public — read-only"
- If unit is public and user IS admin:
  - Keep "Edit Markdown" link visible
- Update `handleMakePublic()` confirmation text:
  - Old: *"This decision is irreversible. All users will have access..."*
  - New: *"Are you sure you want to make this unit public?\n\nOnce public, this unit cannot be edited anymore. Only admins can make changes to public content. All users will have access to this unit and your name will be shown as the author."*

**Unit editor page (`app/(main)/units/edit/[unitId]/page.tsx`):**
- Pass `isAdmin` to editor or handle in server component
- If unit is public and user is not admin, redirect away (already handled by `getUnitForEdit` changes)
- If user IS admin editing a public unit, show a notice: "Admin edit mode — this unit is public"

---

## Workstream 3: Move Browsing to `/units/browse`

### 3A. New Route: `app/(main)/units/browse/page.tsx`

**Server component:**
- Fetch session, userId, nativeLanguage
- Fetch: `listCoursesWithLessonCounts`, `getAvailableFilters`, `getBrowsableUnits`
- Pass `nativeLanguage` to client components for pre-selection
- Render: `<BrowsePage nativeLanguage={...} courses={...} filters={...} browsableUnits={...} />`

**Client component: `browse-page.tsx`** (or keep inline)
- Contains both `<CourseBrowser>` and `<BrowseUnits>`
- `<CourseBrowser>` gets `initialSourceLanguage={nativeLanguage}` — pre-selects in dropdown
- `<BrowseUnits>` unchanged (filters by targetLanguage/level)
- If `nativeLanguage` is null, dropdown starts at "All languages" (empty string — current default behavior)

### 3B. Modify `course-browser.tsx`

- Add optional `initialSourceLanguage` prop
- Initialize `sourceLanguage` state with `initialSourceLanguage ?? ""`
- Rest stays the same

### 3C. Modify `/units/page.tsx`

**Remove from this page:**
- `<CourseBrowser>` section
- `<BrowseUnits>` section
- The "no courses for your language" fallback text
- Related data fetching (`listCoursesWithLessonCounts`, `getAvailableFilters`, `getBrowsableUnits`)

**Keep on this page:**
- `<ContinueLearning>` — enrolled courses with progress
- `<StandaloneUnits>` — "My Units"
- New: `<MyCourses>` — user's own courses (from Workstream 1)

**Add:**
- "Browse" link/button that navigates to `/units/browse`
- Keep `+ New Unit` and add `+ New Course` button

### 3D. Navigation

No changes needed — sidebar already highlights "Units" for any `/units/*` path via prefix matching.

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `app/(main)/units/browse/page.tsx` | Browse route server page |
| `app/(main)/units/my-courses.tsx` | "My Courses" section component |
| `app/(main)/units/course-manager.tsx` | Course management (add/remove units, visibility) |
| `app/(main)/units/create-course-form.tsx` | Inline form for creating a new course |

### Modified Files
| File | Changes |
|------|---------|
| `lib/actions/units.ts` | Add `createCourse`, `updateCourse`, `deleteCourse`, `addUnitToCourse`, `removeUnitFromCourse`; add edit-lock checks to `updateUnitMarkdown`, `deleteUnit` |
| `lib/db/queries/courses.ts` | Add `getUserOwnedCourses`, `getUserOwnedStandaloneUnits`, `getCourseForManagement`; update `getUnitForEdit` with admin bypass + public check |
| `lib/content/types.ts` | Add `OwnedCourseInfo` type |
| `app/(main)/units/page.tsx` | Remove browse sections, add My Courses + Browse link + New Course button |
| `app/(main)/units/standalone-units.tsx` | Update confirmation warning, hide edit for public non-admin, pass `isAdmin` for admin editing |
| `app/(main)/units/course-browser.tsx` | Add `initialSourceLanguage` prop for pre-selection |
| `app/(main)/units/browse-units.tsx` | No changes (just moved to browse page) |
| `app/(main)/units/edit/[unitId]/page.tsx` | Add admin check, block public unit editing for non-admins |

### Potentially Modified
| File | Changes |
|------|---------|
| `app/(main)/units/course-card.tsx` | Add visibility badge if showing owned courses |

---

## Implementation Todo List

1. **Add `OwnedCourseInfo` type** to `lib/content/types.ts`
2. **Add new DB queries** to `lib/db/queries/courses.ts`:
   - `getUserOwnedCourses(userId)`
   - `getUserOwnedStandaloneUnits(userId)`
   - `getCourseForManagement(courseId, userId)`
   - Update `getUnitForEdit()` — admin bypass + public unit block
3. **Add new server actions** to `lib/actions/units.ts`:
   - `createCourse()`
   - `updateCourse()`
   - `deleteCourse()`
   - `addUnitToCourse()`
   - `removeUnitFromCourse()`
   - Add edit-lock to `updateUnitMarkdown()`
   - Add edit-lock to `deleteUnit()`
4. **Create `app/(main)/units/browse/page.tsx`** — new browse route
5. **Modify `app/(main)/units/course-browser.tsx`** — add `initialSourceLanguage` prop
6. **Create `app/(main)/units/create-course-form.tsx`** — course creation form
7. **Create `app/(main)/units/my-courses.tsx`** — "My Courses" section with visibility controls
8. **Create `app/(main)/units/course-manager.tsx`** — add/remove units from course
9. **Update `app/(main)/units/page.tsx`** — remove browse sections, add My Courses + New Course + Browse link
10. **Update `app/(main)/units/standalone-units.tsx`** — edit-lock UI, updated warning text
11. **Update `app/(main)/units/edit/[unitId]/page.tsx`** — admin check, block public unit editing
12. **Test the full flow** — create course, add units, make public, verify edit-lock, browse route
