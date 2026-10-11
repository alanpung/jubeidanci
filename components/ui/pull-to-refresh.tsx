"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface PullToRefreshProps {
  children: React.ReactNode;
  className?: string;
  onRefresh?: () => Promise<void> | void;
  /**
   * Distance in pixels required to trigger refresh. Default: 65
   */
  threshold?: number;
  /**
   * Maximum pull distance in pixels. Default: 100
   */
  maxPull?: number;
  /**
   * Whether to disable pull to refresh (e.g. during lesson interactive gameplay)
   */
  disabled?: boolean;
}

export function PullToRefresh({
  children,
  className = "",
  onRefresh,
  threshold = 65,
  maxPull = 100,
  disabled = false,
}: PullToRefreshProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // References for touch tracking to avoid stale closures
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const hasHapticRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const minDelay = new Promise((resolve) => setTimeout(resolve, 700));

    try {
      if (onRefresh) {
        await Promise.all([onRefresh(), minDelay]);
      } else {
        router.refresh();
        await minDelay;
      }
    } catch {
      await minDelay;
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      isPullingRef.current = false;
      hasHapticRef.current = false;
    }
  }, [onRefresh, router]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    function getScrollTop(): number {
      if (!el) return 0;
      return el.scrollTop;
    }

    function onTouchStart(e: TouchEvent) {
      if (isRefreshing || disabled) return;
      if (e.touches.length !== 1) return;

      const scrollTop = getScrollTop();
      if (scrollTop <= 1) {
        startYRef.current = e.touches[0].clientY;
        startXRef.current = e.touches[0].clientX;
        isPullingRef.current = true;
        hasHapticRef.current = false;
      } else {
        isPullingRef.current = false;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPullingRef.current || isRefreshing || disabled) return;
      if (e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startYRef.current;
      const diffX = currentX - startXRef.current;

      const scrollTop = getScrollTop();

      // Only pull when at the top and pulling down
      if (scrollTop <= 0 && diffY > 0) {
        // If the swipe is more horizontal than vertical, ignore
        if (Math.abs(diffX) > Math.abs(diffY)) {
          isPullingRef.current = false;
          setPullDistance(0);
          setIsDragging(false);
          return;
        }

        // Prevent default browser bounce / scrolling when pulling
        if (e.cancelable) {
          e.preventDefault();
        }

        setIsDragging(true);

        // Calculate damped distance
        // Logarithmic damping for smooth native feel
        const damping = 0.45;
        const rawDistance = diffY * damping;
        const calculatedDistance = Math.min(maxPull, Math.max(0, rawDistance));

        setPullDistance(calculatedDistance);

        // Haptic feedback when threshold reached
        if (calculatedDistance >= threshold && !hasHapticRef.current) {
          hasHapticRef.current = true;
          if (typeof window !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate(12);
            } catch {
              // Ignore vibration failure
            }
          }
        } else if (calculatedDistance < threshold && hasHapticRef.current) {
          hasHapticRef.current = false;
        }
      } else {
        if (isDragging) {
          setPullDistance(0);
          setIsDragging(false);
        }
      }
    }

    function onTouchEnd() {
      if (!isPullingRef.current || isRefreshing || disabled) return;

      isPullingRef.current = false;
      setIsDragging(false);

      if (pullDistance >= threshold) {
        setPullDistance(52); // Keep pinned at indicator height during refresh
        handleRefresh();
      } else {
        setPullDistance(0);
      }
    }

    function onTouchCancel() {
      isPullingRef.current = false;
      setIsDragging(false);
      if (!isRefreshing) {
        setPullDistance(0);
      }
    }

    // Attach passive: false so we can preventDefault when pulling down at top
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [disabled, isRefreshing, maxPull, pullDistance, threshold, handleRefresh, isDragging]);

  const progress = Math.min(1, pullDistance / threshold);
  const isReadyToRelease = pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 overflow-y-auto ${className}`}
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Pull to refresh visual indicator badge */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-40 flex justify-center transition-transform"
        style={{
          transform: `translateY(${isRefreshing ? 12 : Math.max(-48, pullDistance - 44)}px)`,
          transitionDuration: isDragging ? "0ms" : "250ms",
          opacity: pullDistance > 8 || isRefreshing ? Math.min(1, Math.max(0, (pullDistance - 8) / 25)) : 0,
        }}
      >
        <div className="flex items-center gap-2 rounded-full border-2 border-lingo-border bg-white/95 px-3.5 py-1.5 shadow-md backdrop-blur-sm">
          {isRefreshing ? (
            <>
              <svg
                className="h-4 w-4 animate-spin text-lingo-blue"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-xs font-bold text-lingo-text">
                Refreshing...
              </span>
            </>
          ) : (
            <>
              <div
                className="transition-transform duration-200"
                style={{
                  transform: `rotate(${isReadyToRelease ? 180 : progress * 180}deg)`,
                }}
              >
                <svg
                  className={`h-4 w-4 ${
                    isReadyToRelease ? "text-lingo-green" : "text-lingo-text-light"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
                  />
                </svg>
              </div>
              <span
                className={`text-xs font-bold ${
                  isReadyToRelease ? "text-lingo-green" : "text-lingo-text-light"
                }`}
              >
                {isReadyToRelease ? "Release to refresh" : "Pull down to refresh"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main content with subtle pull transform offset */}
      <div
        className="min-h-full flex flex-col"
        style={{
          transform: `translateY(${isRefreshing ? 48 : pullDistance * 0.45}px)`,
          transition: isDragging ? "none" : "transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
