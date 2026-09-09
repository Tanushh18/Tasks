import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFeatures, type FeatureFlags } from "../api/features";
import { useAuth } from "../auth/AuthContext";
import { subscribeToReconnect } from "../offline/useOfflineSync";

const ALL_ON: FeatureFlags = {
  contacts: true,
  chat: true,
  ocr: true,
  location: true,
  assistant: true,
  notes: true,
  groupExpenses: true,
  documentVault: true,
  householdInventory: true,
  emergencyInfo: true,
  familyEvents: true,
  shoppingLists: true,
  recurringPayments: true,
  familyGoals: true,
};

interface FeatureFlagsContextValue {
  flags: FeatureFlags;
  loading: boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | undefined>(undefined);

/**
 * Defaults every flag to `true` while loading (and if the fetch fails) so nothing is hidden
 * incorrectly before the first successful fetch — mirrors AuthContext's "assume optimistic state
 * until proven otherwise" approach to its own initial loading.
 */
export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>(ALL_ON);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const result = await getFeatures();
      setFlags(result);
    } catch {
      // Keep the last known (or all-on default) flags on failure — this is a UI gate, not a
      // critical path, and hiding everything on a transient error would be worse than showing it.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      void refresh();
    } else {
      setFlags(ALL_ON);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  useEffect(() => subscribeToReconnect(refresh), [refresh]);

  const value = useMemo(() => ({ flags, loading, refresh }), [flags, loading, refresh]);

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error("useFeatureFlags must be used within FeatureFlagsProvider");
  return ctx;
}
