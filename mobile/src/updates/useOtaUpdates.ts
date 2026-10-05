import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { downloadAndApplyUpdate } from "./githubReleaseUpdater";

/** Don't hit GitHub on every foreground — saves battery and respects rate limits. */
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Over-the-air updates via GitHub Releases: on launch and whenever the app returns to the
 * foreground (at most every 30 minutes), check GitHub Releases for a newer JavaScript bundle
 * and download it quietly.
 *
 * The download is applied the next time the app is opened, never mid-use — reloading under
 * someone who is halfway through a form would lose their work. Every step is best-effort: no
 * connection, or GitHub being down, just does nothing.
 *
 * Only JS/asset changes travel this way. A change to native code, permissions or `app.json` needs
 * a new APK, which gets its own version and so never receives an incompatible bundle.
 */
export function useOtaUpdates(): void {
  const lastCheckAt = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current || Date.now() - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
      busy.current = true;
      lastCheckAt.current = Date.now();
      try {
        await downloadAndApplyUpdate();
      } catch (error) {
        // Offline, GitHub down, or no new release — try again at next foreground.
        console.debug("OTA update check failed:", error);
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
