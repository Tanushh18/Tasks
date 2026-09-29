import axios from "axios";
import * as Crypto from "expo-crypto";
import { markCacheStale, patchCachedResponses } from "./httpCache";
import { scopedKey } from "./scope";
import { getJson, setJson } from "./storage";

/**
 * Offline queue for plain create / update / delete of top-level records (notes, contacts, leads…).
 *
 * The axios client hands a write here when the server can't be reached. It is stored on the phone,
 * shown immediately in the cached lists, and replayed in order once the connection is back. Tasks
 * and money transactions keep their own dedicated queue (offlineQueue.ts) and are excluded here.
 *
 * Only `/resource` (create) and `/resource/:id` (update, delete) are queued. Anything nested
 * (`/shopping-lists/:id/items`, `/contacts/bulk`, votes, chat…) needs the server to answer and keeps
 * failing with the normal "you're offline" message.
 */

export interface HttpQueueItem {
  /** Also sent as the Idempotency-Key, so a replay after a timeout can't create a duplicate. */
  id: string;
  method: "post" | "put" | "patch" | "delete";
  url: string;
  data?: Record<string, unknown>;
  /** Temporary id shown in the UI for a record created offline. */
  localId?: string;
  createdAt: string;
}

interface FailedHttpItem {
  item: HttpQueueItem;
  reason: string;
  failedAt: string;
}

const QUEUE_BASE = "dt_http_queue";
const FAILED_BASE = "dt_http_queue_failed";
const LOCAL_ID_PREFIX = "local-";

const QUEUEABLE_RESOURCES = new Set([
  "notes",
  "contacts",
  "family-events",
  "family-goals",
  "inventory-items",
  "vault-documents",
  "vehicles",
  "recurring-payments",
  "shopping-lists",
  "leads",
]);

/** Path segments that look like an id but are really sub-routes handled by the server. */
const RESERVED_SEGMENTS = new Set(["sync", "bulk", "sources", "meta", "me", "list"]);

const listeners = new Set<() => void>();
let chain: Promise<unknown> = Promise.resolve();
let flushing = false;

/** Lets the sync indicator refresh its pending count when this queue changes. */
export function onHttpQueueChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  listeners.forEach((cb) => cb());
}

/** True when the failure means "couldn't reach the server", not "the server said no". */
export function isUnreachableError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return err.code !== "ERR_CANCELED";
  return [502, 503, 504].includes(err.response.status);
}

function locked<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}

async function readQueue(): Promise<HttpQueueItem[]> {
  const key = scopedKey(QUEUE_BASE);
  return key ? ((await getJson<HttpQueueItem[]>(key)) ?? []) : [];
}

async function writeQueue(queue: HttpQueueItem[]): Promise<void> {
  const key = scopedKey(QUEUE_BASE);
  if (key) await setJson(key, queue);
}

/** Loads the queue, lets `change` edit it in place, saves it, and returns whatever `change` returns. */
function mutateQueue<T>(change: (queue: HttpQueueItem[]) => T | Promise<T>): Promise<T> {
  return locked(async () => {
    const queue = await readQueue();
    const result = await change(queue);
    await writeQueue(queue);
    return result;
  });
}

export async function getHttpQueueCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function getHttpFailedCount(): Promise<number> {
  const key = scopedKey(FAILED_BASE);
  return key ? ((await getJson<FailedHttpItem[]>(key)) ?? []).length : 0;
}

interface Target {
  collectionUrl: string;
  id?: string;
}

function parseTarget(method: string, rawUrl: string): Target | null {
  const path = rawUrl.split("?")[0];
  const match = /^\/([a-z-]+)(?:\/([^/]+))?$/.exec(path);
  if (!match) return null;
  const [, resource, id] = match;
  if (!QUEUEABLE_RESOURCES.has(resource)) return null;
  if (method === "post") return id ? null : { collectionUrl: `/${resource}` };
  if (!id || RESERVED_SEGMENTS.has(id)) return null;
  return { collectionUrl: `/${resource}`, id };
}

export function isQueueableWrite(method: string, url: string | undefined): boolean {
  return Boolean(url) && parseTarget(method.toLowerCase(), url as string) !== null;
}

type Json = Record<string, unknown>;

/** Runs `change` on the array inside a cached list response (`{ notes: [...] }` or a bare array). */
function changeList(data: unknown, change: (items: Json[]) => Json[]): unknown {
  if (Array.isArray(data)) return change(data as Json[]);
  if (data && typeof data === "object") {
    const copy: Json = { ...(data as Json) };
    const key = Object.keys(copy).find((k) => Array.isArray(copy[k]));
    if (key) copy[key] = change(copy[key] as Json[]);
    return copy;
  }
  return data;
}

/** Runs `change` on the record inside a cached detail response (`{ note: {...} }`). */
function changeRecord(data: unknown, change: (record: Json) => Json): unknown {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const copy: Json = { ...(data as Json) };
    const key = Object.keys(copy).find((k) => copy[k] && typeof copy[k] === "object" && !Array.isArray(copy[k]));
    if (key) copy[key] = change(copy[key] as Json);
    return copy;
  }
  return data;
}

/**
 * What a screen sees after a write was queued: any property it reads (`data.note`, `data.lead`,
 * `data.list`…) resolves to the record, so the calling code carries on as if the server had replied.
 */
function asServerReply(record: Json): unknown {
  return new Proxy({}, { get: (_target, prop) => (prop === "then" || typeof prop === "symbol" ? undefined : record) });
}

function parseBody(data: unknown): Json {
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return parsed && typeof parsed === "object" ? (parsed as Json) : {};
    } catch {
      return {};
    }
  }
  return data && typeof data === "object" ? (data as Json) : {};
}

/**
 * Stores a write that couldn't reach the server. Resolves with the reply to hand back to the
 * caller, or null when this kind of write can't be queued (the original error then propagates).
 */
export async function queueWrite(input: {
  method: string;
  url: string;
  data?: unknown;
  idempotencyKey?: string;
}): Promise<{ data: unknown } | null> {
  const method = input.method.toLowerCase() as HttpQueueItem["method"];
  const target = parseTarget(method, input.url);
  if (!target || !scopedKey(QUEUE_BASE)) return null;

  const body = parseBody(input.data);
  const now = new Date().toISOString();
  const { collectionUrl, id } = target;
  const detailUrl = id ? `${collectionUrl}/${id}` : null;

  const reply = await mutateQueue(async (queue): Promise<{ data: unknown } | null> => {
    if (method === "post") {
      const localId = `${LOCAL_ID_PREFIX}${Crypto.randomUUID()}`;
      const record: Json = { ...body, id: localId, createdAt: now, updatedAt: now };
      queue.push({
        id: input.idempotencyKey ?? Crypto.randomUUID(),
        method,
        url: collectionUrl,
        data: body,
        localId,
        createdAt: now,
      });
      await patchCachedResponses(collectionUrl, (d) => changeList(d, (items) => [record, ...items]));
      return { data: asServerReply(record) };
    }

    if (method === "delete") {
      if (id!.startsWith(LOCAL_ID_PREFIX)) {
        // Created and deleted while offline: the server never needs to hear about either.
        const remaining = queue.filter((i) => i.localId !== id && i.url !== detailUrl);
        queue.splice(0, queue.length, ...remaining);
      } else {
        const remaining = queue.filter((i) => i.url !== detailUrl);
        queue.splice(0, queue.length, ...remaining, {
          id: input.idempotencyKey ?? Crypto.randomUUID(),
          method,
          url: detailUrl!,
          createdAt: now,
        });
      }
      await patchCachedResponses(collectionUrl, (d) => changeList(d, (items) => items.filter((r) => r.id !== id)));
      return { data: {} };
    }

    // put / patch
    if (id!.startsWith(LOCAL_ID_PREFIX)) {
      const pending = queue.find((i) => i.localId === id);
      if (!pending) return null; // orphaned temp id — nothing to attach the edit to
      pending.data = { ...pending.data, ...body };
    } else {
      const pending = queue.find((i) => i.url === detailUrl && (i.method === "put" || i.method === "patch"));
      if (pending) {
        pending.data = method === "put" ? body : { ...pending.data, ...body };
        if (method === "put") pending.method = "put";
      } else {
        queue.push({ id: input.idempotencyKey ?? Crypto.randomUUID(), method, url: detailUrl!, data: body, createdAt: now });
      }
    }
    const edit = (record: Json): Json => ({ ...record, ...body, id, updatedAt: now });
    await patchCachedResponses(collectionUrl, (d) =>
      changeList(d, (items) => items.map((r) => (r.id === id ? edit(r) : r)))
    );
    await patchCachedResponses(detailUrl!, (d) => changeRecord(d, edit));
    return { data: asServerReply({ ...body, id, updatedAt: now }) };
  });

  if (reply) notify();
  return reply;
}

async function recordFailure(item: HttpQueueItem, err: unknown): Promise<void> {
  const key = scopedKey(FAILED_BASE);
  if (!key) return;
  const failed = (await getJson<FailedHttpItem[]>(key)) ?? [];
  const reason = axios.isAxiosError(err) ? `Server said ${err.response?.status ?? "no"}` : "Rejected";
  failed.push({ item, reason, failedAt: new Date().toISOString() });
  await setJson(key, failed);
}

/**
 * Replays queued writes oldest-first. Stops at the first unreachable-server failure (still
 * offline); a write the server actively rejects is moved to the failed list so it can't block
 * the ones behind it.
 */
export async function flushHttpQueue(
  send: (item: HttpQueueItem) => Promise<void>
): Promise<{ synced: number; failed: number; stillOffline: boolean }> {
  if (flushing || !scopedKey(QUEUE_BASE)) return { synced: 0, failed: 0, stillOffline: false };
  flushing = true;
  let synced = 0;
  let failed = 0;
  let stillOffline = false;

  try {
    for (;;) {
      const [item] = await locked(readQueue);
      if (!item) break;

      try {
        await send(item);
        synced += 1;
      } catch (err) {
        if (isUnreachableError(err)) {
          stillOffline = true;
          break;
        }
        failed += 1;
        await recordFailure(item, err);
      }
      await mutateQueue((queue) => {
        const remaining = queue.filter((i) => i.id !== item.id);
        queue.splice(0, queue.length, ...remaining);
      });
      notify();
    }
    if (synced > 0) await markCacheStale();
  } finally {
    flushing = false;
    notify();
  }
  return { synced, failed, stillOffline };
}
