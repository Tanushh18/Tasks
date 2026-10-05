import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { confirmOtaBoot, downloadOtaUpdate } from "./githubOta";

/** Don't hit GitHub on every foreground. */
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Over-the-air updates from GitHub Releases: on launch and whenever the app returns to the foreground (at most
 * every 30 minutes) download a newer JavaScript bundle published by the "Publish OTA" workflow.
 *
 * The download is applied the next time the app is opened, never mid-use — reloading under someone who is
 * halfway through a form would lose their work. Every step is best-effort: no connection, or no release yet,
 * just does nothing.
 *
 * Only JS changes travel this way. A change to native code, permissions or plugins needs a new APK built with
 * a bumped `version` in app.json, so it never receives an incompatible bundle.
 */
export function useOtaUpdates(): void {
  const lastCheckAt = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    // The app rendered, so a downloaded bundle we launched on is good; stops the native rollback.
    void confirmOtaBoot();

    const check = async () => {
      if (busy.current || Date.now() - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
      busy.current = true;
      lastCheckAt.current = Date.now();
      try {
        await downloadOtaUpdate();
      } catch {
        // Offline or GitHub unreachable — try again at the next foreground.
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
