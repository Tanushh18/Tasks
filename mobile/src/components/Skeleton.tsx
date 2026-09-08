import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/useTheme";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Placeholder block shown while data loads.
 *
 * Money screens must never render a real-looking `₹0` or "0 tasks" before the answer arrives —
 * a zero balance is meaningful information, and showing it speculatively is worse than showing
 * nothing (spec §86).
 */
export function Skeleton({ width = "100%", height = 16, style }: SkeletonProps) {
  const { colors, radius } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    // Respect the OS "reduce motion" setting rather than pulsing regardless (spec §78).
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled || reduceMotion) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.skeleton, opacity: pulse }, style]}
    />
  );
}

/** A few stacked skeleton lines, for list and card placeholders. */
export function SkeletonLines({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={style}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          height={16}
          width={index === count - 1 ? "60%" : "100%"}
          style={{ marginBottom: index === count - 1 ? 0 : spacing.sm }}
        />
      ))}
    </View>
  );
}

/** Card-shaped placeholder — matches the real Card's radius, padding and shadow footprint. */
export function SkeletonCard({ lines = 2, showAvatar, style }: { lines?: number; showAvatar?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing, radius, shadow } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[
        skeletonStyles.card,
        shadow.card,
        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
        style,
      ]}
    >
      {showAvatar ? <Skeleton width={44} height={44} style={{ borderRadius: 22, marginRight: spacing.md }} /> : null}
      <View style={skeletonStyles.cardBody}>
        <Skeleton height={18} width="55%" />
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            height={14}
            width={index === lines - 1 ? "40%" : "85%"}
            style={{ marginTop: spacing.sm }}
          />
        ))}
      </View>
    </View>
  );
}

/** A stack of card placeholders, for any list screen's first paint. */
export function SkeletonList({ count = 4, showAvatar }: { count?: number; showAvatar?: boolean }) {
  const { spacing } = useTheme();
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} showAvatar={showAvatar} style={{ marginBottom: spacing.md }} />
      ))}
    </View>
  );
}

/** Chart placeholder — a baseline of bars, so the layout doesn't jump when data lands. */
export function SkeletonChart({ bars = 6, height = 140 }: { bars?: number; height?: number }) {
  const { colors, spacing, radius, shadow } = useTheme();
  // Fixed pattern rather than random, so it doesn't reshuffle on every re-render.
  const heightRatios = [0.45, 0.75, 0.55, 0.9, 0.65, 0.8, 0.5, 0.7];

  return (
    <View
      accessibilityLabel="Loading chart"
      accessibilityRole="progressbar"
      style={[
        shadow.card,
        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
      ]}
    >
      <Skeleton height={16} width="40%" />
      <View style={[skeletonStyles.chartRow, { height, marginTop: spacing.lg, gap: spacing.sm }]}>
        {Array.from({ length: bars }).map((_, index) => (
          <Skeleton
            key={index}
            height={Math.round(height * heightRatios[index % heightRatios.length])}
            style={{ flex: 1 }}
          />
        ))}
      </View>
    </View>
  );
}

export const skeletonStyles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start" },
  cardBody: { flex: 1 },
  chartRow: { flexDirection: "row", alignItems: "flex-end" },
});
