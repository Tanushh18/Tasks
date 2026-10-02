import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useFeatureFlags } from "../features/FeatureFlagsContext";
import { syncTaggedContacts } from "./contactAutoSync";
import { emitLeadEvent } from "./leadEvents";

/** While the app is open, re-check this often too (not only when it comes to the foreground). */
const WHILE_OPEN_MS = 5 * 60 * 1000;

/**
 * Picks up contacts with "lead" in the name whenever the app opens, comes back to the foreground, and
 * every few minutes while open. If auto-add is off or the upload didn't go through, the "matching
 * contacts found" popup offers them instead.
 */
export function useLeadContactSync(): void {
  const { isAuthenticated } = useAuth();
  const { flags } = useFeatureFlags();
  const active = isAuthenticated && flags.leads;

  useEffect(() => {
    if (!active) return;
    const run = async () => {
      const result = await syncTaggedContacts();
      if (result) {
        if (result.added > 0) emitLeadEvent("leadsChanged");
        return;
      }
      // Auto-add off, failed, or throttled: suggest instead. The popup rate-limits itself, skips numbers
      // already sent or dismissed, and stays hidden when there is nothing new.
      emitLeadEvent("showContactSuggestions", { manual: false });
    };
    void run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void run();
    }, WHILE_OPEN_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [active]);
}
