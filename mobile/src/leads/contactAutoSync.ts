import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Contacts from "expo-contacts";
import * as api from "../api/leads";

/** A contact whose name contains this word (e.g. "Ramesh lead", "Ramesh #Lead") becomes a lead. */
export const LEAD_TAG = "lead";

const ENABLED_KEY = "leads.contactAutoSync.enabled";
const SYNCED_KEY = "leads.contactAutoSync.numbers";
const CHUNK = 500;
const MIN_GAP_MS = 15_000;

const TAG_PATTERN = new RegExp(`#?\\b${LEAD_TAG}\\b`, "gi");

export function isLeadTagged(name: string | undefined | null): boolean {
  return !!name && new RegExp(`\\b${LEAD_TAG}\\b`, "i").test(name);
}

/** Drops the tag (and the brackets/dashes it leaves behind): "Ramesh (#lead)" -> "Ramesh". */
export function cleanLeadName(name: string): string {
  return name
    .replace(TAG_PATTERN, " ")
    .replace(/[([{]\s*[)\]}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,:|]+|[\s\-–—,:|]+$/g, "")
    .trim();
}

const digitsKey = (number: string) => number.replace(/\D/g, "").slice(-10);

export async function isAutoSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
}

export async function setAutoSyncEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
}

async function loadSynced(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
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
 */
export async function syncTaggedContacts(opts: { force?: boolean } = {}): Promise<AutoSyncResult | null> {
  if (running) return null;
  if (!opts.force && Date.now() - lastRun < MIN_GAP_MS) return null;
  running = true;
  try {
    if (!(await isAutoSyncEnabled())) return null;
    const perm = await Contacts.getPermissionsAsync();
    if (perm.status !== "granted") return null;

    lastRun = Date.now();
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
    const synced = await loadSynced();

    const fresh = new Map<string, api.ImportContact>();
    for (const contact of data) {
      if (!isLeadTagged(contact.name)) continue;
      const name = cleanLeadName(contact.name ?? "");
      for (const p of contact.phoneNumbers ?? []) {
        const number = p.number?.replace(/[^\d+]/g, "");
        if (!number) continue;
        const key = digitsKey(number);
        if (key.length < 10 || synced.has(key) || fresh.has(key)) continue;
        fresh.set(key, { name, phone: number });
      }
    }
    if (fresh.size === 0) return { found: 0, added: 0 };

    const entries = [...fresh.entries()];
    let added = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const result = await api.importLeads(chunk.map(([, c]) => c));
      added += result.added;
      // Only remember numbers the server has seen, so a failed request is retried next time.
      for (const [key] of chunk) synced.add(key);
      await AsyncStorage.setItem(SYNCED_KEY, JSON.stringify([...synced]));
    }
    return { found: entries.length, added };
  } catch {
    return null;
  } finally {
    running = false;
  }
}
