import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { hasFederalSignature, isAllowedSender } from "./senderAllowList";
import type { SmsMessage } from "./smsReader";
import { parseUpiSms } from "./upiSmsParser";

/**
 * Local message log (owner's explicit decision): every SMS from an allowed sender is written, verbatim, as
 * JSON to a private file on THIS phone (app documentDirectory). It is never put in the database, never sent
 * to the server and only leaves the phone when the owner taps "Export log" on the UPI screen.
 *
 * Internally JSON-lines (one JSON object per line); the export wraps it into a single valid JSON array.
 * `category` is reserved (null): an auto-categorisation rule engine will be built later from the export.
 *
 * Logging must never break syncing: every function that the sync calls swallows its own errors.
 */
export type SmsLogSource = "inbox" | "live" | "queue";

export interface SmsLogParsed {
  type: "IN" | "OUT";
  amount: number;
  merchant: string;
  ref: string;
  accountLast4: string;
  date: string;
  time: string;
}

export interface SmsLogEntry {
  id: string;
  address: string;
  body: string;
  /** Epoch ms exactly as the phone gave it. */
  date: number;
  source: SmsLogSource;
  loggedAt: number;
  /** What the on-device regex parser read; null when it isn't a (recognised) transaction. */
  parsed: SmsLogParsed | null;
  /** Reserved for the future categorisation rule engine. Always null for now. */
  category: null;
}

export const SMS_LOG_FILENAME = "upi-sms-log.jsonl";
const logUri = () => `${FileSystem.documentDirectory ?? ""}${SMS_LOG_FILENAME}`;

/** Identity of one SMS regardless of which path (inbox / live / queue) read it. */
const identity = (m: Pick<SmsMessage, "address" | "body" | "date">) => `${m.date}|${m.address}|${m.body}`;

let keys: Set<string> | null = null;
let lock: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = lock.then(job, job);
  lock = next.catch(() => undefined);
  return next;
}

async function readRaw(): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(logUri());
    if (!info.exists) return "";
    return await FileSystem.readAsStringAsync(logUri());
  } catch {
    return "";
  }
}

function parseLines(raw: string): SmsLogEntry[] {
  const out: SmsLogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as SmsLogEntry);
    } catch {
      // a torn line from an interrupted write: skip it
    }
  }
  return out;
}

function loadKeys(raw: string): Set<string> {
  if (!keys) keys = new Set(parseLines(raw).map(identity));
  return keys;
}

/** Whether this message may be logged (same gate as the sync: allowed sender, or the bank's signature). */
export function isLoggable(m: Pick<SmsMessage, "address" | "body">): boolean {
  return isAllowedSender(m.address) || hasFederalSignature(m.body);
}

function toEntry(m: SmsMessage, source: SmsLogSource, loggedAt: number): SmsLogEntry {
  let parsed: SmsLogParsed | null = null;
  try {
    const p = parseUpiSms(m.body, m.date);
    if (p) parsed = { type: p.type, amount: p.amount, merchant: p.merchant, ref: p.ref, accountLast4: p.accountLast4, date: p.date, time: p.time };
  } catch {
    parsed = null;
  }
  return { id: m.id, address: m.address, body: m.body, date: m.date, source, loggedAt, parsed, category: null };
}

/** Appends the not-yet-logged allowed-sender messages of a batch with ONE file write. Never throws. */
export function logSmsBatch(messages: SmsMessage[], source: SmsLogSource): Promise<void> {
  const fresh = messages.filter(isLoggable);
  if (!fresh.length) return Promise.resolve();
  return serial(async () => {
    try {
      const raw = await readRaw();
      const known = loadKeys(raw);
      const now = Date.now();
      const lines: string[] = [];
      const added = new Set<string>();
      for (const m of fresh) {
        const k = identity(m);
        if (known.has(k) || added.has(k)) continue;
        added.add(k);
        lines.push(JSON.stringify(toEntry(m, source, now)));
      }
      if (!lines.length) return;
      const base = raw && !raw.endsWith("\n") ? `${raw}\n` : raw;
      await FileSystem.writeAsStringAsync(logUri(), `${base}${lines.join("\n")}\n`);
      added.forEach((k) => known.add(k));
    } catch {
      keys = null; // re-derive from the file next time
    }
  });
}

export function readSmsLog(): Promise<SmsLogEntry[]> {
  return serial(async () => parseLines(await readRaw()));
}

export function getSmsLogStats(): Promise<{ count: number; bytes: number }> {
  return serial(async () => {
    try {
      const info = await FileSystem.getInfoAsync(logUri());
      if (!info.exists) return { count: 0, bytes: 0 };
      const raw = await FileSystem.readAsStringAsync(logUri());
      return { count: loadKeys(raw).size, bytes: typeof info.size === "number" ? info.size : raw.length };
    } catch {
      return { count: 0, bytes: 0 };
    }
  });
}

export async function clearSmsLog(): Promise<void> {
  await serial(async () => {
    keys = null;
    try {
      await FileSystem.deleteAsync(logUri(), { idempotent: true });
    } catch {
      // nothing to delete
    }
  });
}

/** The log as one valid JSON array. */
export function smsLogToJson(entries: SmsLogEntry[]): string {
  return `[\n${entries.map((e) => JSON.stringify(e)).join(",\n")}\n]`;
}

/** Writes a dated copy to the cache and opens the share sheet. Returns the file uri, or null when there is nothing to export. */
export async function exportSmsLog(): Promise<string | null> {
  const entries = await readSmsLog();
  if (!entries.length) return null;
  const day = new Date().toISOString().slice(0, 10);
  const uri = `${FileSystem.cacheDirectory ?? ""}upi-sms-log-${day}.json`;
  await FileSystem.writeAsStringAsync(uri, smsLogToJson(entries));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Export UPI message log" });
  }
  return uri;
}

/** Test hook: forget the in-memory index. */
export function resetSmsLogCache(): void {
  keys = null;
}
