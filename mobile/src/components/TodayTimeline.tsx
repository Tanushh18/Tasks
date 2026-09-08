import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { formatTimeLabel } from "../utils/date";

export type TimelineKind = "task" | "reminder" | "expense" | "income";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** "HH:mm" — used for both ordering and the displayed time. */
  time: string;
  title: string;
  /** Who it involves, the account, the category — one short line. */
  detail?: string;
  /** Right-aligned figure, already formatted (e.g. "₹850"). */
  amount?: string;
  done?: boolean;
  onPress?: () => void;
}

/**
 * One chronological view of the family's day — tasks, reminders and money in
 * a single column, rather than three separate lists the reader has to merge
 * in their head.
 */
export function TodayTimeline({ entries }: { entries: TimelineEntry[] }) {
  const { colors, spacing, radius, typography, feature, touchTarget } = useTheme();

  const styleFor = (kind: TimelineKind) => {
    switch (kind) {
      case "task":
        return { icon: "checkmark-circle-outline" as const, tone: feature.tasks.solid, fill: feature.tasks.muted };
      case "reminder":
        return { icon: "alarm-outline" as const, tone: feature.tasks.solid, fill: feature.tasks.muted };
      case "expense":
        return { icon: "arrow-up-circle-outline" as const, tone: colors.danger, fill: colors.dangerMuted };
      case "income":
        return { icon: "arrow-down-circle-outline" as const, tone: colors.success, fill: colors.successMuted };
    }
  };

  return (
    <View>
      {entries.map((entry, index) => {
        const { icon, tone, fill } = styleFor(entry.kind);
        const isLast = index === entries.length - 1;

        const row = (
          <View style={styles.row}>
            {/* Rail: the dot plus the line joining it to the next entry. */}
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: fill, borderRadius: radius.pill }]}>
                <Ionicons name={icon} size={16} color={tone} />
              </View>
              {!isLast ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
            </View>

            <View style={[styles.body, { paddingBottom: isLast ? 0 : spacing.lg, marginLeft: spacing.md }]}>
              <Text style={[typography.caption, { color: colors.textFaint }]}>{formatTimeLabel(entry.time)}</Text>
              <View style={styles.titleRow}>
                <Text
                  style={[
                    typography.bodyStrong,
                    {
                      color: colors.text,
                      flex: 1,
                      textDecorationLine: entry.done ? "line-through" : "none",
                      opacity: entry.done ? 0.6 : 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {entry.title}
                </Text>
                {entry.amount ? (
                  <Text style={[typography.bodyStrong, { color: tone, marginLeft: spacing.sm }]}>{entry.amount}</Text>
                ) : null}
              </View>
              {entry.detail ? (
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                  {entry.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );

        if (!entry.onPress) return <View key={entry.id}>{row}</View>;

        return (
          <Pressable
            key={entry.id}
            onPress={entry.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${formatTimeLabel(entry.time)}, ${entry.title}${entry.amount ? `, ${entry.amount}` : ""}${entry.detail ? `, ${entry.detail}` : ""}`}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, minHeight: touchTarget.min }]}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Merges separate sources into one ordered day. Entries without a time sort last. */
export function buildTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch" },
  rail: { alignItems: "center", width: 32 },
  dot: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginTop: 4 },
  body: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
});
