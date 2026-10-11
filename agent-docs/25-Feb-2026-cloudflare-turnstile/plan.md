# Plan: Add Cloudflare Turnstile to Login & Signup

## Strategy

Integrate Cloudflare Turnstile using a **better-auth server plugin** for server-side validation and a **reusable React component** for client-side widget rendering. The token will be passed via a custom `x-turnstile-token` HTTP header from the forms, and validated in a `before` hook on the auth sign-in/sign-up endpoints.

Turnstile is only added to email/password flows. Google OAuth is excluded since it has its own bot protection.

## Architecture

```
Client (React)                    Server (Next.js / better-auth)
┌─────────────────────┐          ┌──────────────────────────────┐
│ <Turnstile>         │          │ better-auth plugin (before   │
│  - renders widget   │          │  hook on sign-in/sign-up)    │
│  - gets token       │          │  - reads x-turnstile-token   │
│                     │          │    header from request       │
│ signIn.email({      │  POST    │  - calls Siteverify API      │
│   email, password   │ ──────►  │  - rejects if invalid        │
│ }, { headers: {     │          │  - passes through if valid   │
│   x-turnstile-token │          │                              │
│ }})                 │          │ better-auth continues normal  │
└─────────────────────┘          │ sign-in/sign-up flow         │
                                 └──────────────────────────────┘
```

## Files to Create

### 1. `components/auth/turnstile.tsx` - React Turnstile Widget
- Loads Turnstile script via `next/script`
- Uses explicit rendering (`turnstile.render()`) in a `useEffect`
- Accepts `onVerify(token)` callback, `onExpire()` callback, `onError()` callback
- Manages widget lifecycle (render on mount, remove on unmount)
- Passes sitekey from `NEXT_PUBLIC_TURNSTILE_SITE_KEY` env var
- Exposes a `reset()` method via `useImperativeHandle` + `forwardRef` so forms can reset after failed submissions

### 2. `lib/turnstile.ts` - Server-side Validation Utility
- `verifyTurnstileToken(token: string)` function
- Calls `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret` + `response`
- Returns `{ success: boolean, errorCodes?: string[] }`
- Uses `TURNSTILE_SECRET_KEY` env var
- Skips validation in development if env var is not set (returns success) to avoid blocking local dev

### 3. `lib/turnstile-plugin.ts` - better-auth Plugin
- Creates a `BetterAuthPlugin` with id `"turnstile"`
- Adds a `before` hook matching paths `/sign-in/email` and `/sign-up/email`
- Extracts `x-turnstile-token` header from the request
- Calls `verifyTurnstileToken()` to validate
- If invalid: throws `APIError("BAD_REQUEST", { message: "Turnstile verification failed" })`
- If valid: passes through (returns undefined to continue)

## Files to Modify

### 4. `components/auth/sign-in-form.tsx`
- Import and render `<Turnstile>` component between the password field and the submit button
- Store the Turnstile token in state via `onVerify` callback
- Add a ref to the Turnstile component for resetting
- Disable the submit button until Turnstile token is available
- Pass the token as `x-turnstile-token` header via `fetchOptions` in `signIn.email()`
- Reset the Turnstile widget on failed submission (token is single-use)

### 5. `components/auth/sign-up-form.tsx`
- Same changes as sign-in-form: add `<Turnstile>`, store token, disable button until verified, pass header, reset on failure

### 6. `lib/auth.ts`
- Import and add the turnstile plugin to `betterAuth({ plugins: [turnstilePlugin()] })`

### 7. `example.env.local`
- Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` and `TURNSTILE_SECRET_KEY=` with comments

## UX Considerations

- The Turnstile widget renders as a small visible challenge (in "managed" mode by default - Cloudflare decides if interaction is needed)
- Submit button is disabled with a subtle visual state until Turnstile is verified
- On form submission failure, the Turnstile widget is reset to generate a fresh token (since tokens are single-use)
- On Turnstile error or expiration, the submit button becomes disabled again and user sees error feedback
- Theme is set to `"auto"` to match user's system preference

## Development Workflow

- In development, if `TURNSTILE_SECRET_KEY` is not set, the server-side validation is skipped (always passes)
- If `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not set, the Turnstile widget is not rendered and submit is not gated
- This allows local development without Cloudflare credentials
- For testing with real Turnstile, developers can use Cloudflare's test keys

---

## Implementation Todo List

1. Create `lib/turnstile.ts` - server-side token validation utility
2. Create `lib/turnstile-plugin.ts` - better-auth plugin with before hooks
3. Create `components/auth/turnstile.tsx` - reusable React Turnstile widget component
4. Modify `lib/auth.ts` - register the turnstile plugin
5. Modify `components/auth/sign-in-form.tsx` - integrate Turnstile widget and pass token
6. Modify `components/auth/sign-up-form.tsx` - integrate Turnstile widget and pass token
7. Modify `example.env.local` - add Turnstile environment variables
8. Verify the build passes with `bun run build`
