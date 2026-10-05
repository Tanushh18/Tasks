import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";

/**
 * Reads bank SMS on Android (native code: modules/sms-expense-reader). Optional: on iOS, on an APK built
 * before the module existed, and in Jest there is no native module, and every function here quietly
 * reports "not available" instead of throwing.
 */
export interface SmsMessage {
  id: string;
  address: string;
  body: string;
  /** Epoch milliseconds. */
  date: number;
}

interface NativeSmsReader {
  hasPermission(): boolean;
  readInbox(sinceMs: number, limit: number): Promise<SmsMessage[]>;
  peekQueuedSms(): SmsMessage[];
  removeQueuedSms(ids: string[]): void;
  // Background tracking (added later: an APK built before that lacks these, see backgroundTrackingAvailable).
  startTracking?(): boolean;
  stopTracking?(): boolean;
  isTrackingRunning?(): boolean;
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): boolean;
  openAutoStartSettings?(): boolean;
  areNotificationsEnabled?(): boolean;
  addListener(event: string, listener: (e: { address: string; body: string; date: number }) => void): { remove(): void };
}

function loadNative(): NativeSmsReader | null {
  if (Platform.OS !== "android") return null;
  try {
    return requireOptionalNativeModule<NativeSmsReader>("SmsExpenseReader");
  } catch {
    return null;
  }
}

const Native = loadNative();

/** False on iOS and on an APK that doesn't contain the native module (OTA updates can't add it). */
export const smsReaderAvailable: boolean = !!Native;

export function hasSmsPermission(): boolean {
  try {
    return !!Native?.hasPermission();
  } catch {
    return false;
  }
}

/** Shows Android's runtime prompt for reading and receiving SMS. Resolves to whether reading is allowed. */
export async function requestSmsPermission(): Promise<boolean> {
  if (!Native) return false;
  try {
    await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.READ_SMS, PermissionsAndroid.PERMISSIONS.RECEIVE_SMS]);
  } catch {
    // fall through to the check below
  }
  return hasSmsPermission();
}

/** Inbox messages newer than sinceMs, oldest first. [] when unavailable / not permitted / failing. */
export async function readInbox(sinceMs: number, limit: number): Promise<SmsMessage[]> {
  if (!Native) return [];
  try {
    return (await Native.readInbox(sinceMs, limit)) ?? [];
  } catch {
    return [];
  }
}

/** SMS that arrived while the app wasn't running. They stay in the native queue until removeQueuedSms. */
export function peekQueuedSms(): SmsMessage[] {
  try {
    return Native?.peekQueuedSms() ?? [];
  } catch {
    return [];
  }
}

/** Deletes processed messages from the native queue so the SMS text isn't kept any longer than needed. */
export function removeQueuedSms(ids: string[]): void {
  if (!ids.length) return;
  try {
    Native?.removeQueuedSms(ids);
  } catch {
    // ignore
  }
}

/** Live SMS while the app is running. Returns an unsubscribe function. */
export function onSmsReceived(listener: (m: { address: string; body: string; date: number }) => void): () => void {
  if (!Native) return () => undefined;
  try {
    const sub = Native.addListener("onSmsReceived", listener);
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** True only on an APK that has the always-on tracking service (older APKs have the reader but not this). */
export const backgroundTrackingAvailable: boolean = typeof Native?.startTracking === "function";

/** Starts the always-on foreground service and remembers "ON" natively (for reboot). False if unavailable/refused. */
export function startTracking(): boolean {
  try {
    return !!Native?.startTracking?.();
  } catch {
    return false;
  }
}

/** Stops the service and clears the native "ON" flag. Safe to call anywhere (sign-out, toggle OFF). */
export function stopTracking(): void {
  try {
    Native?.stopTracking?.();
  } catch {
    // ignore
  }
}

export function isTrackingRunning(): boolean {
  try {
    return !!Native?.isTrackingRunning?.();
  } catch {
    return false;
  }
}

/** True when the app is exempt from battery optimisation. False when unknown/unavailable. */
export function isIgnoringBatteryOptimizations(): boolean {
  try {
    return !!Native?.isIgnoringBatteryOptimizations?.();
  } catch {
    return false;
  }
}

export function requestIgnoreBatteryOptimizations(): boolean {
  try {
    return !!Native?.requestIgnoreBatteryOptimizations?.();
  } catch {
    return false;
  }
}

/** Opens the phone maker's auto-start screen (Oppo/Realme/Xiaomi/Vivo/...), else this app's settings. */
export function openAutoStartSettings(): boolean {
  try {
    return !!Native?.openAutoStartSettings?.();
  } catch {
    return false;
  }
}

/** Whether notifications are allowed (needed for the tracking notice to show). True when unknown. */
export function areNotificationsEnabled(): boolean {
  try {
    const fn = Native?.areNotificationsEnabled;
    return fn ? !!fn.call(Native) : true;
  } catch {
    return true;
  }
}

/** Android 13+ runtime prompt for notifications. Resolves to whether they are now allowed. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const perm = (PermissionsAndroid.PERMISSIONS as Record<string, string>).POST_NOTIFICATIONS;
    if (perm && Number(Platform.Version) >= 33) await PermissionsAndroid.request(perm as never);
  } catch {
    // fall through
  }
  return areNotificationsEnabled();
}
