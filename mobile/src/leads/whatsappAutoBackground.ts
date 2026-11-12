import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { getActiveBaseUrl } from "../api/client";
import { loadTokens } from "../auth/tokenStorage";
import { listImages } from "./whatsappAuto";
import { loadSheetChoice, messagePool } from "./whatsappAutoMessages";

/**
 * The background sender: a native foreground service (modules/whatsapp-auto-sender) that keeps sending on schedule
 * while other apps are in use. This file only hands it the settings and reads its counters.
 */
export interface BackgroundState {
  enabled: boolean;
  running: boolean;
  sentToday: number;
  sentTotal: number;
  status: string;
}

interface BgNative {
  startBackground(config: string): void;
  stopBackground(): void;
  backgroundState(): BackgroundState;
  openBatterySettings(): void;
}

const Native: BgNative | null = Platform.OS === "android" ? requireOptionalNativeModule<BgNative>("WhatsAppAutoSender") : null;

export const backgroundSupported = !!Native;

/** Starts the background sender with the current login, server, sheet and messages. */
/** testMode: 15-second gaps, ignores the 10 AM–7 PM window and the daily cap. Only for testing. */
export async function startBackgroundSender(testMode = false): Promise<void> {
  if (!Native) throw new Error("Background sending isn't available in this build");
  await listImages().catch(() => undefined); // makes sure the three ads are in the folder
  const tokens = await loadTokens();
  if (!tokens?.accessToken) throw new Error("Log in to We Three first.");
  const origin = await loadSheetChoice();
  const templates = await messagePool();
  Native.startBackground(
    JSON.stringify({
      baseUrl: getActiveBaseUrl(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      origin,
      templates,
      testMode,
    })
  );
}

export function stopBackgroundSender(): void {
  try {
    Native?.stopBackground();
  } catch {
    // Already stopped.
  }
}

export function backgroundStatus(): BackgroundState | null {
  try {
    return Native?.backgroundState() ?? null;
  } catch {
    return null;
  }
}

export function openBatterySettings(): void {
  try {
    Native?.openBatterySettings();
  } catch {
    // Not available here.
  }
}
