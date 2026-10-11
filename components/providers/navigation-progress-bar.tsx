"use client";

import { useEffect, useState, useRef, useTransition, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavigationProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [, startTransition] = useTransition();

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);

  // When pathname or searchParams change, finish the loading bar
  useEffect(() => {
    if (isNavigating) {
      setProgress(100);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(() => {
        setIsNavigating(false);
        setProgress(0);
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => {
    // Intercept clicks on links to start progress immediately
    const handleClick = (e: MouseEvent) => {
      // Find nearest anchor
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;

      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Ignore hash links, external links, mailto, tel, target="_blank", or modifier keys
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        anchor.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey ||
        e.defaultPrevented
      ) {
        return;
      }

      // Check if it's an internal link
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;

        // If clicking same path + query + hash, ignore
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search &&
          url.hash === window.location.hash
        ) {
          return;
        }

        // Start progress immediately
        startTransition(() => {
          setIsNavigating(true);
          setProgress(25);

          if (timerRef.current) clearInterval(timerRef.current);

          timerRef.current = setInterval(() => {
            setProgress((prev) => {
              if (prev >= 90) {
                if (timerRef.current) clearInterval(timerRef.current);
                return 90;
              }
              // Trickle progress forward
              const step = Math.random() * 15 + 5;
              return Math.min(90, prev + step);
            });
          }, 180);
        });
      } catch {
        // Ignore invalid URL
      }
    };

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      if (timerRef.current) clearInterval(timerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  if (!isNavigating && progress === 0) return null;

  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-[9999]">
      {/* Top Loading Bar */}
      <div
        className="h-1 bg-gradient-to-r from-lingo-green via-lingo-blue to-lingo-purple shadow-[0_0_10px_rgba(28,176,246,0.6)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transitionProperty: "width, opacity",
        }}
      />

      {/* Floating Mini Buffering Badge (Top Right) */}
      <div
        className={`fixed top-3 right-3 z-[9999] flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 shadow-lg border border-lingo-border backdrop-blur-sm transition-opacity duration-200 ${
          progress > 0 && progress < 100 ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-lingo-blue border-t-transparent" />
        <span className="text-[11px] font-bold text-lingo-text">Loading...</span>
      </div>
    </div>
  );
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBarInner />
    </Suspense>
  );
}
