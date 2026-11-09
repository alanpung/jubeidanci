import { DEFAULT_PATH } from "./constants";

/**
 * Sanitise a `?redirect=` value before using it as a navigation target.
 *
 * The value comes straight from the query string, so accepting it verbatim
 * turns a successful sign-in into an open redirect (`//evil.com`,
 * `https://evil.com`, or `/\evil.com` — browsers normalise backslashes into
 * slashes). Only root-relative same-origin paths are allowed.
 *
 * Keeping path + query + hash means deep links such as
 * `/library?folder=foo` survive the sign-in round trip.
 */
export function safeRedirectPath(
  value?: string | null,
  fallback: string = DEFAULT_PATH,
): string {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return fallback;
  }

  try {
    const base = new URL("http://local.invalid");
    const resolved = new URL(trimmed, base);
    if (resolved.origin !== base.origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
