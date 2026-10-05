import axios from "axios";
import type { FinanceAccount } from "../types/models";
import * as financeApi from "../api/finance";
import { getJson, setJson } from "../offline/storage";
import { hasFederalSignature, isAllowedSender } from "./senderAllowList";
import { hasSmsPermission, onSmsReceived, peekQueuedSms, readInbox, removeQueuedSms, smsReaderAvailable, type SmsMessage } from "./smsReader";
import { SERVICE_SLICE_MS, startImportService, type ImportServiceHandle } from "./upiImportService";
import { logSmsBatch, type SmsLogSource } from "./upiSmsLog";
import { fromExtracted, hash32, looksLikeTransaction, parseUpiSms, type ParsedUpiSms } from "./upiSmsParser";

/**
 * Automatic expense tracking from bank UPI SMS (admin only, per device).
 *
 * Privacy: the SMS text is never stored in the database, in the local history or in transaction notes; only
 * the extracted fields are saved to Money. By the owner's decision every allowed-sender message IS written,
 * verbatim, to a local JSON file on the phone (upiSmsLog.ts) before it is parsed/saved; that file is never
 * uploaded and only leaves the phone via the screen's Export button. The only time text leaves the phone is
 * the AI fallback (body only, see below). The native retry queue deletes a message as soon as it is processed.
 *
 * Old-message import is resumable: progress (cursor, counts) is persisted after every batch in
 * settings.backfill, so an interrupted import (app backgrounded/killed) continues where it stopped.
 *
 * Idempotent everywhere: each transaction carries idempotencyKey `upi-<ref>` so re-scans, retries and
 * the headless + foreground paths can never create duplicates.
 */

/** How far back the first scan / "Import old messages" looks. Default: the whole inbox. */
export type BackfillRange = "3m" | "1y" | "all";
export const DEFAULT_BACKFILL_RANGE: BackfillRange = "all";
export const BACKFILL_LABELS: Record<BackfillRange, string> = { "3m": "Last 3 months", "1y": "Last year", all: "Everything" };
const DAY_MS = 24 * 60 * 60 * 1000;

export function rangeStartMs(range: BackfillRange, now = Date.now()): number {
  if (range === "3m") return now - 92 * DAY_MS;
  if (range === "1y") return now - 366 * DAY_MS;
  return 0;
}

/** Messages read from the inbox per batch (oldest first). */
export const INBOX_BATCH = 200;
/** Transactions sent to the server per request. */
export const SAVE_CHUNK = 50;
/** AI fallback limits: per normal run, per backlog import (bigger but bounded) and per day (normal runs). */
export const AI_MAX_PER_RUN = 5;
export const AI_MAX_PER_RUN_BACKFILL = 40;
export const AI_MAX_PER_DAY = 30;
const AI_CACHE_LIMIT = 300;
const HISTORY_LIMIT = 20;
export const UPI_CATEGORY = "UPI";
const NOTE_TAG = "Auto-added from SMS";

const SETTINGS_KEY = "upi.expense.settings";
const HISTORY_KEY = "upi.expense.history";
const ACCOUNTS_KEY = "upi.expense.accounts";
const AI_KEY = "upi.expense.ai";

/** An old-message import in progress. Persisted after every batch so it can resume after an interruption. */
export interface BackfillState {
  active: boolean;
  range: BackfillRange;
  /** Date of the newest message handled so far; the next read overlaps it by 1 ms (idempotent). */
  cursorMs: number;
  /** Inbox ids of the messages at cursorMs already handled (avoids re-processing the overlap). */
  cursorIds?: string[];
  scanned: number;
  saved: number;
  startedAt: number;
  /** Earliest date of a message that still needs a retry (blocked by the AI cap / offline). */
  blockedAt?: number;
}

export interface UpiSettings {
  enabled: boolean;
  /** Signed-in admin who turned it on (namespaces the cached accounts). */
  userId?: string;
  range: BackfillRange;
  lastScanMs?: number;
  /** Ids of the messages at lastScanMs already handled. */
  lastScanIds?: string[];
  backfill?: BackfillState;
  lastRunAt?: number;
  totalSaved: number;
}

export interface HistoryItem {
  key: string;
  at: number;
  type: "IN" | "OUT";
  amount: number;
  merchant: string;
  ref: string;
  date: string;
  status: "saved" | "failed";
  reason?: string;
}

export interface SyncProgress {
  scanned: number;
  saved: number;
}

export interface SyncSummary {
  scanned: number;
  saved: number;
  duplicates: number;
  failed: number;
  /** True when the run stopped early (e.g. offline); the next run continues. */
  incomplete: boolean;
  /** True when an old-message import is still unfinished (time ran out / paused); the next run continues it. */
  backfillActive: boolean;
}

const DEFAULT_SETTINGS: UpiSettings = { enabled: false, range: DEFAULT_BACKFILL_RANGE, totalSaved: 0 };

export async function getUpiSettings(): Promise<UpiSettings> {
  try {
    return { ...DEFAULT_SETTINGS, ...((await getJson<Partial<UpiSettings>>(SETTINGS_KEY)) ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const settingsListeners = new Set<(s: UpiSettings) => void>();

/** Lets the app-level hook react when the toggle changes on the screen. */
export function onUpiSettingsChanged(cb: (s: UpiSettings) => void): () => void {
  settingsListeners.add(cb);
  return () => settingsListeners.delete(cb);
}

export async function updateUpiSettings(patch: Partial<UpiSettings>): Promise<UpiSettings> {
  const next = { ...(await getUpiSettings()), ...patch };
  await setJson(SETTINGS_KEY, next).catch(() => undefined);
  settingsListeners.forEach((cb) => cb(next));
  return next;
}

export async function getUpiHistory(): Promise<HistoryItem[]> {
  try {
    return (await getJson<HistoryItem[]>(HISTORY_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function addHistory(items: HistoryItem[]): Promise<void> {
  if (!items.length) return;
  const keys = new Set(items.map((i) => i.key));
  const rest = (await getUpiHistory()).filter((h) => !keys.has(h.key));
  await setJson(HISTORY_KEY, [...items.slice().reverse(), ...rest].slice(0, HISTORY_LIMIT)).catch(() => undefined);
}

/** Turns tracking on or off. Turning on returns the settings; the caller then runs a first scan. */
export async function setUpiTrackingEnabled(enabled: boolean, userId?: string): Promise<UpiSettings> {
  return updateUpiSettings(enabled ? { enabled, ...(userId ? { userId } : {}) } : { enabled });
}

// ---------------------------------------------------------------------------------------------
// Account handling

interface AccountCache {
  [name: string]: string;
}

async function loadAccounts(): Promise<AccountCache> {
  return (await getJson<AccountCache>(ACCOUNTS_KEY).catch(() => null)) ?? {};
}

export function upiAccountName(p: Pick<ParsedUpiSms, "bank" | "accountLast4">): string {
  const bank = p.bank?.trim() || "Bank";
  return p.accountLast4 ? `${bank} X${p.accountLast4} (UPI)` : `${bank} (UPI)`;
}

interface RunContext {
  userId: string;
  accounts: AccountCache;
  remote: FinanceAccount[] | null;
  pendingCreates: Map<string, Promise<string>>;
}

async function resolveAccountId(ctx: RunContext, p: ParsedUpiSms): Promise<string> {
  const name = upiAccountName(p);
  const cacheKey = `${ctx.userId}|${name}`;
  if (ctx.accounts[cacheKey]) return ctx.accounts[cacheKey];
  const inFlight = ctx.pendingCreates.get(cacheKey);
  if (inFlight) return inFlight;
  const task = (async () => {
    if (!ctx.remote) ctx.remote = await financeApi.listAccounts(true);
    let found = ctx.remote.find((a) => a.name === name && !a.archived) ?? ctx.remote.find((a) => a.name === name);
    if (!found) {
      found = await financeApi.createAccount({ name, type: "personal", description: "Created automatically for UPI SMS tracking" });
      ctx.remote.push(found);
    }
    ctx.accounts[cacheKey] = found.id;
    await setJson(ACCOUNTS_KEY, ctx.accounts).catch(() => undefined);
    return found.id;
  })();
  ctx.pendingCreates.set(cacheKey, task);
  try {
    return await task;
  } finally {
    ctx.pendingCreates.delete(cacheKey);
  }
}

function forgetAccount(ctx: RunContext, p: ParsedUpiSms): void {
  delete ctx.accounts[`${ctx.userId}|${upiAccountName(p)}`];
  ctx.remote = null;
  void setJson(ACCOUNTS_KEY, ctx.accounts).catch(() => undefined);
}

export function toTransactionInput(p: ParsedUpiSms, accountId: string): financeApi.TransactionInput {
  return {
    accountId,
    type: p.type,
    amount: p.amount,
    category: UPI_CATEGORY,
    description: `UPI ${p.type === "OUT" ? "to" : "from"} ${p.merchant}`.slice(0, 300),
    date: p.date,
    time: p.time,
    // Deliberately no SMS text: a short tag and the reference number only.
    notes: p.ref ? `${NOTE_TAG} • Ref ${p.ref}` : NOTE_TAG,
    idempotencyKey: p.key,
  };
}

// ---------------------------------------------------------------------------------------------
// AI fallback bookkeeping (no message text is kept, only a hash and what the AI extracted)

interface AiState {
  day: string;
  count: number;
  seen: Record<string, ParsedUpiSms | null>;
  order: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

async function loadAi(): Promise<AiState> {
  const s = await getJson<AiState>(AI_KEY).catch(() => null);
  if (!s || s.day !== today()) return { day: today(), count: 0, seen: s?.seen ?? {}, order: s?.order ?? [] };
  return s;
}

const messageHash = (m: Pick<SmsMessage, "address" | "body" | "date">) => hash32(`${m.address}|${m.date}|${m.body}`);

// ---------------------------------------------------------------------------------------------
// Core: turn messages into transactions

type Outcome = "done" | "blocked";

interface RunOptions {
  /** Backlog import: bigger (still bounded) AI cap and no daily cap. */
  backfill: boolean;
}

interface Candidate {
  msg: SmsMessage;
  parsed: ParsedUpiSms;
}

function isTransientError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return true;
  const status = err.response?.status;
  if (!status) return true;
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

/** Whether this message may be looked at at all (sender allow-list, or the bank's signature + regex parse). */
function classify(msg: SmsMessage): { parsed: ParsedUpiSms | null; aiAllowed: boolean } {
  const allowed = isAllowedSender(msg.address);
  if (!allowed && !hasFederalSignature(msg.body)) return { parsed: null, aiAllowed: false };
  const parsed = parseUpiSms(msg.body, msg.date);
  // An unlisted sender is only trusted when the signature matched AND the regex parser reads it; never the AI.
  if (!allowed) return { parsed, aiAllowed: false };
  return { parsed, aiAllowed: !parsed && looksLikeTransaction(msg.body, msg.address) };
}

interface BatchResult {
  /** Message ids (inbox ids / native queue ids) that are finished and can be forgotten. */
  doneIds: string[];
  /** Earliest date of a message that still needs a retry. */
  blockedAt: number | null;
  saved: number;
  duplicates: number;
  failed: number;
  aborted: boolean;
}

interface RunState {
  ctx: RunContext;
  ai: AiState;
  aiUsed: number;
  aiDisabled: boolean;
  options: RunOptions;
}

async function resolveWithAi(state: RunState, msg: SmsMessage): Promise<{ parsed: ParsedUpiSms | null; outcome: Outcome }> {
  const h = messageHash(msg);
  if (h in state.ai.seen) return { parsed: state.ai.seen[h], outcome: "done" };
  if (state.aiDisabled) return { parsed: null, outcome: "done" };
  const runCap = state.options.backfill ? AI_MAX_PER_RUN_BACKFILL : AI_MAX_PER_RUN;
  if (state.aiUsed >= runCap || (!state.options.backfill && state.ai.count >= AI_MAX_PER_DAY)) {
    return { parsed: null, outcome: "blocked" }; // try again on a later run / tomorrow
  }
  state.aiUsed += 1;
  state.ai.count += 1;
  try {
    const extracted = await financeApi.parseSmsWithAi(msg.body);
    const parsed = extracted ? fromExtracted(extracted, msg.date) : null;
    state.ai.seen[h] = parsed;
    state.ai.order.push(h);
    while (state.ai.order.length > AI_CACHE_LIMIT) delete state.ai.seen[state.ai.order.shift() as string];
    return { parsed, outcome: "done" };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 503) {
      state.aiDisabled = true; // AI isn't configured on the server: stop asking this run
      return { parsed: null, outcome: "done" };
    }
    return { parsed: null, outcome: isTransientError(err) ? "blocked" : "done" };
  }
}

async function saveCandidates(state: RunState, items: Candidate[], result: BatchResult): Promise<void> {
  const history: HistoryItem[] = [];
  for (let i = 0; i < items.length && !result.aborted; i += SAVE_CHUNK) {
    const chunk = items.slice(i, i + SAVE_CHUNK);
    let inputs: financeApi.TransactionInput[];
    const usable: Candidate[] = [];
    try {
      inputs = [];
      for (const c of chunk) {
        inputs.push(toTransactionInput(c.parsed, await resolveAccountId(state.ctx, c.parsed)));
        usable.push(c);
      }
      const rows = await financeApi.createTransactionsBulk(inputs);
      rows.forEach((row, idx) => {
        const c = usable[row.index ?? idx];
        if (!c) return;
        const p = c.parsed;
        const base = { key: p.key, at: Date.now(), type: p.type, amount: p.amount, merchant: p.merchant, ref: p.ref, date: p.date };
        if (row.status === "created") {
          result.saved += 1;
          result.doneIds.push(c.msg.id);
          history.push({ ...base, status: "saved" });
        } else if (row.status === "duplicate") {
          result.duplicates += 1;
          result.doneIds.push(c.msg.id);
        } else if (row.permanent && !/account/i.test(row.error ?? "")) {
          result.failed += 1;
          result.doneIds.push(c.msg.id);
          history.push({ ...base, status: "failed", reason: row.error ?? "Rejected" });
        } else {
          if (row.permanent) forgetAccount(state.ctx, p); // the cached account is gone: recreate next run
          result.failed += 1;
          result.blockedAt = Math.min(result.blockedAt ?? Infinity, c.msg.date);
        }
      });
    } catch (err) {
      result.failed += chunk.length;
      if (isTransientError(err)) {
        // Couldn't reach the server (or sign-in expired): leave everything for the next run and stop.
        result.aborted = true;
        for (const c of chunk) result.blockedAt = Math.min(result.blockedAt ?? Infinity, c.msg.date);
      } else {
        // The server rejected the request itself: retrying can't help, so record it and move on.
        for (const c of chunk) {
          const p = c.parsed;
          result.doneIds.push(c.msg.id);
          history.push({ key: p.key, at: Date.now(), type: p.type, amount: p.amount, merchant: p.merchant, ref: p.ref, date: p.date, status: "failed", reason: "Rejected by the server" });
        }
      }
    }
  }
  await addHistory(history);
}

async function processMessages(state: RunState, messages: SmsMessage[], source: SmsLogSource): Promise<BatchResult> {
  // First thing, before any parsing/saving: write the batch to the local message log (one file write;
  // logSmsBatch never throws, so a logging problem can't affect the sync).
  await logSmsBatch(messages, source);
  const result: BatchResult = { doneIds: [], blockedAt: null, saved: 0, duplicates: 0, failed: 0, aborted: false };
  const candidates: Candidate[] = [];
  const seenKeys = new Set<string>();
  for (const msg of messages) {
    const { parsed: regexParsed, aiAllowed } = classify(msg);
    let parsed = regexParsed;
    if (!parsed && aiAllowed) {
      const ai = await resolveWithAi(state, msg);
      if (ai.outcome === "blocked") {
        result.blockedAt = Math.min(result.blockedAt ?? Infinity, msg.date);
        continue;
      }
      parsed = ai.parsed;
    }
    if (!parsed) {
      result.doneIds.push(msg.id); // not a transaction (or not ours): nothing to do, forget it
      continue;
    }
    if (seenKeys.has(parsed.key)) {
      result.doneIds.push(msg.id);
      continue;
    }
    seenKeys.add(parsed.key);
    candidates.push({ msg, parsed });
  }
  await saveCandidates(state, candidates, result);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Public entry points

let chain: Promise<unknown> = Promise.resolve();
/** Runs one job at a time (foreground sync, live SMS and the headless task never overlap). */
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const next = chain.then(job, job);
  chain = next.catch(() => undefined);
  return next;
}

async function newState(settings: UpiSettings, options: RunOptions): Promise<RunState> {
  return {
    ctx: { userId: settings.userId ?? "", accounts: await loadAccounts(), remote: null, pendingCreates: new Map() },
    ai: await loadAi(),
    aiUsed: 0,
    aiDisabled: false,
    options,
  };
}

async function finishState(state: RunState): Promise<void> {
  await setJson(AI_KEY, state.ai).catch(() => undefined);
}

export function isUpiSyncPossible(): boolean {
  return smsReaderAvailable && hasSmsPermission();
}

export interface SyncOptions {
  /** Start (or, if one with the same range is already active, resume) an old-message import over this range. */
  backfillRange?: BackfillRange;
  /** Progress of the import / scan (cumulative for a resumed import). */
  onProgress?: (p: SyncProgress) => void;
  /** Stop starting new batches after this epoch-ms time (headless runs are short); progress is persisted. */
  deadlineMs?: number;
}

/** Re-reading this many extra messages when the whole batch shares one timestamp (JS-side workaround, see scanInbox). */
const MAX_BATCH_LIMIT = INBOX_BATCH * 25;

interface BatchInfo {
  /** Messages of this batch that were not handled before (overlap removed). */
  fresh: SmsMessage[];
  result: BatchResult;
  /** Date of the last message read, and ids of the read messages carrying exactly that date. */
  last: number;
  idsAtLast: string[];
}

interface ScanOutcome {
  /** The inbox was read to its end. */
  finished: boolean;
  /** Stopped because of a network/read failure (nothing past the last persisted batch was committed). */
  aborted: boolean;
  /** Stopped because the owner cancelled / the deadline passed. */
  stopped: boolean;
}

/**
 * Reads the inbox from `cursor` on, oldest first, in batches. Robust against many messages sharing one
 * timestamp: each read starts 1 ms before the cursor (overlap, relying on idempotency + the ids seen at the
 * cursor), and when a full batch yields nothing new the batch size grows (up to MAX_BATCH_LIMIT) so a
 * timestamp shared by more than INBOX_BATCH messages can still be crossed. A failed read (null) pauses.
 * `onBatch` persists progress and returns false to stop (cancelled).
 */
async function scanInbox(
  state: RunState,
  start: { cursor: number; ids: string[] },
  deadline: number,
  onBatch: (b: BatchInfo) => Promise<boolean>
): Promise<ScanOutcome> {
  let cursor = start.cursor;
  let seen = new Set(start.ids);
  let limit = INBOX_BATCH;
  for (;;) {
    if (Date.now() >= deadline) return { finished: false, aborted: false, stopped: true };
    const used = limit;
    const raw = await readInbox(Math.max(0, cursor - 1), used);
    if (raw === null) return { finished: false, aborted: true, stopped: false };
    const fresh = raw.filter((m) => !(m.date === cursor && seen.has(m.id)));
    if (!raw.length || (!fresh.length && raw.length < used)) return { finished: true, aborted: false, stopped: false };
    if (!fresh.length) {
      // A full batch of messages we already handled (more than `limit` share the cursor's timestamp).
      if (limit < MAX_BATCH_LIMIT) limit = Math.min(limit * 5, MAX_BATCH_LIMIT);
      else cursor += 1; // give up on the rest of that millisecond rather than loop forever
      continue;
    }
    const result = await processMessages(state, fresh, "inbox");
    const last = raw[raw.length - 1].date;
    const idsAtLast = raw.filter((m) => m.date === last).map((m) => m.id);
    if (result.aborted) {
      // Server unreachable: don't move past this batch, the next run redoes it (idempotent).
      await onBatch({ fresh: [], result, last: cursor, idsAtLast: [...seen] });
      return { finished: false, aborted: true, stopped: false };
    }
    if (!(await onBatch({ fresh, result, last, idsAtLast }))) return { finished: false, aborted: false, stopped: true };
    if (last > cursor) limit = INBOX_BATCH;
    cursor = last;
    seen = new Set(idsAtLast);
    if (raw.length < used) return { finished: true, aborted: false, stopped: false };
  }
}

const minDefined = (...v: Array<number | null | undefined>): number | null => {
  const f = v.filter((x): x is number => typeof x === "number");
  return f.length ? Math.min(...f) : null;
};

function newBackfill(range: BackfillRange): BackfillState {
  return { active: true, range, cursorMs: rangeStartMs(range), scanned: 0, saved: 0, startedAt: Date.now() };
}

/** Stops an active old-message import (the loop notices at the next batch). Progress made so far stays saved in Money. */
export async function cancelUpiBackfill(): Promise<void> {
  const s = await getUpiSettings();
  // Without a bookmark the next run would simply start the import again, so set one.
  await updateUpiSettings({ backfill: undefined, ...(s.lastScanMs === undefined ? { lastScanMs: Date.now(), lastScanIds: [] } : {}) });
}

/**
 * Runs the unfinished old-message import in slices, each inside a foreground service (best-effort). Returns
 * whether the import finished, was cancelled, or just paused.
 */
async function runBackfill(
  state: RunState,
  initial: BackfillState,
  opts: SyncOptions,
  summary: SyncSummary
): Promise<"finished" | "paused" | "cancelled"> {
  let bf = initial;
  let cancelled = false;
  const deadline = opts.deadlineMs ?? Infinity;
  for (;;) {
    const svc: ImportServiceHandle | null = await startImportService({ scanned: bf.scanned, saved: bf.saved }).catch(() => null);
    const sliceEnd = svc ? Math.min(deadline, Date.now() + SERVICE_SLICE_MS) : deadline;
    let outcome: ScanOutcome | null = null;
    try {
      outcome = await scanInbox(state, { cursor: bf.cursorMs, ids: bf.cursorIds ?? [] }, sliceEnd, async (b) => {
        const s = await getUpiSettings();
        if (!s.backfill?.active || s.backfill.startedAt !== bf.startedAt) {
          cancelled = true;
          return false;
        }
        bf = {
          ...bf,
          cursorMs: b.last,
          cursorIds: b.idsAtLast,
          scanned: bf.scanned + b.fresh.length,
          saved: bf.saved + b.result.saved,
          ...(minDefined(bf.blockedAt, b.result.blockedAt) !== null ? { blockedAt: minDefined(bf.blockedAt, b.result.blockedAt) as number } : {}),
        };
        summary.scanned += b.fresh.length;
        summary.saved += b.result.saved;
        summary.duplicates += b.result.duplicates;
        summary.failed += b.result.failed;
        await updateUpiSettings({ backfill: bf, lastRunAt: Date.now(), totalSaved: s.totalSaved + b.result.saved });
        svc?.update(bf);
        opts.onProgress?.({ scanned: bf.scanned, saved: bf.saved });
        return true;
      });
    } catch (err) {
      await svc?.stop();
      throw err;
    }
    if (outcome.aborted) summary.incomplete = true;
    if (cancelled) {
      await svc?.stop();
      return "cancelled";
    }
    if (outcome.finished) {
      // Move the incremental bookmark past what the import handled; blocked messages are retried from there.
      const prev = (await getUpiSettings()).lastScanMs;
      let mark = bf.blockedAt !== undefined ? Math.min(prev ?? Infinity, bf.blockedAt - 1) : Math.max(prev ?? 0, bf.cursorMs);
      if (prev === undefined && bf.scanned === 0 && bf.blockedAt === undefined) mark = Date.now();
      await updateUpiSettings({ lastScanMs: mark, lastScanIds: bf.blockedAt === undefined && mark === bf.cursorMs ? bf.cursorIds ?? [] : [], backfill: undefined, lastRunAt: Date.now() });
      await svc?.stop({ saved: bf.saved });
      return "finished";
    }
    await svc?.stop();
    // Slice over but time remains (the service has a ~3 min limit): start another slice.
    if (outcome.aborted || Date.now() >= deadline || !svc) return "paused";
  }
}

/**
 * Reads the Federal Bank messages in the inbox (and any left in the native queue), saves the UPI ones to
 * Money and remembers how far it got. Returns null when tracking is off or SMS can't be read here.
 * An unfinished old-message import (settings.backfill) is resumed first; otherwise the inbox is scanned
 * incrementally from the last bookmark. A run that stops part-way (offline, deadline, app closed) is simply
 * continued by the next one.
 */
export function syncUpiExpenses(opts: SyncOptions = {}): Promise<SyncSummary | null> {
  return exclusive(async () => {
    let settings = await getUpiSettings();
    if (!settings.enabled || !isUpiSyncPossible()) return null;

    let bf: BackfillState | undefined = settings.backfill?.active ? settings.backfill : undefined;
    if (opts.backfillRange !== undefined && !(bf && bf.range === opts.backfillRange)) {
      bf = newBackfill(opts.backfillRange);
      settings = await updateUpiSettings({ backfill: bf });
    } else if (!bf && settings.lastScanMs === undefined) {
      bf = newBackfill(settings.range); // first run: import the old messages too
      settings = await updateUpiSettings({ backfill: bf });
    }

    const state = await newState(settings, { backfill: !!bf });
    const summary: SyncSummary = { scanned: 0, saved: 0, duplicates: 0, failed: 0, incomplete: false, backfillActive: false };

    try {
      // 1. Messages that arrived while the app was closed.
      const queued = peekQueuedSms();
      if (queued.length) {
        const r = await processMessages(state, queued, "queue");
        summary.scanned += queued.length;
        summary.saved += r.saved;
        summary.duplicates += r.duplicates;
        summary.failed += r.failed;
        if (r.aborted) summary.incomplete = true;
        removeQueuedSms(r.doneIds);
        if (r.saved) await updateUpiSettings({ totalSaved: (await getUpiSettings()).totalSaved + r.saved });
        if (r.aborted && bf) {
          summary.backfillActive = true;
          return summary;
        }
      }

      // 2a. An old-message import (new or resumed): runs batch by batch, persisting after each one.
      if (bf) {
        const outcome = await runBackfill(state, bf, opts, summary);
        summary.backfillActive = outcome === "paused";
        return summary;
      }

      // 2b. Normal incremental scan from the bookmark (also persisted after every batch).
      const prev = settings.lastScanMs ?? 0;
      let newest = prev;
      let blockedAt: number | null = null;
      await scanInbox(state, { cursor: prev, ids: settings.lastScanIds ?? [] }, opts.deadlineMs ?? Infinity, async (b) => {
        summary.scanned += b.fresh.length;
        summary.saved += b.result.saved;
        summary.duplicates += b.result.duplicates;
        summary.failed += b.result.failed;
        if (b.result.aborted) summary.incomplete = true;
        blockedAt = minDefined(blockedAt, b.result.blockedAt);
        newest = Math.max(newest, b.last);
        // Only move the bookmark past what was fully handled; anything blocked is retried next time.
        const mark = blockedAt !== null ? Math.min(newest, blockedAt - 1) : newest;
        const s = await getUpiSettings();
        await updateUpiSettings({
          lastScanMs: Math.max(s.lastScanMs ?? 0, mark),
          lastScanIds: blockedAt === null ? b.idsAtLast : [],
          lastRunAt: Date.now(),
          totalSaved: s.totalSaved + b.result.saved,
        });
        opts.onProgress?.({ scanned: summary.scanned, saved: summary.saved });
        return true;
      });
      await updateUpiSettings({ lastRunAt: Date.now() });
      return summary;
    } finally {
      await finishState(state);
    }
  });
}

/** A message that arrived while the app is open (or from the screen's test box): processed immediately. */
export function handleIncomingSms(msg: { address: string; body: string; date: number }): Promise<void> {
  return exclusive(async () => {
    const settings = await getUpiSettings();
    if (!settings.enabled) return;
    const state = await newState(settings, { backfill: false });
    try {
      const r = await processMessages(state, [{ id: `live-${msg.date}`, ...msg }], "live");
      if (r.saved) await updateUpiSettings({ totalSaved: (await getUpiSettings()).totalSaved + r.saved });
    } finally {
      await finishState(state);
    }
  });
}

/** Subscribes to live SMS while the app is open. Returns the unsubscribe function. */
export function startLiveSmsListener(): () => void {
  return onSmsReceived((m) => {
    void handleIncomingSms(m).catch(() => undefined);
  });
}

/**
 * Saves one already-parsed message (the screen's "Test a message" box). Works without the native module.
 * Throws if the server can't be reached.
 */
export async function saveParsedMessage(p: ParsedUpiSms): Promise<"saved" | "duplicate"> {
  return exclusive(async () => {
    const settings = await getUpiSettings();
    const state = await newState(settings, { backfill: false });
    const accountId = await resolveAccountId(state.ctx, p);
    const rows = await financeApi.createTransactionsBulk([toTransactionInput(p, accountId)]);
    const row = rows[0];
    if (!row || row.status === "failed") throw new Error(row?.error ?? "Couldn't save");
    if (row.status === "created") {
      await addHistory([{ key: p.key, at: Date.now(), type: p.type, amount: p.amount, merchant: p.merchant, ref: p.ref, date: p.date, status: "saved" }]);
      await updateUpiSettings({ totalSaved: settings.totalSaved + 1 });
      return "saved";
    }
    return "duplicate";
  });
}

/** The headless task the native receiver starts when an SMS arrives while the app is closed. */
export async function runUpiHeadlessTask(): Promise<void> {
  const { restoreSession } = await import("../auth/sessionStore");
  if (!(await restoreSession())) return; // signed out: nothing to do
  // Short run (Android gives headless tasks ~1 min): process what fits and persist the cursor; the next
  // run (or the app opening) continues an unfinished old-message import.
  await syncUpiExpenses({ deadlineMs: Date.now() + HEADLESS_BUDGET_MS });
}

export const HEADLESS_BUDGET_MS = 45_000;
