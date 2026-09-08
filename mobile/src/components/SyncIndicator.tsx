import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSyncStatus, type SyncState } from "../offline/useSyncStatus";
import { useTheme } from "../theme/useTheme";

interface Props {
  /** Opens the Sync Center, so a worried user can see exactly what's waiting. */
  onPress?: () => void;
  /** Hides the pill entirely while everything is synced, for busy screens. */
  hideWhenSynced?: boolean;
}

/**
 * Small always-available sync pill (spec §24).
 *
 * Offline is presented as a state, not an error — this app is built to work
 * without a connection, so the copy says what will happen ("changes will sync
 * automatically"), never "failed". Status is carried by an icon and a word,
 * not by the dot colour alone.
 */
export function SyncIndicator({ onPress, hideWhenSynced }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { state, pendingCount } = useSyncStatus();

  if (hideWhenSynced && state === "synced") return null;

  const config: Record<SyncState, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; tone: string; fill: string }> = {
    synced: { label: "Synced", icon: "checkmark-circle", tone: colors.success, fill: colors.successMuted },
    syncing: { label: "Syncing", icon: "sync", tone: colors.warning, fill: colors.warningMuted },
    pending: {
      label: `${pendingCount} waiting`,
      icon: "time-outline",
      tone: colors.warning,
      fill: colors.warningMuted,
    },
    offline: { label: "Offline", icon: "cloud-offline", tone: colors.textMuted, fill: colors.surfaceAlt },
  };

  const { label, icon, tone, fill } = config[state];

  const content = (
    <View
      style={[
        styles.pill,
        { backgroundColor: fill, borderRadius: radius.pill, paddingHorizontal: spacing.md, gap: 6 },
      ]}
    >
      {state === "syncing" ? (
        <ActivityIndicator size="small" color={tone} />
      ) : (
        <Ionicons name={icon} size={14} color={tone} />
      )}
      <Text style={[typography.caption, { color: tone, fontWeight: "600" }]}>{label}</Text>
    </View>
  );

  if (!onPress) {
    return <View accessibilityLabel={`Sync status: ${label}`}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Open sync details.`}
      hitSlop={8}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Full-width reassurance banner for when the device is offline or has a
 * backlog. Deliberately warm rather than alarming — the data is safe.
 */
export function SyncBanner({ onViewPending }: { onViewPending?: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const { state, pendingCount } = useSyncStatus();

  if (state === "synced" || state === "syncing") return null;

  const message =
    state === "offline"
      ? `You're offline.${pendingCount > 0 ? ` ${pendingCount} change${pendingCount === 1 ? "" : "s"} will sync automatically when you're back.` : " Changes will sync automatically when you're back online."}`
      : `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync.`;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.warningMuted,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
      <Text style={[typography.caption, { color: colors.warning, flex: 1 }]}>{message}</Text>
      {onViewPending && pendingCount > 0 ? (
        <Pressable onPress={onViewPending} accessibilityRole="button" accessibilityLabel="View pending changes" hitSlop={8}>
          <Text style={[typography.captionStrong, { color: colors.warning, textDecorationLine: "underline" }]}>
            View
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  banner: { flexDirection: "row", alignItems: "center" },
});
