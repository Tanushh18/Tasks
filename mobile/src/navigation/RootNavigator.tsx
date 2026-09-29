import { NavigationContainer } from "@react-navigation/native";
import React from "react";
import { useAuth } from "../auth/AuthContext";
import { LoadingState } from "../components/StateViews";
import { useTheme } from "../theme/useTheme";
import { FirstTimeSetupScreen } from "../screens/auth/FirstTimeSetupScreen";
import { BiometricLockScreen } from "../screens/auth/BiometricLockScreen";
import { AuthNavigator } from "./AuthNavigator";
import { ForceMpinChangeNavigator } from "./ForceMpinChangeNavigator";
import { MainTabs } from "./MainTabs";
import { navigationRef } from "./navigationRef";

export function RootNavigator() {
  const {
    isAuthenticated,
    isLoading,
    needsMpinChange,
    justRegistered,
    clearJustRegistered,
    isBiometricLocked,
    unlockWithBiometric,
    logout,
  } = useAuth();
  const { isDark, colors } = useTheme();

  if (isLoading) {
    return <LoadingState label="Loading…" />;
  }

  // Biometric gate: session is live but not yet verified on this launch.
  if (isAuthenticated && isBiometricLocked) {
    return (
      <BiometricLockScreen
        onUnlocked={unlockWithBiometric}
        onUseMpin={() => void logout()}
      />
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: colors.danger,
        },
        fonts: {
          regular: { fontFamily: "System", fontWeight: "400" },
          medium: { fontFamily: "System", fontWeight: "500" },
          bold: { fontFamily: "System", fontWeight: "700" },
          heavy: { fontFamily: "System", fontWeight: "900" },
        },
      }}
    >
      {isAuthenticated ? (
        needsMpinChange ? (
          <ForceMpinChangeNavigator />
        ) : justRegistered ? (
          <FirstTimeSetupScreen onFinish={clearJustRegistered} />
        ) : (
          <MainTabs />
        )
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
