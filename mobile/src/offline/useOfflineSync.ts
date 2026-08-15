import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { flushQueue } from "./offlineQueue";

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
        void flushQueue();
      }
    });
    return unsubscribe;
  }, []);
}
