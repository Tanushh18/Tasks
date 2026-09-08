import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

export interface QuickAction {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** Module identity tint — from `theme.feature`. */
  tone: string;
  toneMuted: string;
  onPress: () => void;
}

/**
 * The handful of things a family member opens the app to do. Laid out as a
 * wrapping grid of large targets rather than a row of small icons — these are
 * the most-tapped controls in the app and older users need to hit them
 * first time (spec §37).
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  return (
    <View style={[styles.grid, { gap: spacing.md }]}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.action,
            shadow.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              paddingVertical: spacing.lg,
              paddingHorizontal: spacing.sm,
              minHeight: touchTarget.large + 24,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <View
            style={[
              styles.iconTile,
              { backgroundColor: action.toneMuted, borderRadius: radius.md, marginBottom: spacing.sm },
            ]}
          >
            <Ionicons name={action.icon} size={22} color={action.tone} />
          </View>
          <Text
            style={[typography.caption, { color: colors.text, textAlign: "center", fontWeight: "600" }]}
            numberOfLines={2}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  // Three per row, accounting for the 12pt gaps between them.
  action: { width: "31%", alignItems: "center", justifyContent: "center" },
  iconTile: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
});
