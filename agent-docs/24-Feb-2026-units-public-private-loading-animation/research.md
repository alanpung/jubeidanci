# Research: Loading animation for public/private/delete actions

## Task source

From `task.md`:

- Add a loading animation when clicking `Make Public`, `Make Private`, or `Delete` in `app/(main)/units/page.tsx`.

## Relevant code paths

### Entry page

- `app/(main)/units/page.tsx`
  - Server component.
  - Renders:
    - `StandaloneUnits` (`./standalone-units`)
    - `MyCourses` (`./my-courses`)
  - Does not directly render action buttons.

### Unit action UI (primary target)

- `app/(main)/units/standalone-units.tsx`
  - `StandaloneUnitCard` is a client component card with action buttons.
  - Uses `useTransition()`:
    - `const [isPending, startTransition] = useTransition();`
  - Actions:
    - `handleMakePublic` -> `makeUnitPublic(unit.id)`
    - `handleMakePrivate` -> `makeUnitPrivate(unit.id)` (admin + public only)
    - `handleDelete` -> `deleteUnit(unit.id)`
  - Current pending UX:
    - Buttons are `disabled={isPending}`
    - Buttons apply `disabled:opacity-50`
    - Label/icon do **not** change to loading state.
  - Effect:
    - User sees dimmed buttons but no explicit loading animation.

### Server actions for unit visibility/deletion

- `lib/actions/units.ts`
  - `makeUnitPublic(unitId)`
  - `makeUnitPrivate(unitId)`
  - `deleteUnit(unitId)`
  - All revalidate `"/units"` and return `{ success: true }` or `{ success: false, error }`.
  - No loading-state payload expected (client-only concern).

## Nearby similar UIs and existing loading patterns

### Similar action bars in units area

- `app/(main)/units/my-courses.tsx`
  - Has analogous `Make Public`, `Make Private`, `Delete` buttons for courses.
  - Same pattern: single `isPending`, disable + opacity, no loading animation.
- `app/(main)/units/browse-units.tsx`
  - Uses text switch (`+ Add` -> `Adding...`) for pending state.
- `app/(main)/units/course-manager.tsx`
  - Uses `isPending ? "..." : "+ Add"` for add button only.

### Shared button component with spinner

- `components/ui/button.tsx`
  - Supports `loading` prop.
  - Renders spinner with `animate-spin` and `Loading...`.
  - Not currently used by the action buttons in `standalone-units.tsx`.

### Existing spinner styles in app

- Multiple places use inline spinner classes such as:
  - `h-4 w-4 animate-spin rounded-full border-2 border-... border-t-...`
- Visual language already exists and can be reused directly.

## Behavior and UX constraints identified

1. Current card uses a single `isPending` boolean for any transition in that card.
2. If we only condition on `isPending`, all visible actions on that card can appear as loading simultaneously.
3. Better UX is action-specific loading:
   - Track which action was triggered (`makePublic`, `makePrivate`, `delete`, etc.).
   - Show spinner + loading label only on the clicked button.
4. Buttons already include confirmation dialogs for `make public` and `delete`; loading should start only after confirm.
5. `removeUnitFromLibrary` action exists in same card and shares `isPending`; it should still remain disabled appropriately (even if not in explicit task scope).

## Scope interpretation

The task mentions `page.tsx`, but the actionable controls are rendered in child components. For this request, technical implementation must happen in `app/(main)/units/standalone-units.tsx` (and optionally `my-courses.tsx` if we want parity across all same-labeled actions on the page).

## Recommended implementation direction

For `StandaloneUnitCard`:

1. Add an `activeAction` state with explicit values, e.g.:
   - `null | "make-public" | "make-private" | "delete" | "remove"`
2. In each handler, set `activeAction` immediately before `startTransition`.
3. In `finally`, reset `activeAction` to `null`.
4. For the 3 target buttons, render:
   - Spinner element when `isPending && activeAction === "<action>"`
   - Action-specific loading text:
     - `Making Public...`
     - `Making Private...`
     - `Deleting...`
5. Keep `disabled={isPending}` to prevent duplicate submissions.

Optional parity extension:

- Mirror same pattern in `my-courses.tsx` for course actions that carry identical labels.

## Risks and edge cases

- If `activeAction` is not reset in all paths, UI can get stuck in loading label.
  - Mitigation: use `try/finally` inside transition callbacks.
- If user cancels confirm dialogs, state must remain idle.
  - Mitigation: set `activeAction` only after confirmation passes.
- Styling shifts due to longer loading labels.
  - Mitigation: keep existing `inline-flex items-center gap-1.5` and use concise labels.

## Validation checklist (for implementation phase)

- Click `Make Public` -> spinner + `Making Public...` appears on that button.
- Click `Make Private` -> spinner + `Making Private...` appears on that button.
- Click `Delete` -> spinner + `Deleting...` appears on that button.
- Other buttons are disabled during pending.
- Success still refreshes page; failure still shows alert.
- No TypeScript/lint regressions in edited files.
# Research: Loading Animation for Make Public / Make Private

## User Request

Add a loading animation when clicking **Make Public** or **Make Private** in `app/(main)/units/page.tsx`.

## File/Flow Discovery

`app/(main)/units/page.tsx` is a **server page shell**. It fetches session + data and renders:

- `StandaloneUnits` from `app/(main)/units/standalone-units.tsx`
- `MyCourses` from `app/(main)/units/my-courses.tsx`

The page itself does **not** render action buttons. The public/private actions are implemented in client components:

- Unit visibility actions: `app/(main)/units/standalone-units.tsx`
- Course visibility actions: `app/(main)/units/my-courses.tsx`

## Current Button Behavior

Both components already use `useTransition()`:

- `const [isPending, startTransition] = useTransition();`
- `Make Public` and `Make Private` buttons call server actions inside `startTransition`
- Buttons are disabled with `disabled={isPending}`

However, button labels/icons are static. There is no visual loading state text/icon, so users only see a disabled button.

## Action Handlers (Client)

### Standalone units

In `standalone-units.tsx`:

- `handleMakePublic()` confirms via `window.confirm`, then calls `makeUnitPublic(unit.id)`
- `handleMakePrivate()` calls `makeUnitPrivate(unit.id)`
- Success path uses `router.refresh()`
- Failure path uses `alert(result.error)`

### Courses

In `my-courses.tsx`:

- `handleMakePublic()` confirms via `window.confirm`, then calls `makeCoursePublic(course.id)`
- `handleMakePrivate()` calls `makeCoursePrivate(course.id)`
- Success path uses `router.refresh()`
- Failure path uses `alert(result.error)`

## Server Actions and Timing-Relevant Behavior

In `lib/actions/units.ts`:

- `makeUnitPublic`, `makeUnitPrivate`, `makeCoursePublic`, `makeCoursePrivate` all:
  - validate ownership/admin constraints
  - update DB visibility
  - call `revalidatePath("/units", "page")`
  - return success/error object

Because these are async server actions followed by refresh, transition latency is non-zero and suitable for explicit loading feedback.

## Existing Loading Patterns in Codebase

Two existing patterns appear in the same area of the app:

1. **Text swap only** during pending (e.g., `isPending ? "Adding..." : "+ Add"` in browse units)
2. **Reusable `Button` component with `loading` prop** in forms (e.g., create-course form)

The visibility action buttons currently use raw `<button>` with inline SVG icons. Minimal-risk consistency is to keep raw buttons and add:

- loading spinner icon (or animated icon)
- loading text swap (`Making Public...`, `Making Private...`)
- preserve existing color classes and disabled behavior

## Important UX/State Nuance

`isPending` is shared per card/component, not per action button. While any transition in that card runs, all card action buttons become disabled. This is already current behavior and should remain unchanged for this request.

## Scope Clarification

The request names `units/page.tsx`, but implementation needs to happen in:

- `app/(main)/units/standalone-units.tsx`
- `app/(main)/units/my-courses.tsx`

This directly satisfies the requested user-visible behavior on the units page.
