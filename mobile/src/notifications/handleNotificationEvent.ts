import notifee, { type Event, EventType } from "@notifee/react-native";
import * as tasksApi from "../api/tasks";
import { ACTION_COMPLETE, ACTION_SNOOZE, snoozeReminder } from "./notificationService";

/** Shared by both the foreground and background event handlers. Only performs API mutations —
 * navigation is handled separately (background handlers can't touch the UI/navigator at all). */
export async function handleNotificationActionEvent({ type, detail }: Event): Promise<void> {
  if (type !== EventType.ACTION_PRESS) return;

  const taskId = detail.notification?.data?.taskId as string | undefined;
  const notificationId = detail.notification?.id;
  if (!taskId) return;

  try {
    if (detail.pressAction?.id === ACTION_COMPLETE) {
      await tasksApi.setTaskCompleted(taskId, true);
      if (notificationId) await notifee.cancelNotification(notificationId);
      return;
    }
    if (detail.pressAction?.id === ACTION_SNOOZE) {
      const task = await tasksApi.getTask(taskId);
      const newId = await snoozeReminder(task, 10);
      await tasksApi.setTaskNotificationId(taskId, newId);
      if (notificationId) await notifee.cancelNotification(notificationId);
    }
  } catch {
    // Best-effort: a failed API call here shouldn't crash a background JS task.
  }
}
