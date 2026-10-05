import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useFeatureFlags } from "../features/FeatureFlagsContext";
import { syncVehicleReminders } from "./vehicleReminderSync";

/** Schedules the shared vehicle-document expiry reminders on app open and whenever the app returns to the foreground. */
export function useVehicleReminderSync(): void {
  const { isAuthenticated } = useAuth();
  const { flags } = useFeatureFlags();
  const active = isAuthenticated && flags.vehicleManagement;

  useEffect(() => {
    if (!active) return;
    void syncVehicleReminders();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncVehicleReminders();
    });
    return () => sub.remove();
  }, [active]);
}
