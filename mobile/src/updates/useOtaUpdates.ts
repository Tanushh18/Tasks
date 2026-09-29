import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Don't hit the update server on every foreground — Expo rate-limits it and it costs battery. */
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Over-the-air updates: on launch and whenever the app returns to the foreground (at most every 30
 * minutes) look for a newer JavaScript bundle on the app's release channel and download it quietly.
 *
 * The download is applied the next time the app is opened, never mid-use — reloading under
 * someone who is halfway through a form would lose their work. Every step is best-effort: no
 * connection, or a build with updates switched off (development, Expo Go), just does nothing.
 *
 * Only JS/asset changes travel this way. A change to native code, permissions or `app.json` needs
 * a new APK, which gets its own runtime version and so never receives an incompatible bundle.
 */
export function useOtaUpdates(): void {
  const lastCheckAt = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    const check = async () => {
      if (busy.current || Date.now() - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
      busy.current = true;
      lastCheckAt.current = Date.now();
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline, rate-limited, or the server is asleep — try again at the next foreground.
      } finally {
        busy.current = false;
      }
    };

    void check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => subscription.remove();
  }, []);
}
