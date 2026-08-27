import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";

export function LoadingState({ label = "Just a moment…" }: { label?: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>{label}</Text>
    </View>
  );
}

/**
 * Every recoverable failure offers a way forward (spec §126) — a retry, or whatever action
 * actually unblocks the user. `message` is expected to be already-friendly copy from
 * `getApiErrorMessage`, never a raw server or network error.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <Text
        style={[typography.body, { color: colors.text, textAlign: "center", marginBottom: spacing.lg }]}
      >
        {message}
      </Text>
      {onRetry ? <Button label={retryLabel} onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

/**
 * Empty states name the thing that's missing and offer the action that fills it, rather than
 * reporting an absence ("No records found").
 */
export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[typography.h3, { color: colors.text, textAlign: "center" }]}>{title}</Text>
      {subtitle ? (
        <Text
          style={[typography.body, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs }]}
        >
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
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
