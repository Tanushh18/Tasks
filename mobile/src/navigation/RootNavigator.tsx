import { NavigationContainer } from "@react-navigation/native";
import React from "react";
import { useAuth } from "../auth/AuthContext";
import { LoadingState } from "../components/StateViews";
import { useTheme } from "../theme/useTheme";
import { AuthNavigator } from "./AuthNavigator";
import { MainTabs } from "./MainTabs";
import { navigationRef } from "./navigationRef";

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isDark, colors } = useTheme();

  if (isLoading) {
    return <LoadingState label="Loading…" />;
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
      {isAuthenticated ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
