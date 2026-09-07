import { requireScopedKey, scopedKey } from "./scope";
import { getJson, setJson } from "./storage";

/** Namespaced per user — see offline/scope.ts. */
const CACHE_KEY_BASE = "dt_read_cache";

function cacheKey(resource: string): string | null {
  const scoped = scopedKey(CACHE_KEY_BASE);
  return scoped ? `${scoped}:${resource}` : null;
}

/** Persists the last-known-good response for a resource, so it can be shown while offline. */
export async function saveCache<T>(resource: string, data: T): Promise<void> {
  await setJson(`${requireScopedKey(CACHE_KEY_BASE)}:${resource}`, data);
}

export async function loadCache<T>(resource: string): Promise<T | null> {
  const key = cacheKey(resource);
  if (!key) return null;
  return getJson<T>(key);
}
