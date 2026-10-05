import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { getUpiSettings, onUpiSettingsChanged, startLiveSmsListener, syncUpiExpenses, updateUpiSettings } from "./upiExpenseSync";
import { backgroundTrackingAvailable, isTrackingRunning, smsReaderAvailable, startTracking, stopTracking } from "./smsReader";

/**
 * Admin-only. While the toggle is ON (and the app has the native SMS module): scans the inbox when the
 * app opens and each time it comes to the foreground, and saves new SMS the moment they arrive while the
 * app is open. An unfinished old-message import is resumed by the same scan each time the app opens or
 * comes to the foreground (and by the headless task). Everything runs in the background of the UI; nothing here blocks rendering. (When the app
 * is closed the native receiver starts the headless task instead, see index.ts.)
 */
export function useUpiExpenseSync(): void {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const userId = user?.id;
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!smsReaderAvailable) return;
    let alive = true;
    void getUpiSettings().then((s) => alive && setEnabled(s.enabled));
    const off = onUpiSettingsChanged((s) => setEnabled(s.enabled));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const active = smsReaderAvailable && isAuthenticated && isAdmin && enabled;

  // The always-on service must never run for a signed-out user, a non-admin, or while tracking is OFF.
  const wasActive = useRef(false);
  useEffect(() => {
    if (!backgroundTrackingAvailable) return;
    if (active) {
      wasActive.current = true;
      return;
    }
    // Stop after any active -> inactive change (sign-out, toggle OFF) and for a signed-in non-admin.
    if (wasActive.current || (isAuthenticated && !isAdmin)) {
      wasActive.current = false;
      stopTracking();
    }
  }, [active, isAuthenticated, isAdmin]);

  useEffect(() => {
    if (!active) return;
    if (userId) void updateUpiSettings({ userId });
    const run = () => void syncUpiExpenses().catch(() => undefined);
    run();
    const ensureService = () => {
      if (backgroundTrackingAvailable && !isTrackingRunning()) startTracking();
    };
    ensureService();
    const unlisten = startLiveSmsListener();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        ensureService();
        run();
      }
    });
    return () => {
      unlisten();
      sub.remove();
    };
  }, [active, userId]);
}
