import type * as NotifeeLib from "@notifee/react-native";
import { AppState, Platform } from "react-native";

/**
 * Keeps the old-message import alive while the app is in the background: an ongoing, low-importance
 * notification run as a notifee foreground service (already in the installed APK).
 *
 * Android note: notifee's merged manifest declares its service as foregroundServiceType="shortService",
 * which Android 14 limits to about 3 minutes per start. So the import runs in slices (SERVICE_SLICE_MS) and
 * asks for a fresh service for each slice; if Android refuses the restart the import simply continues
 * without it and resumes the next time the app / headless task runs. We deliberately pass no
 * foregroundServiceTypes so the manifest's declaration is used (anything else would crash on Android 14).
 *
 * Everything here is best-effort: every failure resolves to "no service", never an exception.
 */
export const SERVICE_SLICE_MS = 150_000;
const CHANNEL_ID = "upi-import";
const PROGRESS_ID = "upi-import-progress";
const DONE_ID = "upi-import-done";
const UPDATE_EVERY_MS = 1000;

/** Loaded lazily: importing notifee throws when its native module is missing (Jest, old APKs). */
function lib(): typeof NotifeeLib {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@notifee/react-native");
}
const notifee = () => lib().default;

let active = false;
const waiting: Array<() => void> = [];

function releaseTask(): void {
  active = false;
  waiting.splice(0).forEach((r) => r());
}

/** Must be called once at app entry (index.ts), outside the React tree. */
export function registerUpiImportForegroundService(): void {
  try {
    notifee().registerForegroundService(
      () =>
        new Promise<void>((resolve) => {
          if (!active) {
            // The OS restarted the service with no import running: shut it down again.
            resolve();
            void notifee().stopForegroundService().catch(() => undefined);
            return;
          }
          waiting.push(resolve);
        })
    );
  } catch {
    // not available (tests / no native module)
  }
}

export interface ImportProgress {
  scanned: number;
  saved: number;
}

export interface ImportServiceHandle {
  update(p: ImportProgress): void;
  /** Ends the service. With `done`, leaves a "Done: M expenses added" notification. */
  stop(done?: { saved: number }): Promise<void>;
}

const body = (p: ImportProgress) => `${p.scanned} scanned, ${p.saved} saved`;

function progressNotification(p: ImportProgress) {
  return {
    id: PROGRESS_ID,
    title: "Importing bank messages…",
    body: body(p),
    android: { channelId: CHANNEL_ID, asForegroundService: true, ongoing: true, onlyAlertOnce: true, importance: lib().AndroidImportance.LOW, pressAction: { id: "default" } },
  };
}

async function notificationsAllowed(): Promise<boolean> {
  try {
    let s = await notifee().getNotificationSettings();
    if (s.authorizationStatus !== lib().AuthorizationStatus.AUTHORIZED && AppState.currentState === "active") {
      s = await notifee().requestPermission();
    }
    return s.authorizationStatus === lib().AuthorizationStatus.AUTHORIZED || s.authorizationStatus === lib().AuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

/** Starts the foreground service. Resolves to null (never throws) when it can't be started. */
export async function startImportService(initial: ImportProgress): Promise<ImportServiceHandle | null> {
  if (Platform.OS !== "android") return null;
  try {
    if (!(await notificationsAllowed())) return null;
    await notifee().createChannel({ id: CHANNEL_ID, name: "Bank message import", importance: lib().AndroidImportance.LOW });
    active = true;
    await notifee().displayNotification(progressNotification(initial));
  } catch {
    releaseTask();
    return null;
  }
  let lastAt = Date.now();
  let stopped = false;
  return {
    update(p) {
      const now = Date.now();
      if (stopped || now - lastAt < UPDATE_EVERY_MS) return;
      lastAt = now;
      try {
        void notifee().displayNotification(progressNotification(p)).catch(() => undefined);
      } catch {
        // cosmetic only
      }
    },
    async stop(done) {
      if (stopped) return;
      stopped = true;
      releaseTask();
      try {
        await notifee().stopForegroundService();
      } catch {
        // already stopped
      }
      try {
        await notifee().cancelNotification(PROGRESS_ID);
        if (done) {
          await notifee().displayNotification({
            id: DONE_ID,
            title: "Bank message import finished",
            body: `Done: ${done.saved} expense${done.saved === 1 ? "" : "s"} added`,
            android: { channelId: CHANNEL_ID, importance: lib().AndroidImportance.LOW, autoCancel: true, pressAction: { id: "default" } },
          });
        }
      } catch {
        // cosmetic only
      }
    },
  };
}
