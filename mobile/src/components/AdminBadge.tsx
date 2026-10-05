import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  style?: StyleProp<ViewStyle>;
}

/** Small "ADMIN" pill marking a screen, row or button that only admins can see. */
export function AdminBadge({ style }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Admin only"
      style={[
        styles.badge,
        { backgroundColor: colors.primaryMuted, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
        style,
      ]}
    >
      <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
      <Text style={[typography.captionStrong, { color: colors.primary, marginLeft: 4 }]}>ADMIN</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center" },
});
