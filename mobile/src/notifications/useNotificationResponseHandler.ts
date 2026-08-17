import notifee, { EventType } from "@notifee/react-native";
import { useEffect } from "react";
import { navigateToTask } from "../navigation/navigationRef";
import { handleNotificationActionEvent } from "./handleNotificationEvent";
import { ACTION_OPEN } from "./notificationService";

function shouldOpenTask(type: EventType, pressActionId: string | undefined): boolean {
  return type === EventType.PRESS || pressActionId === ACTION_OPEN || pressActionId === "default";
}

/** Wires up Mark Complete / Snooze / Open Task notification actions to the task API and
 * navigation, for both a cold start (app launched by tapping the alarm) and while running. */
export function useNotificationResponseHandler(): void {
  useEffect(() => {
    notifee.getInitialNotification().then((initial) => {
      const taskId = initial?.notification.data?.taskId as string | undefined;
      if (taskId) navigateToTask(taskId);
    });

    const unsubscribe = notifee.onForegroundEvent(async (event) => {
      const taskId = event.detail.notification?.data?.taskId as string | undefined;

      if (shouldOpenTask(event.type, event.detail.pressAction?.id) && taskId) {
        navigateToTask(taskId);
        return;
      }

      await handleNotificationActionEvent(event);
    });

    return unsubscribe;
  }, []);
}
