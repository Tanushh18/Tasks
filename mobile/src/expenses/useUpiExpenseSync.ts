import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { getUpiSettings, onUpiSettingsChanged, startLiveSmsListener, syncUpiExpenses, updateUpiSettings } from "./upiExpenseSync";
import { smsReaderAvailable } from "./smsReader";

/**
 * Admin-only. While the toggle is ON (and the app has the native SMS module): scans the inbox when the
 * app opens and each time it comes to the foreground, and saves new SMS the moment they arrive while the
 * app is open. Everything runs in the background of the UI; nothing here blocks rendering. (When the app
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

  useEffect(() => {
    if (!active) return;
    if (userId) void updateUpiSettings({ userId });
    const run = () => void syncUpiExpenses().catch(() => undefined);
    run();
    const unlisten = startLiveSmsListener();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      unlisten();
      sub.remove();
    };
  }, [active, userId]);
}
