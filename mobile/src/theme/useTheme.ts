import { useColorScheme } from "react-native";
import { darkColors, lightColors } from "./colors";
import { darkFeatureColors, lightFeatureColors, type FeatureName } from "./featureColors";
import { radius, shadow, spacing, touchTarget, typography } from "./spacing";

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = isDark ? darkColors : lightColors;
  const feature = isDark ? darkFeatureColors : lightFeatureColors;
  return { colors, feature, spacing, radius, typography, touchTarget, shadow, isDark };
}

export type Theme = ReturnType<typeof useTheme>;
export type { FeatureName };
