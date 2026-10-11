# Research: Adding Cloudflare Turnstile to Login & Signup

## 1. Project Overview

- **Framework**: Next.js 16 (App Router) with React 19, TypeScript
- **Runtime**: Bun
- **Auth Library**: `better-auth` v1.4.18 (email/password + Google OAuth)
- **Database**: PostgreSQL via Drizzle ORM
- **Styling**: Tailwind CSS 4
- **No existing CAPTCHA/bot protection** - no rate limiting, no middleware.ts, no CAPTCHA of any kind

## 2. Auth Architecture

### Client-Side Auth

**`lib/auth-client.ts`** - Creates a `better-auth` React client and exports `signIn`, `signUp`, `signOut`, `useSession`.

The login and signup forms call `better-auth`'s client SDK methods directly:
- `signIn.email({ email, password })` - POSTs to `/api/auth/sign-in/email`
- `signUp.email({ name, email, password })` - POSTs to `/api/auth/sign-up/email`
- `signIn.social({ provider: "google" })` - Redirects to Google OAuth flow

### Server-Side Auth

**`lib/auth.ts`** - Configures `betterAuth()` with:
- `emailAndPassword: { enabled: true }` - No custom validation
- `socialProviders: { google: {...} }` - Google OAuth
- `databaseHooks.user.create.after` - Post-signup hook (creates userStats, userPreferences, sends Slack notification)
- No plugins configured

**`app/api/auth/[...all]/route.ts`** - Catch-all route delegating all auth operations to better-auth via `toNextJsHandler(auth)`.

### Form Components

**`components/auth/sign-in-form.tsx`** (client component):
- State: `email`, `password`, `error`, `loading`, `googleLoading`
- `handleSubmit` calls `signIn.email({ email, password })`
- `handleGoogleSignIn` calls `signIn.social({ provider: "google" })`
- Renders: email input, password input, error display, submit button, Google OAuth button, link to sign-up

**`components/auth/sign-up-form.tsx`** (client component):
- State: `name`, `email`, `password`, `error`, `loading`, `googleLoading`
- `handleSubmit` calls `signUp.email({ name, email, password })`
- `handleGoogleSignIn` calls `signIn.social({ provider: "google" })`
- Renders: name input, email input, password input (minLength=8), error display, submit button, Google OAuth button, link to sign-in

### Pages

- `app/(auth)/sign-in/page.tsx` - Server component, reads `?redirect=` param, renders `<SignInForm>`
- `app/(auth)/sign-up/page.tsx` - Server component, reads `?redirect=` param, renders `<SignUpForm>`
- `app/(auth)/layout.tsx` - Centered card layout with OpenLingo branding

## 3. Cloudflare Turnstile Integration Points

### What Turnstile Requires

**Client-side:**
1. Load the Turnstile script (`https://challenges.cloudflare.com/turnstile/v0/api.js`)
2. Render a widget using either implicit (HTML class-based) or explicit (JavaScript API) rendering
3. On challenge completion, a token is generated
4. Token must be sent to the server with the form submission

**Server-side:**
1. Validate the token by calling Cloudflare's Siteverify API: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
2. Required params: `secret` (server-side secret key), `response` (the token from client)
3. Optional: `remoteip`, `idempotency_key`
4. Returns `{ success: true/false, ... }`
5. Tokens expire after 300 seconds and are single-use

### Key Decision: How to Intercept Auth Requests

Since `better-auth` handles auth endpoints internally via the `[...all]` catch-all route, we need to intercept requests **before** they reach `better-auth` to validate the Turnstile token. Options:

**Option A: better-auth Plugin (Hooks/Middleware)**
- Use `better-auth`'s plugin system with a `before` hook that matches sign-in/sign-up email paths
- The hook would extract the Turnstile token from the request body, validate it against Siteverify, and reject if invalid
- This is the cleanest approach as it integrates directly with the auth system
- The client SDK `signIn.email()` and `signUp.email()` accept a `fetchOptions` parameter where we can add the token to the request body

**Option B: Next.js Middleware**
- Create a `middleware.ts` that intercepts POST requests to `/api/auth/sign-in/email` and `/api/auth/sign-up/email`
- Problem: Next.js middleware runs at the Edge and can make fetch calls, but reading/modifying POST bodies in middleware is cumbersome
- Not ideal

**Option C: Custom wrapper in the catch-all route**
- Modify `app/api/auth/[...all]/route.ts` to intercept specific paths before delegating to better-auth
- More manual but gives full control

**Best approach: Option A (better-auth plugin)** - cleanest, most maintainable, and the forms can pass the token via `fetchOptions.body`.

### Client-Side Rendering Strategy

Since this is a React SPA with client-side form handling, **explicit rendering** is the right choice:
- Forms are React components, not traditional HTML forms
- We need to get the token programmatically to include it in the `signIn.email()` / `signUp.email()` calls
- We need React lifecycle integration (mount/unmount cleanup)

Best approach: Create a reusable `<Turnstile>` React component that:
1. Loads the script once (via `<Script>` from `next/script` or manual script loading)
2. Uses `turnstile.render()` to create the widget
3. Calls a callback with the token when challenge is solved
4. Handles cleanup on unmount via `turnstile.remove()`

### How to Pass Token to better-auth

The `signIn.email()` and `signUp.email()` methods from `better-auth/react` accept a `fetchOptions` parameter. We can add custom headers or body fields. Looking at the better-auth source, the cleanest way is to either:
1. Add a custom body field (e.g., `turnstileToken`) - requires the plugin to extract from body
2. Add a custom header (e.g., `x-turnstile-token`) - cleaner, doesn't pollute body

Using a custom header is cleaner since the plugin hook can read it from `ctx.headers`.

## 4. Environment Variables Needed

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Public site key (exposed to client)
- `TURNSTILE_SECRET_KEY` - Secret key for server-side validation

These need to be added to `example.env.local` and `.env.local`.

## 5. Testing Considerations

Cloudflare provides testing keys:
- Visible pass: sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`
- Visible fail: sitekey `2x00000000000000000000AB`, secret `2x0000000000000000000000000000000AB`
- Invisible pass: sitekey `1x00000000000000000000BB`, secret same as visible pass
- Forced interaction: sitekey `3x00000000000000000000FF`

## 6. Scope: Google OAuth

Turnstile is primarily needed for email/password flows (which are automated bot targets). Google OAuth has its own bot protection via Google's OAuth flow. We should **not** add Turnstile to the Google OAuth buttons - it would add friction without benefit since OAuth flows inherently verify the user through Google.

## 7. Files to Modify/Create

### New Files:
1. `components/auth/turnstile.tsx` - Reusable Turnstile React component
2. `lib/turnstile.ts` - Server-side Turnstile validation utility
3. `lib/turnstile-plugin.ts` - better-auth plugin for Turnstile validation

### Files to Modify:
1. `components/auth/sign-in-form.tsx` - Add Turnstile widget, pass token on submit
2. `components/auth/sign-up-form.tsx` - Add Turnstile widget, pass token on submit
3. `lib/auth.ts` - Add turnstile plugin to better-auth config
4. `lib/auth-client.ts` - Add turnstile client plugin if needed
5. `example.env.local` - Add Turnstile env vars
