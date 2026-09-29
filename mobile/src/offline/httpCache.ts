import { scopedKey } from "./scope";
import { getJson, removeJson, setJson } from "./storage";

/**
 * Local copy of every GET the app makes, kept per signed-in user.
 *
 * It does two jobs, both wired into the shared axios client (api/client.ts) so every screen gets
 * them without changing its own loading code:
 *
 *  1. Fresh entries are served straight from the phone — opening a screen inside FRESH_MS of the
 *     last visit makes no server call at all.
 *  2. Entries of ANY age are the fallback when the server can't be reached, so the whole app keeps
 *     working from the last data it saw.
 *
 * Any successful write marks everything stale (still usable offline, but re-fetched next time).
 */

export const FRESH_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 300;
const PRUNE_TO = 250;
/** How long after a pull-to-refresh / reconnect requests skip the fresh-cache shortcut. */
const BYPASS_WINDOW_MS = 4000;

const ENTRY_BASE = "dt_http_cache";
const INDEX_BASE = "dt_http_cache_index";
const META_BASE = "dt_http_cache_meta";

/** Paths that must always hit the server: live data, or things with side effects on read. */
const NEVER_CACHE_PREFIXES = ["/auth", "/chat", "/location", "/assistant", "/ocr"];

interface Entry {
  data: unknown;
  cachedAt: number;
}

export interface CachedResponse {
  data: unknown;
  cachedAt: number;
  fresh: boolean;
}

let loadedScope: string | null = null;
let index: string[] = [];
let staleBefore = 0;
let bypassUntil = 0;
/** Serialises index/meta writes so concurrent responses can't clobber each other. */
let chain: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): Promise<void> {
  chain = chain.then(work).catch(() => undefined);
  return chain;
}

export function isCacheableUrl(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.startsWith("/") ? url : `/${url}`;
  return !NEVER_CACHE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Makes the next few requests go to the server even if a fresh copy exists (pull-to-refresh). */
export function bypassCacheBriefly(): void {
  bypassUntil = Date.now() + BYPASS_WINDOW_MS;
}

export function isBypassing(): boolean {
  return Date.now() < bypassUntil;
}

function stableParams(params: unknown): string {
  if (!params || typeof params !== "object") return "";
  const entries = Object.entries(params as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(entries) : "";
}

function idFor(url: string, params: unknown): string {
  return `${url}?${stableParams(params)}`;
}

function entryKey(scope: string, id: string): string {
  return `${ENTRY_BASE}:${scope}:${id}`;
}

async function ensureLoaded(): Promise<string | null> {
  const scope = scopedKey("scope");
  if (!scope) return null;
  if (loadedScope === scope) return scope;
  const [storedIndex, meta] = await Promise.all([
    getJson<string[]>(`${INDEX_BASE}:${scope}`),
    getJson<{ staleBefore: number }>(`${META_BASE}:${scope}`),
  ]);
  index = storedIndex ?? [];
  staleBefore = meta?.staleBefore ?? 0;
  loadedScope = scope;
  return scope;
}

export async function getCachedResponse(url: string, params: unknown): Promise<CachedResponse | null> {
  const scope = await ensureLoaded();
  if (!scope) return null;
  const entry = await getJson<Entry>(entryKey(scope, idFor(url, params)));
  if (!entry || typeof entry.cachedAt !== "number") return null;
  return {
    data: entry.data,
    cachedAt: entry.cachedAt,
    fresh: entry.cachedAt > staleBefore && Date.now() - entry.cachedAt < FRESH_MS,
  };
}

export async function putCachedResponse(url: string, params: unknown, data: unknown): Promise<void> {
  const scope = await ensureLoaded();
  if (!scope) return;
  const id = idFor(url, params);
  await setJson(entryKey(scope, id), { data, cachedAt: Date.now() } satisfies Entry);
  await enqueue(async () => {
    if (!index.includes(id)) index.push(id);
    if (index.length > MAX_ENTRIES) {
      // Oldest entries were pushed first; drop them until back under the low-water mark.
      const drop = index.splice(0, index.length - PRUNE_TO);
      await Promise.all(drop.map((old) => removeJson(entryKey(scope, old))));
    }
    await setJson(`${INDEX_BASE}:${scope}`, index);
  });
}

/** After a successful write: keep every copy for offline use, but stop treating them as fresh. */
export async function markCacheStale(): Promise<void> {
  const scope = await ensureLoaded();
  if (!scope) return;
  staleBefore = Date.now();
  await enqueue(() => setJson(`${META_BASE}:${scope}`, { staleBefore }));
}

/**
 * Applies `change` to the cached body of every entry for `url` (all query variants) so a write
 * queued while offline shows up immediately in lists and detail screens.
 */
export async function patchCachedResponses(
  url: string,
  change: (data: unknown) => unknown
): Promise<void> {
  const scope = await ensureLoaded();
  if (!scope) return;
  const prefix = `${url}?`;
  const matches = index.filter((id) => id.startsWith(prefix));
  await Promise.all(
    matches.map(async (id) => {
      const key = entryKey(scope, id);
      const entry = await getJson<Entry>(key);
      if (!entry) return;
      await setJson(key, { ...entry, data: change(entry.data) } satisfies Entry);
    })
  );
}

/** Drops everything cached for the current user (used when the person asks to clear local data). */
export async function clearHttpCache(): Promise<void> {
  const scope = await ensureLoaded();
  if (!scope) return;
  const ids = [...index];
  index = [];
  await Promise.all(ids.map((id) => removeJson(entryKey(scope, id))));
  await enqueue(() => setJson(`${INDEX_BASE}:${scope}`, index));
}
