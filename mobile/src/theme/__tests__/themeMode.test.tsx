import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { darkColors, lightColors, midnightColors, type ColorPalette } from "../colors";
import { ThemeProvider } from "../ThemeProvider";
import { resolveThemeName, useTheme, type Theme } from "../useTheme";

let latest: Theme;
function Probe() {
  latest = useTheme();
  return <Text>{latest.themeName}</Text>;
}

// Relative luminance / contrast ratio (WCAG 2.x).
function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("theme mode", () => {
  it("resolves 'system' from the phone and keeps explicit choices", () => {
    expect(resolveThemeName("system", "dark")).toBe("dark");
    expect(resolveThemeName("system", "light")).toBe("light");
    expect(resolveThemeName("system", null)).toBe("light");
    expect(resolveThemeName("midnight", "light")).toBe("midnight");
    expect(resolveThemeName("light", "dark")).toBe("light");
  });

  it("works without a provider (falls back to the phone setting)", async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Probe />);
    });
    expect(["light", "dark"]).toContain(latest.themeName);
    await act(async () => r.unmount());
  });

  it("switches palettes and remembers the choice", async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });
    await act(async () => latest.setThemeMode("midnight"));
    expect(latest.themeName).toBe("midnight");
    expect(latest.isDark).toBe(true);
    expect(latest.colors.background).toBe("#000000");
    expect(await AsyncStorage.getItem("app.themeMode")).toBe("midnight");

    await act(async () => latest.setThemeMode("light"));
    expect(latest.colors).toBe(lightColors);
    expect(latest.isDark).toBe(false);
    await act(async () => r.unmount());

    // A fresh launch picks the saved mode back up.
    await AsyncStorage.setItem("app.themeMode", "dark");
    await act(async () => {
      r = TestRenderer.create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });
    expect(latest.themeName).toBe("dark");
    expect(latest.colors).toBe(darkColors);
    await act(async () => r.unmount());
  });

  it.each([
    ["light", lightColors],
    ["dark", darkColors],
    ["midnight", midnightColors],
  ] as [string, ColorPalette][])("%s palette keeps text readable (WCAG AA)", (_name, c) => {
    expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.textMuted, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.primary, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onDanger, c.danger)).toBeGreaterThanOrEqual(4.5);
  });
});
