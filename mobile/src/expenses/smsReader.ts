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
