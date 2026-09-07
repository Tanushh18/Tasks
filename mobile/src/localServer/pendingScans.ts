import * as Crypto from "expo-crypto";
import { getStorageScope, requireScopedKey, scopedKey } from "../offline/scope";
import { getJson, setJson } from "../offline/storage";

/** Namespaced per user — see offline/scope.ts. Scanned images belong to whoever captured them,
 * unlike the local server URL in localServer/config.ts, which is a device-wide setting. */
const PENDING_SCANS_KEY_BASE = "dt_pending_scans";

export interface PendingScan {
  id: string;
  /** File URI under the app's document directory where the captured image was persisted. */
  uri: string;
  target: "contact" | "receipt";
  createdAt: string;
}

async function getList(): Promise<PendingScan[]> {
  const key = scopedKey(PENDING_SCANS_KEY_BASE);
  if (!key) return [];
  return (await getJson<PendingScan[]>(key)) ?? [];
}

async function saveList(list: PendingScan[]): Promise<void> {
  await setJson(requireScopedKey(PENDING_SCANS_KEY_BASE), list);
}

export async function listPendingScans(): Promise<PendingScan[]> {
  return getList();
}

export async function addPendingScan(uri: string, target: "contact" | "receipt"): Promise<PendingScan> {
  // Nothing to attribute this scan to while signed out — requireScopedKey below throws in that
  // case, which is the correct outcome (this only ever runs from a signed-in screen anyway).
  if (!getStorageScope()) throw new Error("Cannot save a pending scan while signed out.");
  const scan: PendingScan = { id: Crypto.randomUUID(), uri, target, createdAt: new Date().toISOString() };
  const list = await getList();
  list.push(scan);
  await saveList(list);
  return scan;
}

export async function removePendingScan(id: string): Promise<void> {
  const list = await getList();
  await saveList(list.filter((item) => item.id !== id));
}
