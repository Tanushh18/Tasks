import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  title: string;
  /** Small line under the title — a count, a range, or a plain-language summary. */
  subtitle?: string;
  /** Optional trailing action, e.g. "View all". */
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onActionPress }: Props) {
  const { colors, spacing, typography, touchTarget } = useTheme();

  return (
    <View style={[styles.row, { marginBottom: spacing.md }]}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
        ) : null}
      </View>

      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          hitSlop={8}
          style={({ pressed }) => [
            styles.action,
            { minHeight: touchTarget.min, paddingHorizontal: spacing.sm, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[typography.captionStrong, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  titleBlock: { flexShrink: 1 },
  action: { justifyContent: "center" },
});
