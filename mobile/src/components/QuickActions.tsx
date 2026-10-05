import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
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
  const [width, setWidth] = useState(0);

  // Always exactly three buttons per row: measure the row and size each tile to fit, shrinking
  // the icon, text and padding on narrow screens instead of letting a button wrap to the next row.
  const gap = spacing.md;
  const tileWidth = width > 0 ? Math.floor((width - gap * (COLUMNS - 1)) / COLUMNS) : 0;
  const scale = tileWidth > 0 ? Math.min(1, Math.max(0.7, tileWidth / REFERENCE_TILE_WIDTH)) : 1;
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.floor(e.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <View style={[styles.grid, { gap }]} onLayout={onLayout}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.action,
            shadow.card,
            tileWidth > 0 ? { width: tileWidth } : null,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              paddingVertical: Math.round(spacing.lg * scale),
              paddingHorizontal: Math.round(spacing.sm * scale),
              minHeight: Math.round((touchTarget.large + 24) * scale),
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor: action.toneMuted,
                borderRadius: radius.md,
                marginBottom: Math.round(spacing.sm * scale),
                width: Math.round(42 * scale),
                height: Math.round(42 * scale),
              },
            ]}
          >
            <Ionicons name={action.icon} size={Math.round(22 * scale)} color={action.tone} />
          </View>
          <Text
            style={[
              typography.caption,
              {
                color: colors.text,
                textAlign: "center",
                fontWeight: "600",
                fontSize: Math.max(11, Math.round((typography.caption.fontSize ?? 13) * scale)),
              },
            ]}
            numberOfLines={2}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const COLUMNS = 3;
// A tile this wide (or wider) gets the full-size icon and text; narrower screens scale down to 70%.
const REFERENCE_TILE_WIDTH = 104;

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  // Fallback until the row is measured (first frame); replaced by an exact pixel width.
  action: { width: "30%", alignItems: "center", justifyContent: "center" },
  iconTile: { alignItems: "center", justifyContent: "center" },
});
