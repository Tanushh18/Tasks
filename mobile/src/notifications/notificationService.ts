import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Task } from "../types/models";

export const TASK_CATEGORY = "task-reminder";
export const ACTION_COMPLETE = "mark-complete";
export const ACTION_SNOOZE = "snooze";
export const ACTION_OPEN = "open-task";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationSetup(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted = request.granted;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("task-reminders", {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  await Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
    { identifier: ACTION_COMPLETE, buttonTitle: "Mark Complete" },
    { identifier: ACTION_SNOOZE, buttonTitle: "Snooze 10 min" },
    { identifier: ACTION_OPEN, buttonTitle: "Open Task", options: { opensAppToForeground: true } },
  ]);

  return granted;
}

function weekdayFromDateString(date: string): number {
  // expo-notifications WEEKLY trigger uses 1-7 where 1 = Sunday, matching JS Date#getDay() + 1.
  const jsDate = new Date(`${date}T00:00:00`);
  return jsDate.getDay() + 1;
}

/** Schedules (or reschedules) the local reminder notification for a task. Returns the new notification id, or null if no reminder is enabled. */
export async function scheduleTaskReminder(task: Task): Promise<string | null> {
  if (task.reminder.localNotificationId) {
    await Notifications.cancelScheduledNotificationAsync(task.reminder.localNotificationId).catch(() => undefined);
  }

  if (!task.reminder.enabled || task.completed) {
    return null;
  }

  const [hour, minute] = task.time.split(":").map(Number);
  const content: Notifications.NotificationContentInput = {
    title: "Task Reminder",
    body: task.title,
    categoryIdentifier: TASK_CATEGORY,
    data: { taskId: task.id },
    sound: true,
  };

  let trigger: Notifications.SchedulableNotificationTriggerInput;

  switch (task.recurrence.type) {
    case "daily":
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute };
      break;
    case "weekly":
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: weekdayFromDateString(task.date),
        hour,
        minute,
      };
      break;
    case "monthly": {
      const day = Number(task.date.split("-")[2]);
      trigger = { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day, hour, minute };
      break;
    }
    default: {
      // "none" and "custom" (custom-interval rescheduling is a Phase 3 feature) both fall back
      // to a single one-time reminder at the stored notifyAt.
      const date = task.reminder.notifyAt ? new Date(task.reminder.notifyAt) : null;
      if (!date || date.getTime() <= Date.now()) return null;
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
    }
  }

  return Notifications.scheduleNotificationAsync({ content, trigger });
}

export async function cancelTaskReminder(localNotificationId: string | null): Promise<void> {
  if (!localNotificationId) return;
  await Notifications.cancelScheduledNotificationAsync(localNotificationId).catch(() => undefined);
}

export async function snoozeReminder(task: Task, minutes = 10): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Task Reminder (snoozed)",
      body: task.title,
      categoryIdentifier: TASK_CATEGORY,
      data: { taskId: task.id },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + minutes * 60 * 1000),
    },
  });
}
