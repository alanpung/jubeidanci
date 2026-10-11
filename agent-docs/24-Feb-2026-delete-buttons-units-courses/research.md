# Research: Delete Buttons for Units and Courses

## 1. Overall Project Structure

**Framework:** Next.js 16.1.6 (App Router) with React 19.2.3, TypeScript, Tailwind CSS v4.
**Runtime:** Bun (used for scripts, migration, seeding).
**Database:** PostgreSQL via Drizzle ORM (drizzle-orm 0.45.1).
**Auth:** better-auth library.
**Styling:** Tailwind CSS with custom design tokens (Duolingo-like theme: `lingo-green`, `lingo-blue`, `lingo-red`, etc.).

**Key directories:**
- `/app` - Next.js App Router pages
  - `/(auth)/` - Auth pages (sign-in, etc.)
  - `/(main)/` - Protected main app (layout requires session)
    - `/units/` - Course & unit management hub (list, browse, edit, course detail)
    - `/unit/[unitId]/` - Standalone unit view with learning path
    - `/lesson/` - Lesson execution
    - `/chat/` - AI chat
    - `/read/` - Article reading
    - `/words/` - Word explorer / SRS
    - `/settings/` - User preferences
  - `/api/` - API routes (ai-prompt, articles, auth, chat, stt, tts, word)
- `/components/` - Shared UI components
  - `/ui/` - Base components: `button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx`, `progress-bar.tsx`
  - `/learning-path/` - `unit-card.tsx`, `lesson-node.tsx`, `path-connector.tsx`
  - `/gamification/` - `lesson-complete-modal.tsx`
- `/lib/` - Core logic
  - `/actions/` - Server actions (`units.ts`, `library.ts`, `lesson.ts`, `progress.ts`, etc.)
  - `/db/` - Database client, schema, queries
  - `/content/` - Content parsing (types, unit-parser, loader)
  - `/ai/` - AI model config

**Routing:** File-system based via Next.js App Router. Route groups `(auth)` and `(main)` separate public vs authenticated pages.

---

## 2. Database Schema (Courses and Units)

**File:** `/lib/db/schema.ts`

### Course table (lines 260-273)
```typescript
export const course = pgTable("course", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sourceLanguage: text("source_language").notNull(),
  targetLanguage: text("target_language").notNull(),
  level: text("level").notNull(),
  visibility: text("visibility"),                    // null = private, "public" = public
  published: boolean("published").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

### Unit table (lines 275-294)
```typescript
export const unit = pgTable("unit", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").references(() => course.id, {
    onDelete: "set null",                             // If course is deleted, unit.courseId becomes null
  }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  markdown: text("markdown").notNull(),
  targetLanguage: text("target_language").notNull(),
  sourceLanguage: text("source_language"),
  level: text("level"),
  visibility: text("visibility"),                     // null = private, "public" = public
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

---

## 3. Relationships & Foreign Keys

### Drizzle Relations (lines 380-386)
```typescript
export const courseRelations = relations(course, ({ many }) => ({
  units: many(unit),
}));

export const unitRelations = relations(unit, ({ one }) => ({
  course: one(course, { fields: [unit.courseId], references: [course.id] }),
}));
```

### Tables referencing `unit.id`:
1. **`lesson_completion`** - `unitId` references `unit.id` with `onDelete: "cascade"` -- **auto-deleted**
2. **`user_unit_library`** - `unitId` references `unit.id` with `onDelete: "cascade"` -- **auto-deleted**
3. **`user_course_enrollment`** - `currentUnitId` is a plain text field (no FK constraint) -- no cascade needed

### Tables referencing `course.id`:
1. **`unit`** - `courseId` references `course.id` with `onDelete: "set null"` -- units become standalone
2. **`user_course_enrollment`** - `courseId` is a plain text field (no FK constraint)

**Key Insight:** Deleting a unit cascades to `lesson_completion` and `user_unit_library`. Deleting a course sets `unit.courseId` to null (at DB level), but the server action also explicitly does this before deleting.

---

## 4. Existing Server Actions for CRUD

**File:** `/lib/actions/units.ts` -- This is the SINGLE file containing ALL course & unit server actions.

### Unit Actions:
- **`updateUnitMarkdown(unitId, markdown)`** (line 23) - Update unit content. Checks ownership + admin + edit-lock.
- **`deleteUnit(unitId)`** (line 111) - **Already exists!** Checks ownership + admin + edit-lock for public units. Calls `db.delete(unit).where(eq(unit.id, unitId))`. Revalidates `/units`.
- **`makeUnitPublic(unitId)`** (line 149) - Set visibility to "public".
- **`makeUnitPrivate(unitId)`** (line 181) - Admin-only: set visibility back to null.

### Course Actions:
- **`createCourse(data)`** (line 277) - Create with slug-based ID.
- **`deleteCourse(courseId)`** (line 320) - **Already exists!** Detaches all units first (sets courseId to null), then deletes course. Checks ownership + admin + edit-lock.
- **`makeCoursePublic(courseId)`** (line 212) - Set visibility to "public".
- **`makeCoursePrivate(courseId)`** (line 244) - Admin-only.
- **`addUnitToCourse(unitId, courseId)`** (line 362) - Assign unit to course.
- **`removeUnitFromCourse(unitId)`** (line 419) - Detach unit from course.
- **`fetchCourseManagementData(courseId)`** (line 476) - Fetch course + available standalone units.

### Authorization Pattern:
All actions follow this pattern:
1. `const session = await requireSession()` -- throws if not logged in
2. `const admin = isAdminEmail(session.user.email)` -- checks admin status
3. Fetch entity and verify `createdBy === userId || admin`
4. Edit-lock: public content can only be modified by admins
5. Return `{ success: true }` or `{ success: false, error: string }`

---

## 5. Existing UI Components

### Main Learn Page: `/app/(main)/units/page.tsx`
- Server component. Fetches standalone units + owned courses.
- Renders `<StandaloneUnits>` and `<MyCourses>`.

### Standalone Units List: `/app/(main)/units/standalone-units.tsx`
- Client component with `StandaloneUnitCard`.
- Action buttons in a footer bar: Edit Markdown, Make Public, Make Private (admin), Remove from Library.
- **No delete button currently** -- delete only available from the edit page.
- Uses `window.confirm()` for "Make Public" action.

### My Courses List: `/app/(main)/units/my-courses.tsx`
- Client component with `OwnedCourseCard`.
- Action buttons: Manage, Make Public, Make Private (admin), **Delete** (already exists!).
- **Delete course button IS already implemented** (lines 263-284) with `window.confirm()` dialog.
- Delete is hidden when `isLocked` (public && !admin).

### Course Manager Panel: `/app/(main)/units/course-manager.tsx`
- Expandable panel inside course card.
- Shows units in course with "Remove" button.
- Shows available standalone units with "+ Add" button.

### Unit Editor: `/app/(main)/units/edit/[unitId]/unit-editor.tsx`
- Markdown editor with Save/Cancel/Delete buttons.
- **Delete unit button IS already implemented** (lines 111-119) using `Button variant="danger"`.
- Uses `window.confirm("Are you sure you want to delete this unit? This cannot be undone.")`.

### Create Course Form: `/app/(main)/units/create-course-form.tsx`
- Modal-like form with title, source/target language, level selects.
- Uses `Button` and `Input` UI components.

### Course Detail Page: `/app/(main)/units/[courseId]/page.tsx`
- Shows learning path with all units in course.
- No management actions on this page.

### Standalone Unit Page: `/app/(main)/unit/[unitId]/page.tsx`
- Shows learning path for a single unit.
- No delete actions on this page.

---

## 6. Existing Delete Functionality Patterns

### Pattern 1: Course Delete (my-courses.tsx, lines 115-131)
```typescript
function handleDelete() {
  const confirmed = window.confirm(
    "Are you sure you want to delete this course?\n\n" +
      "The units in this course will NOT be deleted — they will become standalone units. " +
      "This action cannot be undone."
  );
  if (!confirmed) return;

  startTransition(async () => {
    const result = await deleteCourse(course.id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
  });
}
```

### Pattern 2: Unit Delete (unit-editor.tsx, lines 38-51)
```typescript
function handleDelete() {
  if (!window.confirm("Are you sure you want to delete this unit? This cannot be undone.")) {
    return;
  }
  setError(null);
  startDeleting(async () => {
    const result = await deleteUnit(unitId);
    if (result.success) {
      router.push("/units");
    } else {
      setError(result.error);
    }
  });
}
```

### Pattern 3: Article Delete (read/[id]/page.tsx, lines 177-186)
```typescript
const handleDelete = async () => {
  if (!confirm("Delete this article?")) return;
  setDeleting(true);
  try {
    await fetch(`/api/articles/${id}`, { method: "DELETE" });
    router.push("/read");
  } catch {
    setDeleting(false);
  }
};
```

### Pattern 4: Word Delete (word-explorer.tsx, lines 454-460)
```typescript
function handleRemoveAll() {
  if (!confirm(`Delete all ${srsStats.total} saved words? This cannot be undone.`)) return;
  startTransition(async () => {
    await removeAllWordsFromSrs(language);
    router.refresh();
  });
}
```

**Conclusion:** All delete confirmations use native `window.confirm()`. There are NO custom dialog/modal components for confirmations. The only "modal" in the codebase is `LessonCompleteModal` which is a full-page celebration screen, not a dialog.

---

## 7. UI Library / Component Library

**No external component library (no shadcn, no Radix, no HeadlessUI).** All UI components are custom-built:

- `/components/ui/button.tsx` - Button with variants: `primary`, `secondary`, `danger`, `ghost`, `outline`. Sizes: `sm`, `md`, `lg`. Has `loading` state.
- `/components/ui/input.tsx` - Input with label and error display.
- `/components/ui/card.tsx` - Simple card wrapper.
- `/components/ui/badge.tsx` - Badge pill.
- `/components/ui/progress-bar.tsx` - Progress bar with optional label.

**Design System:** Duolingo-inspired with CSS custom properties:
- Colors: `lingo-green`, `lingo-blue`, `lingo-purple`, `lingo-red`, `lingo-orange`, `lingo-yellow`
- Dark variants: `lingo-green-dark`, `lingo-blue-dark`, `lingo-red-dark`
- Neutrals: `lingo-gray`, `lingo-gray-dark`, `lingo-bg`, `lingo-card`, `lingo-border`
- Text: `lingo-text`, `lingo-text-light`

**Button styling pattern for action buttons in cards:**
```tsx
<button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
  <svg ...>...</svg>
  Delete
</button>
```

---

## 8. Confirmation Dialog Patterns

**All confirmations use `window.confirm()`** -- the browser's native dialog. There is no custom confirmation dialog component anywhere in the codebase.

Usage patterns:
1. Simple: `if (!window.confirm("message")) return;`
2. Multi-line: `const confirmed = window.confirm("line1\n\nline2");`
3. Then call server action inside `startTransition(async () => { ... })`
4. On success: `router.refresh()` or `router.push("/units")`
5. On failure: `alert(result.error)` or `setError(result.error)`

---

## Summary: What Already Exists vs What's Missing

### Already Exists:
- `deleteUnit()` server action in `/lib/actions/units.ts` (line 111)
- `deleteCourse()` server action in `/lib/actions/units.ts` (line 320)
- Delete unit button in **unit editor** page (`/app/(main)/units/edit/[unitId]/unit-editor.tsx`)
- Delete course button in **My Courses** card (`/app/(main)/units/my-courses.tsx`)

### Missing (likely what the user wants to add):
- **Delete button on standalone unit cards** in the main `/units` page (`standalone-units.tsx`) -- currently only has Edit, Make Public, Make Private, Remove from Library
- The delete button for units is ONLY accessible from the markdown editor page, requiring the user to navigate to edit just to delete

### Key Files for Implementation:
| File | Purpose |
|------|---------|
| `/lib/actions/units.ts` | Server actions (deleteUnit, deleteCourse already exist) |
| `/app/(main)/units/standalone-units.tsx` | Standalone unit cards -- **needs delete button** |
| `/app/(main)/units/my-courses.tsx` | Course cards -- already has delete button |
| `/app/(main)/units/edit/[unitId]/unit-editor.tsx` | Unit editor -- already has delete button |
| `/lib/db/schema.ts` | DB schema (for understanding cascade behavior) |
| `/components/ui/button.tsx` | Button component with `danger` variant |
