/**
 * Pacing rules for WhatsApp auto send. Pure functions, so they can be tested without a phone.
 *  - Each day has its own target of 12 or 13 messages (fixed for that date, so restarting the app can't change it).
 *  - Sending happens between 10:00 and 19:00, with a random gap of 6 to 14 minutes between messages.
 */
export const WINDOW_START_HOUR = 10;
export const WINDOW_END_HOUR = 19;
export const MIN_GAP_MS = 6 * 60 * 1000;
export const MAX_GAP_MS = 14 * 60 * 1000;

export const dayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 12 or 13, decided by the date alone. */
export function dailyTarget(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return 12 + (h % 2);
}

export function inWindow(now: Date): boolean {
  const h = now.getHours();
  return h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR;
}

/** Milliseconds until the next 10:00 (today if it is earlier than that, otherwise tomorrow). */
export function msUntilWindow(now: Date): number {
  const next = new Date(now);
  next.setHours(WINDOW_START_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function randomGapMs(random: () => number = Math.random): number {
  return Math.round(MIN_GAP_MS + random() * (MAX_GAP_MS - MIN_GAP_MS));
}

export type Decision =
  | { action: "send" }
  | { action: "wait"; ms: number; reason: "gap" | "window" | "daily-limit" };

/** What to do right now. `nextDueAt` is when the last message's random gap ends (set when it was sent). */
export function decide(now: Date, sentToday: number, nextDueAt: number | null): Decision {
  if (sentToday >= dailyTarget(dayKey(now))) return { action: "wait", ms: msUntilWindow(now), reason: "daily-limit" };
  if (!inWindow(now)) return { action: "wait", ms: msUntilWindow(now), reason: "window" };
  if (nextDueAt != null && nextDueAt > now.getTime()) return { action: "wait", ms: nextDueAt - now.getTime(), reason: "gap" };
  return { action: "send" };
}
