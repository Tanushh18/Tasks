import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
  type Notification,
  type Trigger,
} from "@notifee/react-native";
import { Platform } from "react-native";
import type { Task } from "../types/models";

export const ACTION_COMPLETE = "mark-complete";
export const ACTION_SNOOZE = "snooze";
export const ACTION_OPEN = "open-task";

// Android notification channels are immutable once created — a device that already ran an
// earlier build already has "task-alarms" locked in with the old (default) sound, and Android
// silently ignores later createChannel() calls for an existing id. Bumping the id forces a fresh
// channel with the bundled alarm sound on every device, old installs included.
const ALARM_CHANNEL_ID = "task-alarms-v2";

/** True alarm behavior (not a polite notification): full-screen even over the lock screen, loops
 * the ringtone, and bypasses Do Not Disturb — the same mechanism Android's own Clock app uses
 * (AlarmType.SET_ALARM_CLOCK), because that's what a "reminder" means for this app: it should
 * ring like the alarm you wake up to, not a banner you can miss. */
export async function ensureNotificationSetup(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  const granted =
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;

  if (Platform.OS === "android") {
    await notifee.createChannel({
      id: ALARM_CHANNEL_ID,
      name: "Task Alarms",
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      bypassDnd: true,
      sound: "alarm",
      vibration: true,
      vibrationPattern: [500, 1000, 500, 1000],
    });
  }

  return granted;
}

function buildAlarmNotification(task: Task): Notification {
  return {
    title: "Task Reminder",
    body: task.title,
    data: { taskId: task.id },
    android: {
      channelId: ALARM_CHANNEL_ID,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: "alarm",
      loopSound: true,
      autoCancel: false,
      ongoing: true,
      vibrationPattern: [500, 1000, 500, 1000],
      fullScreenAction: { id: "default" },
      pressAction: { id: ACTION_OPEN },
      actions: [
        { title: "Mark Complete", pressAction: { id: ACTION_COMPLETE } },
        { title: "Snooze 10 min", pressAction: { id: ACTION_SNOOZE } },
      ],
    },
  };
}

/** Schedules (or reschedules) the alarm for a task. Returns the new notification id, or null if no reminder is enabled. */
export async function scheduleTaskReminder(task: Task): Promise<string | null> {
  if (task.reminder.localNotificationId) {
    await notifee.cancelTriggerNotification(task.reminder.localNotificationId).catch(() => undefined);
  }

  if (!task.reminder.enabled || task.completed) {
    return null;
  }

  const notifyAtMillis = task.reminder.notifyAt ? new Date(task.reminder.notifyAt).getTime() : null;
  if (!notifyAtMillis || (task.recurrence.type === "none" && notifyAtMillis <= Date.now())) {
    return null;
  }

  let trigger: Trigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: notifyAtMillis,
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
  };

  // Notifee's native repeat only covers hourly/daily/weekly. Monthly/custom recurrence falls
  // back to a single one-time alarm at the stored notifyAt (same documented limitation as
  // before) — the next occurrence gets rescheduled whenever the task is next edited/synced.
  if (task.recurrence.type === "daily") {
    trigger = { ...trigger, repeatFrequency: RepeatFrequency.DAILY };
  } else if (task.recurrence.type === "weekly") {
    trigger = { ...trigger, repeatFrequency: RepeatFrequency.WEEKLY };
  }

  return notifee.createTriggerNotification(buildAlarmNotification(task), trigger);
}

export async function cancelTaskReminder(localNotificationId: string | null): Promise<void> {
  if (!localNotificationId) return;
  await notifee.cancelTriggerNotification(localNotificationId).catch(() => undefined);
}

export async function snoozeReminder(task: Task, minutes = 10): Promise<string> {
  return notifee.createTriggerNotification(
    { ...buildAlarmNotification(task), title: "Task Reminder (snoozed)" },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + minutes * 60 * 1000,
      alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
    }
  );
}
