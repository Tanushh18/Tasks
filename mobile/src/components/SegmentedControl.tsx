import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label, e.g. "Today 3". */
  count?: number;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Let segments scroll horizontally when there are more than ~3. */
  scrollable?: boolean;
}

/**
 * Tab switcher used for Today/Upcoming/Completed, Money In/Out, and anywhere
 * else a small set of views share one screen. Selection is carried by fill,
 * weight *and* `accessibilityState`, never colour alone.
 */
export function SegmentedControl<T extends string>({ segments, value, onChange, scrollable }: Props<T>) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();

  const items = segments.map((segment) => {
    const active = segment.value === value;
    return (
      <Pressable
        key={segment.value}
        onPress={() => onChange(segment.value)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={segment.count === undefined ? segment.label : `${segment.label}, ${segment.count}`}
        style={({ pressed }) => [
          styles.segment,
          {
            backgroundColor: active ? colors.surface : "transparent",
            borderRadius: radius.md,
            minHeight: touchTarget.min - 8,
            paddingHorizontal: spacing.md,
            flex: scrollable ? undefined : 1,
            opacity: pressed && !active ? 0.6 : 1,
          },
          active ? styles.activeShadow : null,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            active ? typography.captionStrong : typography.caption,
            { color: active ? colors.text : colors.textMuted },
          ]}
        >
          {segment.label}
          {segment.count !== undefined ? `  ${segment.count}` : ""}
        </Text>
      </Pressable>
    );
  });

  const containerStyle = {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 4,
  };

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, containerStyle]}
        accessibilityRole="tablist"
      >
        {items}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.row, containerStyle]} accessibilityRole="tablist">
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  segment: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  activeShadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
