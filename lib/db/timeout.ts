/**
 * Bounded waits for DB reads on user-facing render paths.
 *
 * postgres.js queues a query forever when every connection in the pool is
 * busy (there is no queue timeout in the driver), and a slow/contended
 * Postgres therefore shows up as a page that never responds rather than an
 * error. Anything the page can render without should go through
 * `withTimeout` so a stalled query degrades to "no data" instead of hanging
 * the request until the serverless function is killed.
 */
export async function withTimeout<T>(
  label: string,
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(
        `[db] "${label}" exceeded ${ms}ms — continuing without it`,
      );
      resolve(fallback);
    }, ms);
    // Never keep a serverless invocation alive just for the watchdog.
    (timer as unknown as { unref?: () => void }).unref?.();
  });

  try {
    return await Promise.race([promise, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
