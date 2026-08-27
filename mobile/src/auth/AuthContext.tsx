import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth";
import { discardLegacyQueue } from "../offline/offlineQueue";
import { setStorageScope } from "../offline/scope";
import type { User } from "../types/models";
import { endSession, registerSessionExpiredHandler, restoreSession, setSessionTokens } from "./sessionStore";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  register: (mobileNumber: string, mpin: string, confirmMpin: string) => Promise<void>;
  login: (mobileNumber: string, mpin: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Every setUser goes through here so the storage scope can never drift from the signed-in user:
  // locally cached data (offline queue, dashboard cache) is keyed by it, and a stale scope would
  // hand one account's data to another.
  const applyUser = useCallback((next: User | null) => {
    setStorageScope(next?.id ?? null);
    setUser(next);
  }, []);

  useEffect(() => {
    registerSessionExpiredHandler(() => applyUser(null));

    (async () => {
      // One-time cleanup of the shared, pre-namespacing queue.
      await discardLegacyQueue().catch(() => undefined);

      const tokens = await restoreSession();
      if (tokens) {
        try {
          const me = await authApi.fetchMe();
          applyUser(me);
        } catch {
          await endSession();
          applyUser(null);
        }
      }
      setIsLoading(false);
    })();
  }, [applyUser]);

  const register = useCallback(
    async (mobileNumber: string, mpin: string, confirmMpin: string) => {
      const result = await authApi.register(mobileNumber, mpin, confirmMpin);
      await setSessionTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      applyUser(result.user);
    },
    [applyUser]
  );

  const login = useCallback(
    async (mobileNumber: string, mpin: string) => {
      const result = await authApi.login(mobileNumber, mpin);
      await setSessionTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      applyUser(result.user);
    },
    [applyUser]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // even if the server call fails, clear the local session
    }
    await endSession();
    applyUser(null);
  }, [applyUser]);

  const refreshUser = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  const updateUser = useCallback((next: User) => setUser(next), []);

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticated: Boolean(user), register, login, logout, refreshUser, updateUser }),
    [user, isLoading, register, login, logout, refreshUser, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
