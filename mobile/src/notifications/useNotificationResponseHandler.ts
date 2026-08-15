import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import * as tasksApi from "../api/tasks";
import { navigateToTask } from "../navigation/navigationRef";
import { ACTION_COMPLETE, ACTION_SNOOZE, snoozeReminder } from "./notificationService";

/** Wires up Mark Complete / Snooze / Open Task notification actions to the task API and navigation. */
export function useNotificationResponseHandler(): void {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const taskId = response.notification.request.content.data?.taskId as string | undefined;
      if (!taskId) return;

      const actionId = response.actionIdentifier;

      try {
        if (actionId === ACTION_COMPLETE) {
          await tasksApi.setTaskCompleted(taskId, true);
          return;
        }
        if (actionId === ACTION_SNOOZE) {
          const task = await tasksApi.getTask(taskId);
          const notificationId = await snoozeReminder(task, 10);
          await tasksApi.setTaskNotificationId(taskId, notificationId);
          return;
        }
        // Default tap (Notifications.DEFAULT_ACTION_IDENTIFIER) or explicit "Open Task"
        navigateToTask(taskId);
      } catch {
        // Best-effort: notification actions shouldn't crash the app if the network call fails.
      }
    });

    return () => subscription.remove();
  }, []);
}
