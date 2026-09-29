import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { Skeleton } from "./Skeleton";

export interface LeadCount {
  status: string;
  count: number;
}

interface LeadStatCardProps {
  counts: LeadCount[];
  totalLeads: number;
  onPress: () => void;
  /** While true, placeholders stand in for the figures — a speculative "0" would read as fact. */
  loading?: boolean;
}

export function LeadStatCard({ counts, totalLeads, onPress, loading = false }: LeadStatCardProps) {
  const { colors, typography, spacing, radius, shadow, feature } = useTheme();
  const topCounts = counts.slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lead tracker. ${totalLeads} active leads. Opens the lead tracker.`}
      style={({ pressed }) => [
        styles.card,
        shadow.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginTop: spacing.xl,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: feature.leads.muted, borderRadius: radius.md }]}>
          <Ionicons name="people" size={22} color={feature.leads.solid} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Lead tracker</Text>
          {loading ? (
            <Skeleton width={90} height={28} style={{ marginTop: 4 }} />
          ) : (
            <Text style={[typography.h1, { color: colors.text }]}>
              {totalLeads} <Text style={[typography.body, { color: colors.textMuted }]}>active</Text>
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </View>

      {loading ? (
        <Skeleton height={44} style={{ marginTop: spacing.md }} />
      ) : topCounts.length > 0 ? (
        <View style={[styles.breakdown, { marginTop: spacing.md, gap: spacing.sm }]}>
          {topCounts.map((item) => (
            <View
              key={item.status}
              style={[styles.chip, { backgroundColor: feature.leads.muted, borderRadius: radius.md }]}
            >
              <Text style={[typography.bodyStrong, { color: feature.leads.solid }]}>{item.count}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {item.status}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.md }]}>
          No leads yet. Connect a Google Sheet to import them.
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: "row", alignItems: "center" },
  iconTile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  breakdown: { flexDirection: "row" },
  chip: { flex: 1, paddingVertical: 8, paddingHorizontal: 10 },
});
