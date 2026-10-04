import { apiClient } from "../api/client";
import type { Lead, LeadPage, LeadSource } from "../api/leads";
import { getHttpQueueCount } from "../offline/httpQueue";
import { scopedKey } from "../offline/scope";
import { getJson, removeJson, setJson } from "../offline/storage";

/**
 * A full copy of the person's leads on the phone, so the Leads screen opens instantly and keeps
 * working (search, filters, paging, stage and note edits) when the server is off or unreachable.
 *
 * Edits made offline are queued by offline/httpQueue.ts and replayed later; the same edit is applied
 * here straight away so the list reflects it. The copy is refreshed from the server whenever the
 * list loads online. It is stored in chunks because one AsyncStorage row can't hold thousands of leads.
 */

const BASE = "dt_leads_store";
const CHUNK = 200;
const PAGE_LIMIT = 100;
const NEW_STATUS = /^\s*(new)?\s*$/i;

interface Meta {
  updatedAt: number;
  chunks: number;
  count: number;
  sources: LeadSource[];
}

const metaKey = (scope: string) => `${BASE}:${scope}:meta`;
const chunkKey = (scope: string, i: number) => `${BASE}:${scope}:${i}`;

let cache: { scope: string; leads: Lead[]; meta: Meta } | null = null;
/** Lower-cased text each lead is searched against, built once per lead instead of on every keystroke. */
const haystack = new Map<string, string>();
/** Stage counts per (list, search), reused while paging and switching stages; cleared on any change. */
const countMemo = new Map<string, { stageCounts: { stage: string; count: number }[]; totalAll: number; base: Lead[] }>();

const byNewest = (a: Lead, b: Lead) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id);

function hayFor(l: Lead): string {
  let h = haystack.get(l.id);
  if (h === undefined) {
    h = `${l.name ?? ""}\n${l.status ?? ""}\n${l.notes ?? ""}\n${l.info ?? ""}`.toLowerCase();
    haystack.set(l.id, h);
  }
  return h;
}

function resetDerived(): void {
  haystack.clear();
  countMemo.clear();
}
let refreshing: Promise<number> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}

async function load(): Promise<{ scope: string; leads: Lead[]; meta: Meta } | null> {
  const scope = scopedKey("leads");
  if (!scope) return null;
  if (cache?.scope === scope) return cache;
  const meta = await getJson<Meta>(metaKey(scope));
  if (!meta) return null;
  const leads: Lead[] = [];
  for (let i = 0; i < meta.chunks; i++) leads.push(...((await getJson<Lead[]>(chunkKey(scope, i))) ?? []));
  leads.sort(byNewest);
  resetDerived();
  cache = { scope, leads, meta };
  return cache;
}

async function persist(scope: string, leads: Lead[], sources: LeadSource[]): Promise<void> {
  const old = await getJson<Meta>(metaKey(scope));
  const chunks = Math.ceil(leads.length / CHUNK);
  for (let i = 0; i < chunks; i++) await setJson(chunkKey(scope, i), leads.slice(i * CHUNK, (i + 1) * CHUNK));
  for (let i = chunks; i < (old?.chunks ?? 0); i++) await removeJson(chunkKey(scope, i));
  const meta: Meta = { updatedAt: Date.now(), chunks, count: leads.length, sources };
  await setJson(metaKey(scope), meta);
  const sorted = [...leads].sort(byNewest);
  resetDerived();
  cache = { scope, leads: sorted, meta };
}

/** True once at least one full copy has been saved on this phone. */
export async function hasLocalLeads(): Promise<boolean> {
  return (await load()) !== null;
}

export async function getLocalSources(): Promise<LeadSource[]> {
  return (await load())?.meta.sources ?? [];
}

export async function localUpdatedAt(): Promise<number | null> {
  return (await load())?.meta.updatedAt ?? null;
}

/** Downloads every lead (all lists) and stores it. Resolves with how many were saved. */
export function refreshLeadStore(): Promise<number> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const scope = scopedKey("leads");
    if (!scope) return 0;
    const all: Lead[] = [];
    for (let page = 1; ; page++) {
      const { data } = await apiClient.get<LeadPage>("/leads", {
        params: { page, limit: PAGE_LIMIT, status: "all" },
        _noCache: true,
      } as object);
      all.push(...data.leads);
      if (page >= data.totalPages) break;
    }
    const { data: src } = await apiClient.get<{ sources: LeadSource[] }>("/leads/sources/list", { _noCache: true } as object);
    // Edits still waiting to reach the server would be undone by this download; try again after they sync.
    if ((await getHttpQueueCount()) > 0) return all.length;
    await serial(() => persist(scope, all, src.sources));
    return all.length;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** True when the saved copy is newer than `maxAgeMs`, so the screen can skip the server entirely. */
export async function isLocalFresh(maxAgeMs: number): Promise<boolean> {
  const at = await localUpdatedAt();
  return !!at && Date.now() - at < maxAgeMs && (await getHttpQueueCount()) === 0;
}

/** Refreshes only when the saved copy is older than `maxAgeMs` (or missing). Never throws. */
export async function refreshLeadStoreIfStale(maxAgeMs: number): Promise<void> {
  try {
    if ((await getHttpQueueCount()) > 0) return;
    const at = await localUpdatedAt();
    if (at && Date.now() - at < maxAgeMs) return;
    await refreshLeadStore();
  } catch {
    // Offline or server down: the existing copy stays in use.
  }
}

/** Same filtering, searching and paging the server does, over the copy on the phone. */
export async function queryLocalLeads(opts: {
  page: number;
  limit: number;
  status: string;
  search?: string;
  sourceId?: string;
  /** Sheet name stored on each lead ("Meta Sheet"); "all" or empty for every sheet. */
  origin?: string;
}): Promise<LeadPage | null> {
  const store = await load();
  if (!store) return null;
  const { leads } = store;

  const sourceId = opts.sourceId && opts.sourceId !== "all" ? opts.sourceId : "";
  const origin = opts.origin && opts.origin !== "all" ? opts.origin : "";
  const q = (opts.search ?? "").trim().toLowerCase();
  const memoKey = `${sourceId}|${origin}|${q}`;
  let memo = countMemo.get(memoKey);
  if (!memo) {
    // `leads` is already newest first, so filtering keeps the order and nothing needs sorting here.
    const digits = q.replace(/\D/g, "");
    const base = leads.filter(
      (l) =>
        !l.archived &&
        (!sourceId || (l as Lead & { sourceIds?: string[] }).sourceIds?.includes(sourceId)) &&
        (!origin || l.origin === origin) &&
        (!q || hayFor(l).includes(q) || (digits.length >= 3 && (l.phone ?? "").replace(/\D/g, "").includes(digits)))
    );
    const counts = new Map<string, number>();
    for (const l of base) {
      const key = NEW_STATUS.test(l.status ?? "") ? "New" : String(l.status).trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    memo = {
      base,
      totalAll: base.length,
      stageCounts: [...counts.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
    };
    countMemo.set(memoKey, memo);
  }

  const status = opts.status;
  const filtered =
    !status || status.toLowerCase() === "all"
      ? memo.base
      : memo.base.filter((l) => (NEW_STATUS.test(status) ? NEW_STATUS.test(l.status ?? "") : l.status === status));
  const totalPages = Math.max(1, Math.ceil(filtered.length / opts.limit));
  const page = Math.min(Math.max(1, opts.page), totalPages);
  return {
    leads: filtered.slice((page - 1) * opts.limit, page * opts.limit),
    page,
    limit: opts.limit,
    total: filtered.length,
    totalPages,
    totalAll: memo.totalAll,
    stageCounts: memo.stageCounts,
  };
}

/** The sheet filter's options from the copy on the phone (used when the server can't be reached). */
export async function getLocalOrigins(): Promise<{ name: string; count: number }[]> {
  const store = await load();
  if (!store) return [];
  const counts = new Map<string, number>();
  for (const l of store.leads) if (!l.archived && l.origin) counts.set(l.origin, (counts.get(l.origin) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Applies an edit to the saved copy right away (used for online saves and for edits queued offline). */
export async function applyLocalEdit(id: string, patch: Partial<Lead>): Promise<void> {
  await serial(async () => {
    const store = await load();
    if (!store) return;
    const now = new Date().toISOString();
    const extra: Partial<Lead> = {};
    if ("status" in patch) {
      extra.statusUpdatedAt = now;
      extra.notInterestedAt = patch.status && /not\s*int[e]?rest/i.test(patch.status) ? now : null;
    }
    if (patch.phone) {
      const digits = patch.phone.replace(/\D/g, "").slice(-10);
      patch = { ...patch, phone: `+91${digits}` };
    }
    const leads = store.leads.map((l) => (l.id === id ? { ...l, ...extra, ...patch, updatedAt: now } : l));
    await persist(store.scope, leads, store.meta.sources);
  });
}

export async function removeLocalLead(id: string): Promise<void> {
  await serial(async () => {
    const store = await load();
    if (!store) return;
    await persist(store.scope, store.leads.filter((l) => l.id !== id), store.meta.sources);
  });
}

/** Forgets the saved copy (sign-out / clear local data). */
export function resetLeadStoreMemory(): void {
  cache = null;
}
