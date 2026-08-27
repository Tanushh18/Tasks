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

export const skeletonStyles = StyleSheet.create({});
