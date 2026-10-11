# Plan: Add loading animation for unit visibility/delete actions

## Goal

Add clear loading feedback for `Make Public`, `Make Private`, and `Delete` actions that appear on the Units screen, so users can see that the action is in progress after click/confirm.

## Implementation approach

### 1) Update target component: `standalone-units.tsx`

- Introduce a small local state in `StandaloneUnitCard` to track which action is currently running:
  - `activeAction: null | "make-public" | "make-private" | "delete" | "remove"`
- Keep existing `useTransition` for async action execution and navigation refresh.
- In each action handler:
  - Keep existing confirmation behavior (`make public`, `delete`).
  - Set `activeAction` before `startTransition`.
  - Execute existing server action call.
  - Keep success/error handling unchanged (`router.refresh()`, `alert`).
  - Reset `activeAction` in `finally`.

### 2) Add per-button loading visuals

- For each target button:
  - Show inline spinner (`animate-spin` ring) only when `isPending` and `activeAction` matches that button.
  - Swap button label during pending:
    - `Make Public` -> `Making Public...`
    - `Make Private` -> `Making Private...`
    - `Delete` -> `Deleting...`
- Preserve existing icon/label when idle.
- Keep `disabled={isPending}` so duplicate clicks are blocked.

### 3) Keep scope tight

- Do not alter server actions in `lib/actions/units.ts`.
- Do not change page data flow in `app/(main)/units/page.tsx`.
- Leave related non-requested actions (`Remove`) functionally unchanged except for shared pending-disable behavior.

### 4) Verify

- Validate that loading state appears only on the clicked action.
- Validate confirm-cancel path keeps buttons idle.
- Validate success and error paths still behave exactly as before.
- Run lint check for modified file(s) and fix any introduced issues.

## Todo list

- [ ] Add `activeAction` state to `StandaloneUnitCard`.
- [ ] Wire `activeAction` lifecycle in `handleMakePublic`.
- [ ] Wire `activeAction` lifecycle in `handleMakePrivate`.
- [ ] Wire `activeAction` lifecycle in `handleDelete`.
- [ ] Update `Make Public` button UI for spinner + loading label.
- [ ] Update `Make Private` button UI for spinner + loading label.
- [ ] Update `Delete` button UI for spinner + loading label.
- [ ] Run lints for edited files and resolve any new issues.
- [ ] Manual behavior check for confirm, success, and error flows.
# Plan: Loading Animation for Make Public / Make Private

## Goal

Show an explicit loading animation/state when users click **Make Public** or **Make Private** on the units page experience (unit cards and course cards).

## Implementation Approach

Use the existing `useTransition` pending state in each card component and augment only the two visibility buttons to:

- render an animated spinner icon while pending
- swap button text to action-progress labels
- keep current disabled behavior and styling hierarchy

This is a UI-only enhancement; no server action changes are required.

## Files To Update

1. `app/(main)/units/standalone-units.tsx`
2. `app/(main)/units/my-courses.tsx`

## Detailed Steps

### 1) Add a tiny reusable spinner fragment in each file

Inside each card component (or file-local helper), define a small inline spinner SVG/class pattern using Tailwind `animate-spin` so the animation is visible and consistent with existing icon sizing.

### 2) Update `Make Public` buttons

In both files:

- Keep current click handlers
- When `isPending`:
  - replace globe icon with spinner
  - replace text with `Making Public...`
- When not pending:
  - keep existing globe icon + `Make Public`

### 3) Update `Make Private` buttons

In both files:

- Keep current click handlers
- When `isPending`:
  - replace lock icon with spinner
  - replace text with `Making Private...`
- When not pending:
  - keep existing lock icon + `Make Private`

### 4) Preserve existing interaction rules

- Keep `disabled={isPending}` as-is
- Do not alter ownership/admin gating conditions
- Do not change action call order or error handling

### 5) Validate quickly

- Type-check/lint only touched files for obvious issues
- Ensure labels/icons are correct in both unit and course cards

## Risks / Notes

- `isPending` is card-wide; all actions in the card will appear disabled during one transition. This is existing behavior and acceptable for this request.
- If desired later, per-action pending states could be added, but that is intentionally out-of-scope.

## Todo List

- Update `standalone-units.tsx` make-public button to show spinner + `Making Public...` when pending
- Update `standalone-units.tsx` make-private button to show spinner + `Making Private...` when pending
- Update `my-courses.tsx` make-public button to show spinner + `Making Public...` when pending
- Update `my-courses.tsx` make-private button to show spinner + `Making Private...` when pending
- Run lints for edited files and fix any introduced issues
