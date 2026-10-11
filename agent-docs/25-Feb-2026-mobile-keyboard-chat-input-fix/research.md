# Research: Mobile Keyboard & Chat Input Issues

## Problem Statement

Three issues on mobile:
1. Chat input floats to the middle of the screen instead of sitting on top of the keyboard
2. Possible zoom in/out (pinch-to-zoom, double-tap zoom, input focus zoom)
3. Horizontal scrollbar / horizontal scroll possible

## Current Architecture

### Component Hierarchy (Mobile)

```
<html>
  <body>
    <div min-h-screen bg-lingo-bg>
      <Sidebar />                     (hidden on mobile via md:hidden)
      <div md:pl-64>
        <TopBar />                    (sticky top-0 z-30, h-16)
        <main p-4 pb-20 md:p-8>
          <ChatLayout>
            <div -m-4, flex, h-[calc(100dvh-9rem)]>   ← outer container
              <Sidebar (conversations)>                 (fixed overlay on mobile)
              <div flex-1 flex-col>
                <MobileToggle>                          (hidden when keyboard open)
                <div flex-1>
                  <ChatView>
                    <div flex h-full flex-col max-w-3xl>
                      <div relative flex-1>             ← messages region
                        <div absolute inset-0 overflow-y-auto touch-pan-y>
                          messages...
                        </div>
                        <ScrollToBottomButton>
                      </div>
                      <div sticky bottom-0 z-10>        ← INPUT AREA
                        <ModelSelector>
                        <form>
                          <textarea> + <button>
                        </form>
                      </div>
                    </div>
                  </ChatView>
                </div>
              </div>
            </div>
          </ChatLayout>
        </main>
      </div>
      <MobileNav />                   (fixed bottom-0 z-30)
    </div>
  </body>
</html>
```

### Key Files

| File | Role |
|------|------|
| `app/layout.tsx` | Root layout, no viewport meta |
| `app/(main)/layout.tsx` | Main layout, has TopBar + MobileNav |
| `app/globals.css` | Global CSS, Tailwind v4 |
| `components/chat/chat-layout.tsx` | Chat wrapper, height calc `h-[calc(100dvh-9rem)]` |
| `components/chat/chat-view.tsx` | Messages + input area |
| `components/layout/mobile-nav.tsx` | Bottom nav bar |
| `hooks/use-mobile-keyboard-open.ts` | Keyboard detection hook |

## Root Cause Analysis

### Issue 1: Input Floats to Middle

The chat container uses `h-[calc(100dvh-9rem)]` in `chat-layout.tsx:124`. The input inside uses `sticky bottom-0`. The problem:

- On iOS Safari and Android Chrome, when the virtual keyboard opens, the **visual viewport** shrinks but the **layout viewport** stays the same size by default.
- `100dvh` resolves based on the dynamic viewport (accounts for browser chrome like URL bar) but does NOT account for the virtual keyboard.
- Since the container height doesn't shrink when the keyboard opens, the `sticky bottom-0` input sticks to the bottom of the original container - which is now behind/below the keyboard. The browser then tries to scroll the input into view, causing it to appear in the middle of the screen.
- There is NO `interactive-widget=resizes-content` viewport meta tag. This meta property (supported on Chrome 108+, Safari 15.4+) tells the browser to resize the layout viewport when the keyboard opens, which would make `100dvh` shrink automatically.

### Issue 2: Zoom

- No viewport `maximum-scale=1` or `user-scalable=no` is set. Next.js default is `width=device-width, initial-scale=1`.
- On iOS, inputs with `font-size < 16px` trigger auto-zoom on focus. The textarea uses `text-base` (16px on mobile) which should be fine, but the `md:text-sm` breakpoint could cause issues if the breakpoint is hit on tablets.
- Pinch-to-zoom is fully enabled, which can cause horizontal overflow.
- No `overscroll-behavior` or `overflow: hidden` on the root to prevent bounce/overscroll.

### Issue 3: Horizontal Scroll

- No explicit `overflow-x: hidden` on body, html, or the root container.
- The `min-h-screen` on the root div doesn't constrain horizontal overflow.
- Content could overflow horizontally from chat messages (long code blocks, URLs, etc).
- Pinch-to-zoom can create the illusion of horizontal scroll.

## Existing Mobile Keyboard Handling

The `useMobileKeyboardOpen` hook detects keyboard open via `visualViewport` API. When keyboard is detected:
- `chat-view.tsx`: Hides scroll-to-bottom button, hides model selector, reduces input padding
- `chat-layout.tsx`: Hides hamburger toggle
- `mobile-nav.tsx`: Shows thin draft preview instead of full nav

However, none of these handle the **core layout problem**: the container height doesn't adjust for the keyboard.

## Browser Support Notes

- `interactive-widget=resizes-content` viewport meta: Chrome 108+, Safari 15.4+ (iOS 15.4+). Good enough for modern mobile.
- `visualViewport` API: Widely supported (Chrome 61+, Safari 13+).
- `dvh` unit: Chrome 108+, Safari 15.4+. Already used in the codebase.
- `overscroll-behavior`: Chrome 63+, Safari 16+.
