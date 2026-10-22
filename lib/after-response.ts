/**
 * Run work *after* the response has been sent when we're inside a request.
 *
 * Several maintenance jobs (content re-seed, SRS course-word sync, card
 * migration) are fire-and-forget: callers `void` them and never await the
 * result. That means they run *concurrently with the request that started
 * them*, competing for the same small postgres.js pool (max 5 in production)
 * and the same CPU. With no queue timeout in the driver, the page's own
 * queries simply wait — which is how a 2s page turned into a request that
 * never responded at all.
 *
 * Next's `after()` defers the callback until the response is flushed, so the
 * job still runs but no longer blocks the learner. Outside a request scope
 * (scripts, tests) we fall back to plain fire-and-forget.
 */
export async function runAfterResponse(fn: () => unknown): Promise<void> {
  try {
    // Imported lazily: `next/server` is not available outside a request scope.
    const nextServer = (await import("next/server")) as unknown as {
      after?: (cb: () => unknown) => void;
    };
    if (typeof nextServer.after === "function") {
      nextServer.after(() => fn());
      return;
    }
  } catch {
    // No request context — fall through to fire-and-forget.
  }
  void fn();
}
