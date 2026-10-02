import AsyncStorage from "@react-native-async-storage/async-storage";
import notifee, { AndroidImportance, AndroidVisibility, TriggerType, type Event, EventType } from "@notifee/react-native";
import { Platform } from "react-native";
import * as api from "../api/leads";
import { emitLeadEvent } from "./leadEvents";

/**
 * After someone calls a lead from the app, the lead stays "pending" until its stage is updated.
 * The app shows a popup when the person is back and free, and reminds them with a notification
 * (with stage buttons, so it works over other apps) on a back-off schedule.
 */

export interface PendingCall {
  leadId: string;
  name: string;
  phone: string;
  status: string;
  notes: string;
  startedAt: number;
  /** Reminders already shown (popup closed with ✕ or notification fired). */
  reminders: number;
  /** Don't show the popup / notification again before this time. */
  nextAt: number;
}

const KEY = "leads.callFollowUp.pending";
const CHANNEL_ID = "lead-followups";
export const FOLLOWUP_KIND = "lead-followup";
export const ACTION_PREFIX = "lead-status:";

/** Popup / notification gaps: right after the call, then 2 min, 15 min, then hourly. */
export const FIRST_DELAY_MS = 2 * 60 * 1000;
export const REMINDER_GAPS_MS = [2 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000, 60 * 60 * 1000, 60 * 60 * 1000];
export const MAX_REMINDERS = REMINDER_GAPS_MS.length;
/** A popup right as the dialer opens would be noise; wait at least this long after tapping Call. */
export const MIN_CALL_MS = 8 * 1000;
/** No notifications between these hours (24h clock); the reminder waits until morning. */
export const QUIET_START = 21;
export const QUIET_END = 9;
/** Pending calls older than this are dropped. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Quick stages offered on the popup and as notification buttons (Android shows at most 3). */
export const QUICK_STATUSES = ["Interested", "Called — no answer", "Not interested"];

async function load(): Promise<PendingCall[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PendingCall[]) : [];
    return list.filter((c) => Date.now() - c.startedAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

async function save(list: PendingCall[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  emitLeadEvent("callsChanged");
}

export async function getPendingCalls(): Promise<PendingCall[]> {
  return load();
}

/** Moves a time out of quiet hours to QUIET_END the same or next morning. */
export function outsideQuietHours(at: number): number {
  const d = new Date(at);
  const h = d.getHours();
  if (h >= QUIET_START || h < QUIET_END) {
    const morning = new Date(d);
    if (h >= QUIET_START) morning.setDate(morning.getDate() + 1);
    morning.setHours(QUIET_END, 0, 0, 0);
    return morning.getTime();
  }
  return at;
}

/** The next call the popup should ask about right now, if any. */
export function dueCall(list: PendingCall[], now = Date.now()): PendingCall | null {
  return (
    list
      .filter((c) => now - c.startedAt >= MIN_CALL_MS && c.nextAt <= now)
      .sort((a, b) => a.startedAt - b.startedAt)[0] ?? null
  );
}

const notificationId = (leadId: string) => `lead-followup-${leadId}`;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Lead follow-ups",
    description: "Reminds you to update a lead's stage after a call",
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PRIVATE,
    vibration: true,
  });
}

function buildNotification(call: PendingCall) {
  return {
    id: notificationId(call.leadId),
    title: "Update the lead's stage",
    body: `You called ${call.name || call.phone}. How did it go?`,
    data: { kind: FOLLOWUP_KIND, leadId: call.leadId },
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      pressAction: { id: "default", launchActivity: "default" },
      actions: QUICK_STATUSES.map((s) => ({ title: s, pressAction: { id: `${ACTION_PREFIX}${s}` } })),
      autoCancel: true,
    },
    ios: { categoryId: CHANNEL_ID },
  };
}

/** Schedules (or replaces) the reminder notification for this call at `at`. */
async function scheduleNotification(call: PendingCall, at: number): Promise<void> {
  try {
    await ensureChannel();
    await notifee.cancelNotification(notificationId(call.leadId));
    await notifee.createTriggerNotification(buildNotification(call), {
      type: TriggerType.TIMESTAMP,
      timestamp: Math.max(Date.now() + 5_000, outsideQuietHours(at)),
    });
  } catch {
    // Notifications are a nicety; the in-app popup still asks.
  }
}

/** Exported so the popup can clear a notification it is already showing in-app. */
export async function cancelNotification(leadId: string): Promise<void> {
  try {
    await notifee.cancelNotification(notificationId(leadId));
  } catch {
    // ignore
  }
}

/** Call this when the person taps Call on a lead (before opening the dialer). */
export async function registerCall(lead: Pick<api.Lead, "id" | "name" | "phone" | "status" | "notes">): Promise<void> {
  const now = Date.now();
  const list = (await load()).filter((c) => c.leadId !== lead.id);
  const call: PendingCall = {
    leadId: lead.id,
    name: lead.name,
    phone: lead.phone,
    status: lead.status,
    notes: lead.notes ?? "",
    startedAt: now,
    reminders: 0,
    nextAt: now + MIN_CALL_MS,
  };
  list.push(call);
  await save(list);
  // If they never come back to the app, a notification asks a couple of minutes later.
  await scheduleNotification(call, now + FIRST_DELAY_MS);
}

/** The stage was updated: stop asking. */
export async function resolveCall(leadId: string): Promise<void> {
  const list = await load();
  if (list.some((c) => c.leadId === leadId)) await save(list.filter((c) => c.leadId !== leadId));
  await cancelNotification(leadId);
}

/**
 * The popup was closed without an answer: ask again later (and notify if the app isn't open then).
 * After MAX_REMINDERS the call is dropped so nobody gets nagged forever.
 */
export async function snoozeCall(leadId: string): Promise<void> {
  const list = await load();
  const call = list.find((c) => c.leadId === leadId);
  if (!call) return;
  if (call.reminders >= MAX_REMINDERS) {
    await resolveCall(leadId);
    return;
  }
  const gap = REMINDER_GAPS_MS[Math.min(call.reminders, REMINDER_GAPS_MS.length - 1)];
  call.reminders += 1;
  call.nextAt = Date.now() + gap;
  await save(list);
  await scheduleNotification(call, call.nextAt);
}

/** Saves a stage for a pending call (from the popup or a notification button). */
export async function saveCallOutcome(call: PendingCall, status: string, note?: string): Promise<void> {
  const body: Partial<api.Lead> = { status };
  const trimmed = note?.trim();
  if (trimmed) {
    const stamp = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    body.notes = [call.notes, `${stamp}: ${trimmed}`].filter(Boolean).join("\n");
  }
  await api.updateLead(call.leadId, body);
  await resolveCall(call.leadId);
  emitLeadEvent("leadsChanged");
}

/** Handles a tap on a stage button in the follow-up notification (foreground or background). */
export async function handleFollowUpNotificationEvent({ type, detail }: Event): Promise<boolean> {
  const data = detail.notification?.data;
  if (data?.kind !== FOLLOWUP_KIND) return false;
  const leadId = String(data.leadId ?? "");
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id?.startsWith(ACTION_PREFIX)) {
    const status = detail.pressAction.id.slice(ACTION_PREFIX.length);
    const call = (await load()).find((c) => c.leadId === leadId);
    try {
      if (call) await saveCallOutcome(call, status);
      else await api.updateLead(leadId, { status });
    } catch {
      // Offline: leave it pending; the popup will ask again in the app.
      return true;
    }
    await cancelNotification(leadId);
    return true;
  }
  if (type === EventType.DISMISSED && leadId) {
    await snoozeCall(leadId);
    return true;
  }
  return type === EventType.PRESS;
}
