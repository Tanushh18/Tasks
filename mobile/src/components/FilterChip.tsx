import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Identity tint — e.g. a feature colour or a category colour. */
  tone?: string;
  toneMuted?: string;
}

export function FilterChip({ label, selected, onPress, icon, tone, toneMuted }: ChipProps) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();

  const activeBg = toneMuted ?? colors.primaryMuted;
  const activeFg = tone ?? colors.primary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? activeBg : colors.surfaceAlt,
          borderColor: selected ? activeFg : "transparent",
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          minHeight: touchTarget.min - 8,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? activeFg : colors.textMuted}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        style={[
          selected ? typography.captionStrong : typography.caption,
          { color: selected ? activeFg : colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontally scrolling row of chips that never wraps into a tall block. */
export function FilterChipRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {children}
    </ScrollView>
  );
}

/** Wrapping group of chips, for filter sheets where vertical space is fine. */
export function FilterChipGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, paddingVertical: 8 },
  group: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
