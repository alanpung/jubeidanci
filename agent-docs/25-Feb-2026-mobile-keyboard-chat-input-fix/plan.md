# Plan: Fix Mobile Keyboard & Chat Input

## Summary

Three targeted fixes to make the mobile chat experience solid:
1. Keep the input pinned above the keyboard using `interactive-widget=resizes-content` viewport meta
2. Prevent zoom on mobile
3. Prevent horizontal scroll

---

## Fix 1: Input Stays Above Keyboard

**File: `app/layout.tsx`**

Add a `generateViewport` export with `interactiveWidget: "resizes-content"`. This tells the browser to resize the layout viewport (and therefore `dvh` units) when the virtual keyboard opens. Since the chat container already uses `h-[calc(100dvh-9rem)]`, the container will naturally shrink and the `sticky bottom-0` input will sit right above the keyboard.

This is the cleanest fix - it makes the browser handle the layout correctly rather than us fighting it with JavaScript.

**File: `components/chat/chat-view.tsx`**

When the keyboard is open, scroll to the bottom of the conversation so the latest messages + input are visible. Add an effect that calls `scrollToBottom()` when `isKeyboardOpen` transitions to `true`.

**File: `components/layout/mobile-nav.tsx`**

When `isKeyboardOpen && isChatRoute`, currently shows a thin draft preview bar. With `resizes-content`, the layout already shrinks for the keyboard, so this bar would take up precious space. Change it to hide completely (return `null`) when the keyboard is open on a chat route, same as for non-chat routes.

## Fix 2: Prevent Zoom

**File: `app/layout.tsx`**

In the same `generateViewport` export, set `maximumScale: 1` and `userScalable: false`. This prevents pinch-to-zoom and the iOS auto-zoom on input focus.

The textarea already uses `text-base` (16px) which prevents iOS auto-zoom on focus, but this is belt-and-suspenders.

## Fix 3: Prevent Horizontal Scroll

**File: `app/globals.css`**

Add to `html` / `body`:
- `overflow-x: hidden` - prevents any horizontal scrolling
- `overscroll-behavior: none` - prevents pull-to-refresh and scroll bounce on the body
- A max-width constraint to make sure nothing pushes the body wider

Also add `word-break: break-word` to the message container or globally to handle long unbroken strings (URLs, etc).

**File: `components/chat/chat-view.tsx`**

Add `overflow-x-hidden` to the message scroll container to ensure no horizontal scroll within the chat.

---

## Todo List

1. **`app/layout.tsx`** - Add `generateViewport` with `interactiveWidget: "resizes-content"`, `maximumScale: 1`, `userScalable: false`
2. **`app/globals.css`** - Add `overflow-x: hidden` and `overscroll-behavior: none` on `html, body`
3. **`components/chat/chat-view.tsx`** - Add `overflow-x-hidden` to message scroll container; add effect to scroll-to-bottom when keyboard opens
4. **`components/layout/mobile-nav.tsx`** - Hide completely when keyboard is open on chat route (remove draft preview bar since it's no longer needed with resizes-content)
