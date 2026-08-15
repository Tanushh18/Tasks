import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[typography.bodyStrong, { color: colors.danger, textAlign: "center", marginBottom: spacing.md }]}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[typography.bodyStrong, { color: colors.text, textAlign: "center" }]}>{title}</Text>
      {subtitle ? (
        <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
});
