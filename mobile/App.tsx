import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { useNotificationResponseHandler } from "./src/notifications/useNotificationResponseHandler";
import { useOfflineSync } from "./src/offline/useOfflineSync";
import { RootNavigator } from "./src/navigation/RootNavigator";

function AppContent() {
  useNotificationResponseHandler();
  useOfflineSync();
  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
