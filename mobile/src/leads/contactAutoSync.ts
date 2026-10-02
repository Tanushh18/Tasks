import AsyncStorage from "@react-native-async-storage/async-storage";
// The default "expo-contacts" export throws on every legacy call since SDK 57; this is the working API.
import * as Contacts from "expo-contacts/legacy";
import * as api from "../api/leads";

/** A contact with this word anywhere in its name ("Ramesh lead", "LeadRamesh", "Ramesh #Lead") is a lead. */
export const LEAD_TAG = "lead";

const ENABLED_KEY = "leads.contactAutoSync.enabled";
const SYNCED_KEY = "leads.contactAutoSync.numbers";
const DISMISSED_KEY = "leads.contactAutoSync.dismissed";
const STATUS_KEY = "leads.contactAutoSync.status";
const CHUNK = 500;
const PAGE = 500;
const MIN_GAP_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 4_000];

const TAG_PATTERN = new RegExp(`#?\\b${LEAD_TAG}\\b`, "gi");

export function isLeadTagged(name: string | undefined | null): boolean {
  return !!name && name.toLowerCase().includes(LEAD_TAG);
}

/** Drops a standalone tag (and the brackets/dashes it leaves behind): "Ramesh (#lead)" -> "Ramesh". */
export function cleanLeadName(name: string): string {
  const cleaned = name
    .replace(TAG_PATTERN, " ")
    .replace(/[([{]\s*[)\]}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,:|]+|[\s\-–—,:|]+$/g, "")
    .trim();
  return cleaned || name.trim();
}

/** Last 10 digits: the key used to tell numbers apart regardless of +91 / spaces. */
export const digitsKey = (number: string) => number.replace(/\D/g, "").slice(-10);

export async function isAutoSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
}

export async function setAutoSyncEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
}

async function loadSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
const saveSet = (key: string, set: Set<string>) => AsyncStorage.setItem(key, JSON.stringify([...set]));

export interface AutoSyncStatus {
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  /** Tagged numbers found on the phone that the server hasn't confirmed yet. */
  pending: number;
  lastAdded?: number;
}

export async function getAutoSyncStatus(): Promise<AutoSyncStatus> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    return { pending: 0, ...(raw ? (JSON.parse(raw) as Partial<AutoSyncStatus>) : {}) };
  } catch {
    return { pending: 0 };
  }
}

async function patchStatus(patch: Partial<AutoSyncStatus>): Promise<void> {
  const cur = await getAutoSyncStatus();
  await AsyncStorage.setItem(STATUS_KEY, JSON.stringify({ ...cur, ...patch }));
}

export interface TaggedContact {
  key: string;
  name: string;
  phone: string;
}

function displayName(c: Contacts.Contact): string {
  return (
    c.name?.trim() ||
    [c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.nickname?.trim() ||
    c.company?.trim() ||
    ""
  );
}

/**
 * Reads every phone contact (in pages, so thousands of contacts don't stall the app) and returns
 * one entry per number. Throws if contacts can't be read; returns [] without permission.
 */
export async function readPhoneContacts(filter?: (name: string) => boolean): Promise<(TaggedContact & { rawName: string })[]> {
  const perm = await Contacts.getPermissionsAsync();
  if (perm.status !== "granted") return [];
  const out: (TaggedContact & { rawName: string })[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const res = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.FirstName,
        Contacts.Fields.MiddleName,
        Contacts.Fields.LastName,
        Contacts.Fields.Nickname,
        Contacts.Fields.Company,
      ],
      pageSize: PAGE,
      pageOffset: offset,
    });
    for (const contact of res.data ?? []) {
      const rawName = displayName(contact);
      if (filter && !filter(rawName)) continue;
      for (const p of contact.phoneNumbers ?? []) {
        const number = (p.number ?? p.digits ?? "").replace(/[^\d+]/g, "");
        const key = digitsKey(number);
        if (key.length < 10 || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name: rawName, rawName, phone: number });
      }
    }
    if (!res.hasNextPage || !res.data?.length) break;
  }
  return out;
}

/** Contacts with "lead" anywhere in the name, with the tag cleaned out of the lead's name. */
export async function scanTaggedContacts(): Promise<TaggedContact[]> {
  const list = await readPhoneContacts(isLeadTagged);
  return list.map(({ key, rawName, phone }) => ({ key, name: cleanLeadName(rawName), phone }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(contacts: api.ImportContact[]): Promise<api.ImportResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await api.importLeads(contacts);
      // An offline-queued write resolves without a body: it isn't confirmed yet.
      if (!result || typeof result.added !== "number") throw new Error("Saved offline; will retry");
      return result;
    } catch (e) {
      lastErr = e;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

/**
 * Uploads these contacts as leads. Numbers are remembered as sent only after the server confirms,
 * so anything that fails is picked up again on the next run.
 */
export async function uploadTaggedContacts(list: TaggedContact[]): Promise<{ added: number; existing: number; invalid: number }> {
  const synced = await loadSet(SYNCED_KEY);
  const total = { added: 0, existing: 0, invalid: 0 };
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const result = await sendWithRetry(chunk.map((c) => ({ name: c.name, phone: c.phone })));
    total.added += result.added;
    total.existing += result.existing;
    total.invalid += result.invalid;
    for (const c of chunk) synced.add(c.key);
    await saveSet(SYNCED_KEY, synced);
  }
  return total;
}

export interface AutoSyncResult {
  found: number;
  added: number;
}

let running = false;
let lastRun = 0;

/**
 * Sends contacts tagged with LEAD_TAG that haven't been sent yet to the leads list. Silent: it never
 * asks for permission (the toggle does) and returns null when it has nothing to do or can't run.
 * Failures are recorded in getAutoSyncStatus() so the screen can show them.
 */
export async function syncTaggedContacts(opts: { force?: boolean } = {}): Promise<AutoSyncResult | null> {
  if (running) return null;
  if (!opts.force && Date.now() - lastRun < MIN_GAP_MS) return null;
  running = true;
  try {
    if (!(await isAutoSyncEnabled())) return null;
    const perm = await Contacts.getPermissionsAsync();
    if (perm.status !== "granted") {
      await patchStatus({ lastError: "Contacts permission is off" });
      return null;
    }

    lastRun = Date.now();
    await patchStatus({ lastRunAt: lastRun });
    const synced = await loadSet(SYNCED_KEY);
    const fresh = (await scanTaggedContacts()).filter((c) => !synced.has(c.key));
    if (fresh.length === 0) {
      await patchStatus({ lastSuccessAt: Date.now(), lastError: undefined, pending: 0, lastAdded: 0 });
      return { found: 0, added: 0 };
    }

    await patchStatus({ pending: fresh.length });
    const result = await uploadTaggedContacts(fresh);
    await patchStatus({ lastSuccessAt: Date.now(), lastError: undefined, pending: 0, lastAdded: result.added });
    return { found: fresh.length, added: result.added };
  } catch (e) {
    await patchStatus({ lastError: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    return null;
  } finally {
    running = false;
  }
}

/**
 * Tagged contacts that aren't leads yet, for the "matching contacts found" popup. With
 * `includeDismissed: false` (automatic popups) numbers the person already said "not now" to are hidden.
 */
export async function findContactSuggestions(opts: { includeDismissed?: boolean } = {}): Promise<TaggedContact[]> {
  const [tagged, synced, dismissed] = await Promise.all([scanTaggedContacts(), loadSet(SYNCED_KEY), loadSet(DISMISSED_KEY)]);
  const candidates = tagged.filter((c) => !synced.has(c.key) && (opts.includeDismissed || !dismissed.has(c.key)));
  if (!candidates.length) return [];
  let existing = new Set<string>();
  try {
    existing = new Set((await api.lookupLeadPhones(candidates.map((c) => c.phone))).map(digitsKey));
  } catch {
    // Offline: show them all; the server skips duplicates on upload anyway.
  }
  if (existing.size) {
    // Already leads: remember them so they're never suggested again.
    for (const c of candidates) if (existing.has(c.key)) synced.add(c.key);
    await saveSet(SYNCED_KEY, synced);
  }
  return candidates.filter((c) => !existing.has(c.key));
}

export async function dismissSuggestions(list: TaggedContact[]): Promise<void> {
  const dismissed = await loadSet(DISMISSED_KEY);
  for (const c of list) dismissed.add(c.key);
  await saveSet(DISMISSED_KEY, dismissed);
}
