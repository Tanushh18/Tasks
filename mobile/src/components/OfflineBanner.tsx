import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  cachedAt?: string | null;
  pendingCount?: number;
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function OfflineBanner({ cachedAt, pendingCount }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.warningMuted,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginBottom: spacing.lg,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
      <Text style={[typography.caption, { color: colors.warning, marginLeft: spacing.sm, flex: 1 }]}>
        {"You're offline"}
        {cachedAt ? ` — showing data from ${timeAgo(cachedAt)}` : ""}
        {pendingCount ? `. ${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync.` : ""}
      </Text>
    </View>
  );
}
