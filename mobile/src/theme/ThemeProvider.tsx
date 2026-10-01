import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";

/** What the person picked in Settings. "system" follows the phone's light/dark setting. */
export type ThemeMode = "system" | "light" | "dark" | "midnight";

const STORAGE_KEY = "app.themeMode";
const MODES: ThemeMode[] = ["system", "light", "dark", "midnight"];

interface ThemeModeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && (MODES as string[]).includes(saved)) setModeState(saved as ThemeMode);
      })
      .catch(() => undefined);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}
