# Plan: Delete Buttons for Units and Courses

## Current State

After deep research, most of the work is **already done**:


| Component                                      | Status                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `deleteUnit()` server action                   | Already exists (`lib/actions/units.ts:111`)                                                                                 |
| `deleteCourse()` server action                 | Already exists (`lib/actions/units.ts:320`) — correctly detaches units (sets `courseId` to null) before deleting the course |
| Delete course button in UI                     | Already exists in `my-courses.tsx:263-284` with confirmation dialog                                                         |
| Delete unit button in editor                   | Already exists in `unit-editor.tsx` — but only accessible from the edit page                                                |
| **Delete unit button on standalone unit card** | **MISSING**                                                                                                                 |


## What Needs to Be Done

Only **one change** is needed:

### Add a Delete button to `StandaloneUnitCard` in `/app/(main)/units/standalone-units.tsx`

This is the main units listing page where users see their standalone units. Currently, the only way to delete a unit is to navigate into the markdown editor — which is unintuitive.

**Implementation details:**

1. **Import** `deleteUnit` from `@/lib/actions/units` (at the top of the file)
2. **Add a `handleDelete` function** in the `StandaloneUnitCard` component following the existing codebase pattern:
  - `window.confirm()` with a clear warning message ("Are you sure you want to delete this unit? This cannot be undone.")
  - On confirmation, call `deleteUnit(unit.id)` inside `startTransition`
  - On success: `router.refresh()`
  - On failure: `alert(result.error)`
3. **Add the Delete button** in the actions bar (`showActions` section), visible when:
  - The user is the owner AND the unit is private, OR
  - The user is an admin (can delete even public units)
  - Condition: `unit.isOwner && (!isPublic || isAdmin)` — same logic as `!isEditLocked` used for the edit button
4. **Button styling**: Match the existing red delete button pattern used in `my-courses.tsx`:
  - `text-red-500 hover:bg-red-50` color scheme
  - Trash can SVG icon (same one used in course delete)
  - `disabled:opacity-50` when `isPending`

**No backend changes needed.** The `deleteUnit` server action already handles all authorization checks (ownership, admin status, edit-lock for public units).

## Todo List

- Add `deleteUnit` import to `standalone-units.tsx`
- Add `handleDelete` function to `StandaloneUnitCard`
- Add Delete button to the actions bar with proper visibility conditions

