import { useEffect, useState } from "react";
import { getPendingCount, isSyncing, subscribeToQueueChanges } from "./offlineQueue";
import { useOnlineStatus } from "./useOnlineStatus";

export type SyncState = "synced" | "syncing" | "offline" | "pending";

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  isOnline: boolean;
}

/**
 * The single source of truth for the sync pill and the offline banner.
 *
 * `pending` is deliberately distinct from `offline`: you can be back online
 * with items still queued (a flush hasn't run yet, or some item failed), and
 * showing that as "synced" would be a lie about where the family's data is.
 */
export function useSyncStatus(): SyncStatus {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      void getPendingCount().then((count) => {
        if (cancelled) return;
        setPendingCount(count);
        setSyncing(isSyncing());
      });
    };

    refresh();
    const unsubscribe = subscribeToQueueChanges(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const state: SyncState = !isOnline
    ? "offline"
    : syncing
      ? "syncing"
      : pendingCount > 0
        ? "pending"
        : "synced";

  return { state, pendingCount, isOnline };
}
