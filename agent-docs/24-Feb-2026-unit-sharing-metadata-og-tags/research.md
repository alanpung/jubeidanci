# Research: Unit Sharing Metadata / OG Tags

## Current State

### Root Layout Metadata (`app/layout.tsx`)
The only metadata in the entire codebase is a static export in the root layout:
```ts
export const metadata: Metadata = {
  title: "OpenLingo",
  description: "OpenSource AI connected to language learning",
  manifest: "/manifest.json",
  appleWebApp: { ... },
  icons: { ... },
};
```

There is **no Open Graph**, **no Twitter Card**, **no `generateMetadata`**, and **no per-page metadata** anywhere. Every page currently inherits the root "OpenLingo" title and description.

### Public Unit Page (`app/(public-or-auth)/unit/[unitId]/page.tsx`)
This is a server component that:
1. Fetches the unit via `getUnitWithContent(unitId)` -- returns `UnitWithContent` which includes `title`, `description`, `icon`, `targetLanguage`, `sourceLanguage`, `level`, `visibility`, `createdBy`, `lessons[]`.
2. No metadata export exists.

### Data Available for Metadata
From `UnitWithContent`:
- `unit.title` -- e.g. "German Basics: Greetings"
- `unit.description` -- e.g. "Learn common German greetings and introductions"
- `unit.icon` -- emoji like "🇩🇪"
- `unit.targetLanguage` -- e.g. "de"
- `unit.sourceLanguage` -- e.g. "en"
- `unit.level` -- e.g. "A1"
- `unit.lessons.length` -- number of lessons

### Next.js `generateMetadata` API
Next.js App Router supports a `generateMetadata` async function export from page files. It receives the same `params` and `searchParams` as the page component. It can return `Metadata` objects with:
- `title` -- sets `<title>` and `og:title`
- `description` -- sets `<meta name="description">` and `og:description`
- `openGraph` -- explicit OG tags (`title`, `description`, `type`, `url`, `siteName`, `images`)
- `twitter` -- Twitter Card tags (`card`, `title`, `description`, `images`)

When `generateMetadata` is exported alongside the page component, Next.js runs it server-side and merges it with parent layout metadata (the root "OpenLingo" metadata).

### `metadataBase`
Currently missing from root layout. Without `metadataBase`, Next.js can't resolve relative URLs for OG images. We should add `metadataBase` to the root layout pointing to the production URL.

### Relevant Utility: `getLanguageName`
`lib/languages.ts` exports `getLanguageName(code)` which converts "de" to "German" etc. Useful for building readable descriptions.
