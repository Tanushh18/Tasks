import { useColorScheme } from "react-native";
import { darkColors, lightColors } from "./colors";
import { radius, shadow, spacing, touchTarget, typography } from "./spacing";

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? darkColors : lightColors;
  return { colors, spacing, radius, typography, touchTarget, shadow, isDark: scheme === "dark" };
}

export type Theme = ReturnType<typeof useTheme>;
