import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  label: string;
  tone?: "primary" | "success" | "danger" | "warning" | "neutral";
}

export function Badge({ label, tone = "neutral" }: Props) {
  const { colors, radius, spacing, typography } = useTheme();

  const toneColors: Record<NonNullable<Props["tone"]>, { bg: string; fg: string }> = {
    primary: { bg: colors.primaryMuted, fg: colors.primary },
    success: { bg: colors.successMuted, fg: colors.success },
    danger: { bg: colors.dangerMuted, fg: colors.danger },
    warning: { bg: colors.warningMuted, fg: colors.warning },
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
  };
  const { bg, fg } = toneColors[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
      ]}
    >
      <Text style={[typography.captionStrong, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start" },
});
