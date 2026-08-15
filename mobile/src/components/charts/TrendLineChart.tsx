import React, { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";

export interface TrendPoint {
  month: string; // e.g. "2026-08"
  cashIn: number;
  cashOut: number;
}

interface Props {
  data: TrendPoint[];
}

const HEIGHT = 180;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 8;

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short" });
}

function buildPath(values: number[], width: number, max: number): string {
  const usableHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = PADDING_TOP + usableHeight - (max > 0 ? (v / max) * usableHeight : 0);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

/** Trend over time — sequential line chart. Cash in / cash out use this app's fixed semantic
 * success/danger colors throughout, not the generic categorical ramp, since that mapping is
 * already the app-wide convention for money in vs money out. */
export function TrendLineChart({ data }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [width, setWidth] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const max = Math.max(...data.map((d) => Math.max(d.cashIn, d.cashOut)), 1);
  const usableHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const inPath = width ? buildPath(data.map((d) => d.cashIn), width, max) : "";
  const outPath = width ? buildPath(data.map((d) => d.cashOut), width, max) : "";
  const stepX = width && data.length > 1 ? width / (data.length - 1) : 0;

  const lastIn = data[data.length - 1]?.cashIn ?? 0;
  const lastOut = data[data.length - 1]?.cashOut ?? 0;
  const lastX = (data.length - 1) * stepX;
  const lastInY = PADDING_TOP + usableHeight - (max > 0 ? (lastIn / max) * usableHeight : 0);
  const lastOutY = PADDING_TOP + usableHeight - (max > 0 ? (lastOut / max) * usableHeight : 0);

  return (
    <View>
      <View style={[styles.legendRow, { marginBottom: spacing.sm }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>Cash In</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>Cash Out</Text>
        </View>
      </View>

      <View onLayout={onLayout} style={{ height: HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {[0, 0.5, 1].map((fraction) => {
              const y = PADDING_TOP + usableHeight * (1 - fraction);
              return (
                <Line key={fraction} x1={0} y1={y} x2={width} y2={y} stroke={colors.border} strokeWidth={1} />
              );
            })}
            <Path d={inPath} stroke={colors.success} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Path d={outPath} stroke={colors.danger} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={lastX} cy={lastInY} r={4} fill={colors.success} stroke={colors.surface} strokeWidth={2} />
            <Circle cx={lastX} cy={lastOutY} r={4} fill={colors.danger} stroke={colors.surface} strokeWidth={2} />
          </Svg>
        ) : null}
      </View>

      <View style={styles.axisRow}>
        {data.map((d) => (
          <Text key={d.month} style={[typography.caption, { color: colors.textFaint, flex: 1, textAlign: "center" }]}>
            {monthLabel(d.month)}
          </Text>
        ))}
      </View>

      <View style={[styles.endLabels, { marginTop: spacing.sm }]}>
        <Text style={[typography.captionStrong, { color: colors.success }]}>{formatCurrency(lastIn)}</Text>
        <Text style={[typography.captionStrong, { color: colors.danger }]}>{formatCurrency(lastOut)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: "row", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  axisRow: { flexDirection: "row" },
  endLabels: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
});
