"use client";

import Link from "next/link";

export interface Crumb {
  label: string;
  /** Ancestors link somewhere; the last crumb is the current page. */
  href?: string;
  /** For in-page ancestors (e.g. "back to the unit list") instead of a URL. */
  onClick?: () => void;
}

/**
 * Directory-style path bar: Library / Course title / Unit 3.
 *
 * Replaces the old one-off "← All units" / "×" buttons — every level is
 * reachable by clicking the level above it, and the current level is shown
 * as plain bold text so it is obvious where you are.
 */
export function Breadcrumb({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex min-w-0 flex-wrap items-center gap-1 text-sm ${className}`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const label = (
          <span
            className={`max-w-[9rem] truncate sm:max-w-[16rem] ${
              isLast
                ? "font-black text-lingo-text"
                : "font-semibold text-lingo-text-light transition-colors hover:text-lingo-text"
            }`}
            title={item.label}
          >
            {item.label}
          </span>
        );

        return (
          <span key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-lingo-text-light/50">
                /
              </span>
            )}
            {isLast ? (
              label
            ) : item.href ? (
              <Link href={item.href} className="min-w-0">
                {label}
              </Link>
            ) : item.onClick ? (
              <button type="button" onClick={item.onClick} className="min-w-0">
                {label}
              </button>
            ) : (
              label
            )}
          </span>
        );
      })}
    </nav>
  );
}