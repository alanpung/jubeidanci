# Research: Adding GitHub Stars Badge to Authenticated Top Bar

## Current Architecture

### Top Bar Component (`components/layout/top-bar.tsx`)
- **Client component** (`"use client"`)
- Receives `stats` prop (server-side) with `currentStreak` and `wordsLearned`
- Uses `useSession()` from `@/lib/auth-client` for the signed-in user's name
- Layout:
  - Left side: "OpenLingo" brand (mobile only, `md:hidden`)
  - Center-left: Stats section (words learned + streak)
  - `flex-1` spacer
  - Right side: User name (hidden on small screens) + Sign Out button
- Sticky header with `h-16`, `border-b-2`, white background, `z-30`

### GitHub Stars (currently only on landing page)
- **`app/page.tsx`** contains:
  1. `getGitHubStars()` - async server function that fetches `https://api.github.com/repos/pretzelai/openlingo` with `next: { revalidate: 3600 }` (1-hour ISR cache). Returns `stargazers_count` or `null` on error.
  2. A pill-shaped `<a>` tag linking to `https://github.com/pretzelai/openlingo` with:
     - GitHub octocat SVG icon (20x20)
     - "GitHub" text label
     - Conditional star count (yellow star SVG 14x14 + formatted number: `>=1000` shows `X.Xk`, otherwise `toLocaleString()`)
     - Styled as rounded-full, border, bg-white, hover effects

### Layouts that render `<TopBar>`
1. **`app/(main)/layout.tsx`** - Authenticated layout. Fetches stats server-side, passes to `<TopBar stats={stats} />`.
2. **`app/(public-or-auth)/layout.tsx`** - Dual-mode layout. When authenticated, renders the same Sidebar + TopBar + MobileNav pattern with stats.

### Key Constraints
- `TopBar` is a **client component** - it cannot directly call `getGitHubStars()` (which uses `fetch` with Next.js ISR caching).
- The stars data must be passed from a **server component** (the layout) as a prop, similar to how `stats` is passed.
- The GitHub stars fetcher `getGitHubStars()` is currently defined locally in `app/page.tsx` and would need to be extracted to a shared location.

### Design Considerations
- The top bar is fairly compact. Adding a GitHub badge should not clutter it.
- On mobile, the left side shows "OpenLingo" and the right side has the sign-out button. Space is tight.
- On desktop, the left side is empty (sidebar handles branding), and the center-left shows stats. There's room between the stats and the right-side user info.
- The landing page badge is `mb-12` with `px-4 py-2` - it's sized for a content area. For the top bar, it should be more compact.

## Files to Modify
1. **`app/page.tsx`** - Extract `getGitHubStars()` to a shared utility
2. **New file: `lib/github.ts`** - Shared `getGitHubStars()` function
3. **`components/layout/top-bar.tsx`** - Add GitHub stars badge, accept `githubStars` prop
4. **`app/(main)/layout.tsx`** - Fetch and pass `githubStars` to TopBar
5. **`app/(public-or-auth)/layout.tsx`** - Fetch and pass `githubStars` to TopBar (authenticated branch)
