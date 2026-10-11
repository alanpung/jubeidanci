# Plan: Add OpenLingo icon to web app (not only PWA)

## Goal

Ensure OpenLingo branding appears consistently in the regular browser web app (tab/favicon surfaces) in addition to PWA/install contexts.

## Implementation strategy

Follow a minimal-risk, deterministic approach:

1. Use existing `app/icon.svg` as canonical icon source for browser metadata routing.
2. Add concrete PNG icon files under `public/` to satisfy manifest and Apple touch requirements.
3. Update app metadata icon declarations so browser tab/shortcut and Apple icon links all resolve to real assets.
4. Keep manifest icon references aligned to actual files and improve compatibility with `purpose` fields.

This preserves the current architecture and removes missing-path regressions.

## Planned file changes

### 1) Update `app/layout.tsx`

- Expand `metadata.icons` from only `apple` to:
  - `icon` (browser favicon/tab icon)
  - `shortcut`
  - `apple`
- Ensure each path maps to real assets that exist after this task.

### 2) Update `public/manifest.json`

- Keep `icon-192.png` and `icon-512.png`, but ensure these files exist.
- Add `purpose` values (`any maskable`) for broader install/use support.

### 3) Add missing static icon assets under `public/`

- `public/apple-touch-icon.png`
- `public/icon-192.png`
- `public/icon-512.png`
- Optional but recommended: `public/favicon.ico` for legacy browser compatibility

Asset generation source:

- Derive from existing `app/icon.svg` to keep visual consistency.

## Validation plan

1. Run app and verify tab icon in standard browser navigation.
2. Confirm no 404s for:
   - `/apple-touch-icon.png`
   - `/icon-192.png`
   - `/icon-512.png`
   - favicon/icon paths emitted by metadata
3. Confirm manifest still loads and references valid icon URLs.
4. Run lint check for edited code files.

## Risks and mitigations

- Risk: Browser favicon caching can hide changes.
  - Mitigation: hard refresh and/or open in an incognito window.
- Risk: SVG-to-PNG conversion mismatch.
  - Mitigation: generate PNG assets from the same canonical icon and check dimensions.

## TODO list

- [ ] Update `app/layout.tsx` metadata icon entries for web + apple surfaces.
- [ ] Add/refresh `public/icon-192.png` and `public/icon-512.png`.
- [ ] Add/refresh `public/apple-touch-icon.png`.
- [ ] Add `public/favicon.ico` (if straightforward from generated assets).
- [ ] Update `public/manifest.json` icon metadata (`purpose`).
- [ ] Verify generated icon files exist and paths resolve.
- [ ] Run lint checks on touched code files.
- [ ] Provide change summary and verification notes.
