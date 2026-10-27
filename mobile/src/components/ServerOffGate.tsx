import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getServerStatus, subscribeServerStatus, type ServerStatus } from "../api/registry";
import { useTheme } from "../theme/useTheme";
import { LoadingState } from "./StateViews";

function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>(getServerStatus());
  useEffect(() => {
    setStatus(getServerStatus());
    return subscribeServerStatus(setStatus);
  }, []);
  return status;
}

/** Replaces the whole app while the servers are switched off on Stashr; nothing cached is shown. */
export function ServerOffGate({ children }: { children: React.ReactNode }) {
  const status = useServerStatus();
  const { colors, spacing, typography } = useTheme();
  if (status === "checking") return <LoadingState label="Connecting…" />;
  if (status === "off") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <Ionicons name="power-outline" size={48} color={colors.danger} />
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.lg, textAlign: "center" }]}>
          Server is switched off
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm, textAlign: "center" }]}>
          We Three is paused right now. It will open again on its own when the server is back.
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
