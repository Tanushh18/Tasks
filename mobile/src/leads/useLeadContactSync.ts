import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useFeatureFlags } from "../features/FeatureFlagsContext";
import { syncTaggedContacts } from "./contactAutoSync";

/** Picks up contacts tagged "lead" whenever the app opens or comes back to the foreground. */
export function useLeadContactSync(): void {
  const { isAuthenticated } = useAuth();
  const { flags } = useFeatureFlags();
  const active = isAuthenticated && flags.leads;

  useEffect(() => {
    if (!active) return;
    void syncTaggedContacts();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncTaggedContacts();
    });
    return () => sub.remove();
  }, [active]);
}
