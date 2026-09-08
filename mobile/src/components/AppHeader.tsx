import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

export interface HeaderAction {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** Spoken by screen readers — the icon alone never conveys the action. */
  label: string;
  onPress: () => void;
  /** Small count bubble on the icon, e.g. unread notifications. */
  badgeCount?: number;
}

interface Props {
  title: string;
  /** A greeting, a count, or a plain-language summary of what's below. */
  subtitle?: string;
  actions?: HeaderAction[];
}

/**
 * The standard page header. Every top-level screen uses this so title size,
 * spacing and action placement never drift between modules.
 */
export function AppHeader({ title, subtitle, actions }: Props) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();

  return (
    <View style={[styles.row, { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }]}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
        ) : null}
      </View>

      {actions && actions.length > 0 ? (
        <View style={[styles.actions, { gap: spacing.sm }]}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={
                action.badgeCount ? `${action.label}, ${action.badgeCount} new` : action.label
              }
              hitSlop={6}
              style={({ pressed }) => [
                styles.action,
                {
                  minWidth: touchTarget.min,
                  minHeight: touchTarget.min,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name={action.icon} size={22} color={colors.text} />
              {action.badgeCount ? (
                <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.background }]}>
                  <Text style={styles.badgeText}>{action.badgeCount > 9 ? "9+" : action.badgeCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  titleBlock: { flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center" },
  action: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
});
