import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const DEVICE_ID_KEY = "bluetoothMesh:deviceId";
const SEQ_KEY = "bluetoothMesh:seq";

/**
 * A random id local to this install (8 hex chars — every byte here is
 * precious since it has to survive being chunked across ~13-byte BLE
 * advertisement packets). Not the backend user id, on purpose: this mesh has
 * to keep working with the backend, Wi-Fi and mobile data all unreachable.
 * 8 hex chars is ~4.3 billion values, far more than enough to avoid a
 * collision within one household/event-sized mesh.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/** Monotonically increasing per-device counter, used to build unique message ids. */
export async function nextSeq(): Promise<number> {
  const raw = await AsyncStorage.getItem(SEQ_KEY);
  const next = (raw ? parseInt(raw, 10) : 0) + 1;
  await AsyncStorage.setItem(SEQ_KEY, String(next));
  return next;
}
