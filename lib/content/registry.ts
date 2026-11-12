import {
  loadContentDir,
  invalidateContentDirCache,
  type LoadedCourse,
  type LoadedUnit,
} from "./loader";

export type { LoadedCourse, LoadedUnit };

/**
 * The registry does NOT keep its own copy of the scan.
 *
 * It used to memoise `loadContentDir()` in a module-level `cache`, which
 * created a second layer of staleness on top of the loader's own cache: the
 * loader could notice that the content directory changed and re-scan, but the
 * registry kept handing out the OLD result. The seeder reads the catalog
 * through the registry, so a newly committed `content/*.md` unit stayed
 * invisible to it — the "Standalone Units" folder simply never filled up.
 *
 * `loadContentDir()` already caches intelligently (24h TTL + a cheap
 * directory-signature check that invalidates the moment a file is added,
 * removed or modified), so delegating to it directly is both correct and
 * cheap.
 */
export function getAllCourses(): LoadedCourse[] {
  return loadContentDir().courses;
}

export function getAllUnits(): LoadedUnit[] {
  return loadContentDir().units;
}

/** Drop the registry's memoised scan (kept for API compatibility). */
export function invalidateCache() {
  invalidateContentDirCache();
}

/**
 * Drop every layer of cached content state, so the next read re-scans the
 * content directory from disk.
 */
export function invalidateAllCaches() {
  invalidateContentDirCache();
}
