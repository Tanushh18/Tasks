import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Skeleton } from "./Skeleton";
import { useTheme } from "../theme/useTheme";

interface Props {
  label: string;
  /** Pass `undefined` while loading — a real-looking ₹0 before the answer arrives is worse than a skeleton. */
  value?: string;
  /** Small line under the value: a comparison, a count, a date range. */
  detail?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Tint for the icon tile and the value. Defaults to plain text colour. */
  tone?: string;
  toneMuted?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Compact figure tile — money totals, task counts, group balances. */
export function StatCard({ label, value, detail, icon, tone, toneMuted, onPress, style }: Props) {
  const { colors, spacing, radius, typography, shadow, touchTarget } = useTheme();

  const body = (
    <View
      style={[
        styles.card,
        shadow.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.lg,
          minHeight: touchTarget.large,
        },
        style,
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.iconTile,
            { backgroundColor: toneMuted ?? colors.surfaceAlt, borderRadius: radius.md, marginBottom: spacing.md },
          ]}
        >
          <Ionicons name={icon} size={18} color={tone ?? colors.textMuted} />
        </View>
      ) : null}

      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>

      {value === undefined ? (
        <Skeleton height={26} width="70%" style={{ marginTop: 6 }} />
      ) : (
        <Text style={[typography.amount, { color: tone ?? colors.text, marginTop: 2 }]} numberOfLines={1}>
          {value}
        </Text>
      )}

      {detail ? (
        <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ""}${detail ? `, ${detail}` : ""}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { justifyContent: "center" },
  iconTile: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
});
