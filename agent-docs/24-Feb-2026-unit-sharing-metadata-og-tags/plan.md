# Plan: Unit Sharing Metadata / OG Tags

## Overview

Add dynamic `generateMetadata` to the public unit page so that sharing a link produces a rich preview with the unit's title, description, language info, and lesson count.

## Implementation Steps

### Step 1: Add `metadataBase` to root layout

Update `app/layout.tsx` to include `metadataBase` pointing to the production URL (`https://www.openlingo.dev`). This is required for Next.js to resolve relative OG image URLs and generate proper canonical URLs.

### Step 2: Add `generateMetadata` to the unit page

Add a `generateMetadata` export to `app/(public-or-auth)/unit/[unitId]/page.tsx` that:

1. Fetches the unit via `getUnitWithContent(unitId)`
2. If unit not found or not public (and no session), returns a basic fallback title
3. Builds metadata:
   - `title`: `"{unit.title} | OpenLingo"` (e.g. "German Basics: Greetings | OpenLingo")
   - `description`: `unit.description` enriched with language/level/lesson count (e.g. "Learn common German greetings and introductions. 5 lessons -- German, A1 level.")
   - `openGraph.title`: same as title
   - `openGraph.description`: same as description
   - `openGraph.type`: `"website"`
   - `openGraph.siteName`: `"OpenLingo"`
   - `twitter.card`: `"summary"`
   - `twitter.title`: same as title
   - `twitter.description`: same as description

No OG image for now (no image generation infrastructure exists). The title + description alone will produce good previews on most platforms.

## Todo List

- [ ] 1. Add `metadataBase` to root layout
- [ ] 2. Add `generateMetadata` to unit page
- [ ] 3. Verify build succeeds
