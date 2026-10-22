// TEMP DEBUG — request-scoped timings shared between layouts and pages so a
// slow step in the (main) layout shows up in the page's debug output.
export const __timings: Record<string, number> = {};

export function __time<T>(name: string, p: Promise<T>): Promise<T> {
  const s = Date.now();
  return p.then((v) => {
    __timings[name] = Date.now() - s;
    return v;
  });
}
