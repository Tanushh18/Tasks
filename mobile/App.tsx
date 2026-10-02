import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as locationApi from "./src/api/location";
import { refreshServerList } from "./src/api/registry";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { FeatureFlagsProvider, useFeatureFlags } from "./src/features/FeatureFlagsContext";
import { CallFollowUpHost, ContactSuggestionsHost } from "./src/leads/LeadPopups";
import { useLeadContactSync } from "./src/leads/useLeadContactSync";
import { startLocationTracking } from "./src/location/backgroundLocationTask";
import { useNotificationResponseHandler } from "./src/notifications/useNotificationResponseHandler";
import { useOfflineSync } from "./src/offline/useOfflineSync";
import { useOtaUpdates } from "./src/updates/useOtaUpdates";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider } from "./src/theme/ThemeProvider";
import { useTheme } from "./src/theme/useTheme";

// Pick up the latest server list from the Stashr registry (background; never blocks start-up).
void refreshServerList();

function AppContent() {
  useNotificationResponseHandler();
  useOfflineSync();
  useOtaUpdates();
  useLeadContactSync();

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

  return (
    <>
      <RootNavigator />
      {/* Lead popups sit above every screen. */}
      <CallFollowUpHost />
      <ContactSuggestionsHost />
    </>
  );
}

/** Status bar icons follow the theme the person picked, not just the phone's setting. */
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <FeatureFlagsProvider>
              <AppContent />
            </FeatureFlagsProvider>
          </AuthProvider>
          <ThemedStatusBar />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
