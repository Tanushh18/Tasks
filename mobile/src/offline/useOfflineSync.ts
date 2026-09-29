import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { sendQueuedWrite } from "../api/client";
import { bypassCacheBriefly } from "./httpCache";
import { flushHttpQueue } from "./httpQueue";
import { flushQueue } from "./offlineQueue";

/** Small module-level pub/sub other screens can use to refetch once the queue has flushed after
 * reconnecting — deliberately not Node's `events` module, which nothing else in this codebase
 * uses; a plain callback array is the smallest addition that does the job in React Native. */
const reconnectSubscribers = new Set<() => void>();

export function subscribeToReconnect(cb: () => void): () => void {
  reconnectSubscribers.add(cb);
  return () => {
    reconnectSubscribers.delete(cb);
  };
}

function notifyReconnectSubscribers(): void {
  reconnectSubscribers.forEach((cb) => cb());
}

/** Flushes the offline mutation queue whenever connectivity is (re)gained — on app start if
 * already online, and again every time the device transitions from offline to online. */
export function useOfflineSync(): void {
  const wasOnline = useRef<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected !== false && state.isInternetReachable !== false;
      const cameBackOnline = wasOnline.current === false && isOnline;
      const firstCheckOnline = wasOnline.current === null && isOnline;
      wasOnline.current = isOnline;

      if (cameBackOnline || firstCheckOnline) {
        // Anything shown while offline came from the on-device copy, so refetch for real once the
        // queued writes have landed. (First launch already online is left to the normal
        // fresh-cache rules — no need to force a server call just for opening the app.)
        void Promise.all([flushQueue(), flushHttpQueue(sendQueuedWrite)]).then(() => {
          if (cameBackOnline) bypassCacheBriefly();
          notifyReconnectSubscribers();
        });
      }
    });
    return unsubscribe;
  }, []);
}
