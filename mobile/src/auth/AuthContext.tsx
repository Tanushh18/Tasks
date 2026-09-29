import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth";
import { discardLegacyQueue } from "../offline/offlineQueue";
import { setStorageScope } from "../offline/scope";
import type { User } from "../types/models";
import {
  endSession,
  getRefreshToken,
  registerSessionExpiredHandler,
  restoreSession,
  setSessionTokens,
} from "./sessionStore";
import {
  saveUser,
  loadUser,
  clearUser,
  saveBiometricEnabled,
  loadBiometricEnabled,
  clearBiometricEnabled,
} from "./tokenStorage";
import { getBiometricCapability } from "./useBiometrics";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** True once signed in with `mustChangeMpin` still set — gates the app behind ChangeMpin until cleared. */
  needsMpinChange: boolean;
  register: (name: string, mobileNumber: string, mpin: string, confirmMpin: string) => Promise<void>;
  login: (mobileNumber: string, mpin: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
  /** Called once the forced MPIN change succeeds, to let the user into the app. */
  clearMustChangeMpin: () => void;
  /** True only right after a brand-new registration in this session — gates the one-time setup screen. */
  justRegistered: boolean;
  /** Called once the first-time setup screen is dismissed, to let the user into the main app. */
  clearJustRegistered: () => void;
  /** True when the session is restored but biometric verification is still pending. */
  isBiometricLocked: boolean;
  /** Whether biometric unlock is enabled for this device. */
  biometricEnabled: boolean;
  /** Marks the session as unlocked after a successful biometric prompt. */
  unlockWithBiometric: () => void;
  /** Enable biometric unlock (call after confirming with the user). */
  enableBiometric: () => Promise<void>;
  /** Disable biometric unlock. */
  disableBiometric: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** False once the API client has discarded the tokens because the server refused them. */
function tokensSurvive(): boolean {
  return getRefreshToken() !== null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [justRegistered, setJustRegistered] = useState(false);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // Every setUser goes through here so the storage scope can never drift from the signed-in user:
  // locally cached data (offline queue, dashboard cache) is keyed by it, and a stale scope would
  // hand one account's data to another.
  const applyUser = useCallback((next: User | null) => {
    setStorageScope(next?.id ?? null);
    setUser(next);
  }, []);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      void clearUser();
      applyUser(null);
    });

    (async () => {
      // One-time cleanup of the shared, pre-namespacing queue.
      await discardLegacyQueue().catch(() => undefined);

      const tokens = await restoreSession();
      if (tokens) {
        const [cachedUser, bioEnabled] = await Promise.all([loadUser(), loadBiometricEnabled()]);
        setBiometricEnabled(bioEnabled);
        if (cachedUser) {
          // Open straight into the app from the saved session — no waiting on the server, which
          // can take 30s+ to wake up. The profile is refreshed quietly in the background; if the
          // server ever refuses the session, the API client signs the user out through the
          // session-expired handler above. A network failure changes nothing.
          applyUser(cachedUser);
          if (bioEnabled) {
            // Session is live but needs biometric verification before entering the app.
            setIsBiometricLocked(true);
          }
          setIsLoading(false);
          authApi
            .fetchMe()
            .then(async (me) => {
              if (!tokensSurvive()) return;
              applyUser(me);
              await saveUser(me);
            })
            .catch(() => undefined);
          return;
        }

        // First launch after upgrading (no saved profile yet): the server has to be asked once.
        try {
          const me = await authApi.fetchMe();
          applyUser(me);
          await saveUser(me);
        } catch {
          if (!tokensSurvive()) {
            await clearUser();
            applyUser(null);
          } else {
            // Signed in, but unreachable right now and nothing saved locally to show. Keep the
            // tokens and let the login screen take over rather than discarding the session.
            applyUser(null);
          }
        }
      }
      setIsLoading(false);
    })();
  }, [applyUser]);

  const register = useCallback(
    async (name: string, mobileNumber: string, mpin: string, confirmMpin: string) => {
      const result = await authApi.register(name, mobileNumber, mpin, confirmMpin);
      await setSessionTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      await saveUser(result.user);
      setJustRegistered(true);
      applyUser(result.user);
    },
    [applyUser]
  );

  const login = useCallback(
    async (mobileNumber: string, mpin: string) => {
      const result = await authApi.login(mobileNumber, mpin);
      await setSessionTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      await saveUser(result.user);
      applyUser(result.user);
    },
    [applyUser]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout(getRefreshToken());
    } catch {
      // even if the server call fails, clear the local session
    }
    await endSession();
    await clearUser();
    await clearBiometricEnabled();
    setBiometricEnabled(false);
    setIsBiometricLocked(false);
    applyUser(null);
  }, [applyUser]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.fetchMe();
      setUser(me);
      await saveUser(me);
    } catch (err) {
      const isUnauthorized =
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as any).response?.status === 401;
      if (isUnauthorized) {
        await endSession();
      }
    }
  }, []);

  const updateUser = useCallback((next: User) => {
    setUser(next);
    void saveUser(next).catch(() => undefined);
  }, []);

  const clearMustChangeMpin = useCallback(() => {
    setUser((prev) => {
      const next = prev ? { ...prev, mustChangeMpin: false } : prev;
      if (next) void saveUser(next).catch(() => undefined);
      return next;
    });
  }, []);

  const clearJustRegistered = useCallback(() => {
    setJustRegistered(false);
  }, []);

  const unlockWithBiometric = useCallback(() => {
    setIsBiometricLocked(false);
  }, []);

  const enableBiometric = useCallback(async () => {
    const cap = await getBiometricCapability();
    if (!cap.available) throw new Error("Biometrics not available on this device");
    await saveBiometricEnabled(true);
    setBiometricEnabled(true);
  }, []);

  const disableBiometric = useCallback(async () => {
    await clearBiometricEnabled();
    setBiometricEnabled(false);
  }, []);

  const needsMpinChange = Boolean(user?.mustChangeMpin);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      needsMpinChange,
      register,
      login,
      logout,
      refreshUser,
      updateUser,
      clearMustChangeMpin,
      justRegistered,
      clearJustRegistered,
      isBiometricLocked,
      biometricEnabled,
      unlockWithBiometric,
      enableBiometric,
      disableBiometric,
    }),
    [
      user,
      isLoading,
      needsMpinChange,
      register,
      login,
      logout,
      refreshUser,
      updateUser,
      clearMustChangeMpin,
      justRegistered,
      clearJustRegistered,
      isBiometricLocked,
      biometricEnabled,
      unlockWithBiometric,
      enableBiometric,
      disableBiometric,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
