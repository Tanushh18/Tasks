import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";
import type { PendingCall } from "./callFollowUp";

/**
 * The Android-only "how did the call go?" card that appears over other apps when a call started from
 * the app ends (native code: modules/lead-call-overlay). Optional: on iOS, or on an APK built before
 * the module existed, every function here quietly does nothing and the in-app popup still asks.
 */
interface NativeOverlay {
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  startCallWatch(leadId: string, name: string, phone: string, statuses: string[]): void;
  stopCallWatch(): void;
  showTestOverlay(): void;
  takeQueuedOutcomes(): { leadId: string; status: string; at: number }[];
  addListener(event: string, listener: (e: { leadId: string; status?: string }) => void): { remove(): void };
}

const Native: NativeOverlay | null = Platform.OS === "android" ? requireOptionalNativeModule<NativeOverlay>("LeadCallOverlay") : null;
const ASKED_KEY = "leads.callOverlay.asked";

export const overlaySupported = !!Native;

export function canDrawOverlays(): boolean {
  try {
    return !!Native?.canDrawOverlays();
  } catch {
    return false;
  }
}

export async function hasPhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
}

export interface OverlaySetup {
  supported: boolean;
  overlay: boolean;
  phoneState: boolean;
}

export async function getOverlaySetup(): Promise<OverlaySetup> {
  if (!Native) return { supported: false, overlay: false, phoneState: false };
  return { supported: true, overlay: canDrawOverlays(), phoneState: await hasPhoneStatePermission() };
}

/** Asks for phone-state access, then sends the person to the "Display over other apps" switch if needed. */
export async function requestOverlaySetup(): Promise<OverlaySetup> {
  if (!Native) return getOverlaySetup();
  await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => undefined);
  if (!(await hasPhoneStatePermission())) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, {
      title: "Know when your call ends",
      message: "We Three only checks when a call you started from a lead has ended, to ask how it went. It never reads numbers or call contents.",
      buttonPositive: "Allow",
      buttonNegative: "Not now",
    });
  }
  if (!canDrawOverlays()) Native.openOverlaySettings();
  return getOverlaySetup();
}

/** True once the person has been offered the setup (so a call doesn't keep prompting). */
export async function wasOverlaySetupOffered(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) === "1";
}

export function startCallWatch(call: Pick<PendingCall, "leadId" | "name" | "phone">, statuses: string[]): void {
  try {
    Native?.startCallWatch(call.leadId, call.name ?? "", call.phone ?? "", statuses);
  } catch {
    // e.g. no phone-state permission: the in-app popup and notification still cover it.
  }
}

export function showTestOverlay(): void {
  try {
    Native?.showTestOverlay();
  } catch {
    // ignore
  }
}

/** Stage picks made on the overlay while JS wasn't running. */
export function takeQueuedOutcomes(): { leadId: string; status: string }[] {
  try {
    return Native?.takeQueuedOutcomes() ?? [];
  } catch {
    return [];
  }
}

export function onOverlayEvent(event: "onOutcome" | "onLater" | "onCallEnded", listener: (e: { leadId: string; status?: string }) => void): () => void {
  if (!Native) return () => undefined;
  const sub = Native.addListener(event, listener);
  return () => sub.remove();
}
