import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as locationApi from "./src/api/location";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { FeatureFlagsProvider, useFeatureFlags } from "./src/features/FeatureFlagsContext";
import { startLocationTracking } from "./src/location/backgroundLocationTask";
import { useNotificationResponseHandler } from "./src/notifications/useNotificationResponseHandler";
import { useOfflineSync } from "./src/offline/useOfflineSync";
import { RootNavigator } from "./src/navigation/RootNavigator";

function AppContent() {
  useNotificationResponseHandler();
  useOfflineSync();

  const { isAuthenticated } = useAuth();
  const { flags } = useFeatureFlags();
  const resumedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !flags.location) return;
    if (resumedFor.current === "done") return;
    resumedFor.current = "done";
    (async () => {
      try {
        const shares = await locationApi.getShares();
        if (shares.sharingWith.length > 0) {
          await startLocationTracking();
        }
      } catch {
        // Best-effort resume — a failure here is a background nicety, not a critical path.
      }
    })();
  }, [isAuthenticated, flags.location]);

  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <FeatureFlagsProvider>
          <AppContent />
        </FeatureFlagsProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
