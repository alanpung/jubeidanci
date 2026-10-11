# Research: Webapp icon support (non-PWA)

## User request

Add the OpenLingo icon in the normal web app experience as well, since it currently appears to work only for PWA usage.

## Scope investigated

- `app/layout.tsx` metadata configuration
- `public/manifest.json` PWA manifest icon config
- icon assets available in `app/` and `public/`
- icon/favicons references across the codebase

## Findings

### 1) App metadata is incomplete for browser icon coverage

In `app/layout.tsx`, `metadata` includes:

- `manifest: "/manifest.json"`
- `icons.apple: "/apple-touch-icon.png"`

There is no explicit `icons.icon` or `icons.shortcut` entry in metadata.

Why this matters:

- Browser tab icons (favicon and related rel links) are driven by icon metadata and/or App Router file conventions.
- Right now the metadata explicitly defines only Apple icon, and it references a file that does not exist in `public/`.

### 2) Referenced icon assets are missing from `public/`

`public/manifest.json` references:

- `/icon-192.png`
- `/icon-512.png`

`app/layout.tsx` references:

- `/apple-touch-icon.png`

Current repository assets:

- `app/icon.svg` exists
- no `public/icon-192.png`
- no `public/icon-512.png`
- no `public/apple-touch-icon.png`
- no `public/favicon.ico`

Implication:

- At least three icon paths currently configured are unresolved at runtime unless generated elsewhere outside source control.
- This can explain inconsistent behavior between installed/PWA contexts and regular browser tab contexts.

### 3) There is an App Router icon source, but it is not fully aligned with declared metadata paths

`app/icon.svg` exists and should be usable by Next.js metadata routing conventions.

However:

- the manifest currently points to fixed PNG files in `public/` that are not present
- metadata points to `apple-touch-icon.png` in `public/` that is not present

So the current setup mixes two strategies:

1. App Router icon file convention (`app/icon.svg`)
2. Hardcoded static icon files under `public/`

These strategies are not currently aligned to the same actual files.

## Root cause hypothesis

The project has partial icon setup:

- one icon source exists (`app/icon.svg`)
- metadata/manifest still reference additional static assets that were never added or were removed

Result:

- PWA may appear acceptable in some environments (fallbacks/cached assets/platform behavior)
- standard browser favicon behavior is unreliable or missing the intended brand icon

## Constraints and compatibility considerations

- For best cross-browser support, keep at least one PNG favicon or ICO path in addition to SVG where possible.
- Apple touch icons should be PNG and explicitly available.
- Manifest icon entries should resolve to real files and typically include `purpose` where relevant (`any`, `maskable`) for better install visuals.
- Next.js App Router metadata is easiest to maintain when icon declarations and physical assets use one consistent strategy.

## Candidate implementation directions (not implementation yet)

### Option A: Full static asset approach (`public/`)

- Add real icon assets to `public/` (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`)
- Keep `manifest.json` and `metadata.icons` paths as static `/...` file URLs

Pros:

- Explicit and browser-friendly
- easy to reason about URL paths

Cons:

- more generated assets to maintain manually

### Option B: App Router metadata-file approach (`app/`)

- Use `app/icon.*` and `app/apple-icon.*` files
- simplify `layout.tsx` metadata to avoid dead static paths
- ensure manifest icon entries point to actual resolvable icon endpoints or use generated static files where required

Pros:

- closer to Next.js conventions
- fewer path mismatches

Cons:

- manifest still often benefits from concrete PNG assets for install surfaces

## Recommended direction for this codebase

Use a hybrid but consistent setup:

1. Keep `app/icon.svg` as the canonical visual source for browser favicon rendering.
2. Add required concrete PNG assets in `public/` for manifest and Apple touch icon:
   - `public/apple-touch-icon.png`
   - `public/icon-192.png`
   - `public/icon-512.png`
3. Update `app/layout.tsx` `metadata.icons` to include browser icon entries (`icon` and `shortcut`) in addition to Apple.
4. Keep `public/manifest.json` icon entries but ensure they match actual files and optionally add `purpose`.

This closes the missing-file gaps while preserving current structure.

## Files likely affected in implementation phase

- `app/layout.tsx`
- `public/manifest.json`
- `public/apple-touch-icon.png` (new)
- `public/icon-192.png` (new)
- `public/icon-512.png` (new)
- possibly `public/favicon.ico` (new, optional but recommended)

## What to validate after implementation

- Browser tab favicon shows OpenLingo icon in Chrome/Safari/Firefox.
- iOS “Add to Home Screen” uses expected icon.
- Android install prompt uses expected 192/512 icons.
- No 404s for icon URLs in DevTools network panel.
- Lighthouse PWA audits pass icon checks.
