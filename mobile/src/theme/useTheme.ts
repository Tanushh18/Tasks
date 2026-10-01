import { useContext } from "react";
import { useColorScheme } from "react-native";
import { darkColors, darkNoteTints, lightColors, lightNoteTints, midnightColors } from "./colors";
import { darkFeatureColors, lightFeatureColors, type FeatureName } from "./featureColors";
import { radius, shadow, spacing, touchTarget, typography } from "./spacing";
import { ThemeModeContext, type ThemeMode } from "./ThemeProvider";

/** The palette actually on screen once "system" has been resolved. */
export type ThemeName = "light" | "dark" | "midnight";

const PALETTES = { light: lightColors, dark: darkColors, midnight: midnightColors } as const;

export function resolveThemeName(mode: ThemeMode, scheme: string | null | undefined): ThemeName {
  if (mode === "system") return scheme === "dark" ? "dark" : "light";
  return mode;
}

export function useTheme() {
  const scheme = useColorScheme();
  const ctx = useContext(ThemeModeContext);
  const mode: ThemeMode = ctx?.mode ?? "system";
  const name = resolveThemeName(mode, scheme);
  const isDark = name !== "light";
  const colors = PALETTES[name];
  const feature = isDark ? darkFeatureColors : lightFeatureColors;
  const noteTints = isDark ? darkNoteTints : lightNoteTints;
  return {
    colors,
    feature,
    noteTints,
    spacing,
    radius,
    typography,
    touchTarget,
    // Drop shadows vanish on dark backgrounds and only muddy the edges, so dark themes rely on borders.
    shadow: isDark ? { card: {}, raised: {} } : shadow,
    isDark,
    themeName: name,
    themeMode: mode,
    setThemeMode: ctx?.setMode ?? (() => undefined),
  };
}

export type Theme = ReturnType<typeof useTheme>;
export type { FeatureName, ThemeMode };
