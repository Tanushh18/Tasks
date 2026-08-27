import React, { useCallback, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/useTheme";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "regular" | "large";

interface Props {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Spoken by screen readers when the visible label needs more context. */
  accessibilityLabel?: string;
  /** Longer explanation of the outcome, e.g. "Saves this expense to Home". */
  accessibilityHint?: string;
}

/** Blocks a second press landing before the first one's work finishes. */
const DOUBLE_PRESS_GUARD_MS = 600;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "regular",
  loading,
  disabled,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { colors, radius, spacing, typography, touchTarget } = useTheme();
  const lastPressAt = useRef(0);

  // Creating a task or saving money twice because of a double tap is a real, visible bug
  // (spec §114), and `loading` alone doesn't cover the window before state updates.
  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastPressAt.current < DOUBLE_PRESS_GUARD_MS) return;
    lastPressAt.current = now;
    void onPress();
  }, [onPress]);

  const backgrounds: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceAlt,
    danger: colors.danger,
    ghost: "transparent",
  };
  const textColors: Record<Variant, string> = {
    primary: colors.onPrimary,
    secondary: colors.text,
    danger: colors.onDanger,
    ghost: colors.primary,
  };

  const isDisabled = Boolean(disabled || loading);
  const minHeight = size === "large" ? touchTarget.large : touchTarget.comfortable;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: backgrounds[variant],
          borderRadius: radius.md,
          paddingVertical: size === "large" ? spacing.lg : spacing.md,
          paddingHorizontal: spacing.lg,
          minHeight,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColors[variant]} />
      ) : (
        <Text
          style={[
            size === "large" ? typography.h3 : typography.bodyStrong,
            { color: textColors[variant], textAlign: "center" },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
});
