import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/useTheme";
import { getCategoricalColor } from "../../theme/categoricalPalette";
import { formatCurrency } from "../../utils/currency";

export interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  emptyLabel?: string;
}

/**
 * Part-to-whole breakdown as horizontal bars — categorical color job, direct labels on every row
 * (never color-alone identity), 2px surface gap between bars, 4px rounded growing-end per the
 * dataviz skill's mark spec.
 */
export function HorizontalBarList({ data, emptyLabel = "No data yet" }: Props) {
  const { colors, spacing, radius, typography, isDark } = useTheme();

  if (data.length === 0) {
    return <Text style={[typography.body, { color: colors.textMuted }]}>{emptyLabel}</Text>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View>
      {data.map((item, index) => {
        const color = item.label === "Other" ? colors.textFaint : getCategoricalColor(index, isDark);
        const widthPct = Math.max((item.value / max) * 100, 3);
        return (
          <View key={item.label} style={{ marginBottom: spacing.md }}>
            <View style={styles.labelRow}>
              <View style={styles.labelLeft}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatCurrency(item.value)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${widthPct}%`, backgroundColor: color, borderRadius: radius.pill },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  labelLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1, marginRight: 8, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 10, overflow: "hidden" },
  fill: { height: 10 },
});
