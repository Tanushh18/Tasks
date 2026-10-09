import crypto from "node:crypto";
import { DateTime } from "luxon";
import { Lead } from "../models/Lead";
import { SmsDevice } from "../models/SmsDevice";
import { SmsSend } from "../models/SmsSend";
import { SmsSettings } from "../models/SmsSettings";
import { SmsSheet } from "../models/SmsSheet";
import { ApiError } from "../utils/ApiError";
import { normalizePhone } from "./leadImport";

export const ZONE = "Asia/Kolkata";
/** A typo in the console can never push a SIM past these. */
export const HARD_CAPS = { hourly: 60, daily: 200 };
export const MAX_ATTEMPTS = 3;
/** A lead a phone claimed but never reported on (phone died mid-send) goes back to the pool after this long. */
const RECLAIM_AFTER_MS = 2 * 60 * 1000;
const ONLINE_WINDOW_MS = 20 * 1000;
const NOT_INTERESTED = /not\s*int[e]?rest/i;

export interface EffectiveSettings {
  mode: "auto" | "custom";
  paused: boolean;
  dailyLimit: number;
  hourlyLimit: number;
  gapMinSec: number;
  gapMaxSec: number;
  lunchStart: string;
  lunchEnd: string;
  lunchQuota: number;
  nightStart: string;
  nightEnd: string;
  days: number[];
}

export const AUTO_DEFAULTS: Omit<EffectiveSettings, "mode" | "paused"> = {
  dailyLimit: 90,
  hourlyLimit: 30,
  gapMinSec: 8,
  gapMaxSec: 14,
  lunchStart: "13:00",
  lunchEnd: "14:00",
  lunchQuota: 30,
  nightStart: "21:00",
  nightEnd: "23:00",
  days: [0, 1, 2, 3, 4, 5, 6],
};

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
};
const hhmm = (v: unknown, fallback: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export async function getStoredSettings() {
  return (await SmsSettings.findOneAndUpdate({ key: "shine" }, { $setOnInsert: { key: "shine" } }, { upsert: true, new: true }))!;
}

/**
 * What the engine actually uses. The limits come from the built-in defaults in auto mode and from the clamped custom
 * values otherwise; the sending TIMES (lunch/night windows, days) are always the ones set in the console.
 */
export function effective(doc: Awaited<ReturnType<typeof getStoredSettings>>): EffectiveSettings {
  const custom = doc.mode === "custom";
  const days = [...new Set((doc.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  const gapMin = clamp(doc.gapMinSec, 1, 600, AUTO_DEFAULTS.gapMinSec);
  const daily = clamp(doc.dailyLimit, 1, HARD_CAPS.daily, AUTO_DEFAULTS.dailyLimit);
  const limits = custom
    ? {
        dailyLimit: daily,
        hourlyLimit: clamp(doc.hourlyLimit, 1, HARD_CAPS.hourly, AUTO_DEFAULTS.hourlyLimit),
        gapMinSec: gapMin,
        gapMaxSec: Math.max(gapMin, clamp(doc.gapMaxSec, 1, 900, AUTO_DEFAULTS.gapMaxSec)),
        lunchQuota: clamp(doc.lunchQuota, 0, daily, AUTO_DEFAULTS.lunchQuota),
      }
    : {
        dailyLimit: AUTO_DEFAULTS.dailyLimit,
        hourlyLimit: AUTO_DEFAULTS.hourlyLimit,
        gapMinSec: AUTO_DEFAULTS.gapMinSec,
        gapMaxSec: AUTO_DEFAULTS.gapMaxSec,
        lunchQuota: AUTO_DEFAULTS.lunchQuota,
      };
  return {
    mode: custom ? "custom" : "auto",
    paused: !!doc.paused,
    ...limits,
    lunchStart: hhmm(doc.lunchStart, AUTO_DEFAULTS.lunchStart),
    lunchEnd: hhmm(doc.lunchEnd, AUTO_DEFAULTS.lunchEnd),
    nightStart: hhmm(doc.nightStart, AUTO_DEFAULTS.nightStart),
    nightEnd: hhmm(doc.nightEnd, AUTO_DEFAULTS.nightEnd),
    days: days.length ? days : AUTO_DEFAULTS.days,
  };
}

export async function updateSettings(input: Record<string, unknown>) {
  const doc = await getStoredSettings();
  if (input.mode === "auto" || input.mode === "custom") doc.mode = input.mode;
  if (typeof input.paused === "boolean") doc.paused = input.paused;
  for (const k of ["dailyLimit", "hourlyLimit", "gapMinSec", "gapMaxSec", "lunchQuota"] as const) {
    if (input[k] !== undefined) {
      const v = Number(input[k]);
      if (!Number.isFinite(v) || v < 0) throw ApiError.badRequest(`${k} must be a positive number`);
      doc[k] = Math.round(v);
    }
  }
  for (const k of ["lunchStart", "lunchEnd", "nightStart", "nightEnd"] as const) {
    if (input[k] !== undefined) {
      if (typeof input[k] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input[k] as string)) throw ApiError.badRequest(`${k} must look like 13:00`);
      doc[k] = input[k] as string;
    }
  }
  const win = (a: string, b: string, label: string) => {
    if (minutes(a) >= minutes(b)) throw ApiError.badRequest(`${label} must end after it starts`);
  };
  win(doc.lunchStart, doc.lunchEnd, "The lunch time");
  win(doc.nightStart, doc.nightEnd, "The night time");
  if (minutes(doc.lunchEnd) > minutes(doc.nightStart)) throw ApiError.badRequest("The lunch time must end before the night time starts");
  if (input.days !== undefined) {
    if (!Array.isArray(input.days) || input.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw ApiError.badRequest("days must be numbers 0 (Sun) to 6 (Sat)");
    doc.days = [...new Set(input.days as number[])].sort() as any;
  }
  await doc.save();
  return doc;
}

/** "{name}" becomes the lead's first/full name (or nothing), with tidy spacing. */
export function fillTemplate(text: string, name: string | undefined | null): string {
  const n = String(name ?? "").trim();
  return text
    .replace(/\{name\}/gi, n)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type WindowName = "lunch" | "night";

/** Which sending window "now" falls in (IST), or null when it is outside both or on a day that is switched off. */
export function currentWindow(s: EffectiveSettings, now = DateTime.now().setZone(ZONE)): WindowName | null {
  if (!s.days.includes(now.weekday % 7)) return null;
  const m = now.hour * 60 + now.minute;
  if (m >= minutes(s.lunchStart) && m < minutes(s.lunchEnd) && s.lunchQuota > 0) return "lunch";
  if (m >= minutes(s.nightStart) && m < minutes(s.nightEnd)) return "night";
  return null;
}

export const dayKeyOf = (now = DateTime.now().setZone(ZONE)) => now.toFormat("yyyy-LL-dd");

export function verifyKey(given: unknown, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const randomGapMs = (s: EffectiveSettings) => (s.gapMinSec + Math.random() * (s.gapMaxSec - s.gapMinSec)) * 1000;

export interface DeviceHello {
  deviceId: string;
  name?: string;
  ready?: boolean;
  appVersion?: string;
}

export async function touchDevice(h: DeviceHello) {
  return SmsDevice.findOneAndUpdate(
    { deviceId: h.deviceId },
    {
      $set: { lastSeen: new Date(), ready: h.ready !== false, appVersion: (h.appVersion ?? "").slice(0, 20) },
      $setOnInsert: { name: (h.name || "Android phone").slice(0, 60) },
    },
    { upsert: true, new: true }
  );
}

export interface Claimed {
  id: string;
  phoneNumber: string;
  message: string;
}

/** Eligible = in this sheet, not archived, not "Not interested", never texted (or its claim went stale), under 3 tries. */
function eligibleFilter(sheet: { sheet: string; onlyNewSince?: Date | null }, now: Date) {
  const f: Record<string, unknown> = {
    origin: sheet.sheet,
    archived: false,
    status: { $not: NOT_INTERESTED },
    smsAttempts: { $not: { $gte: MAX_ATTEMPTS } },
    $or: [
      { smsState: { $in: ["", null] } },
      { smsState: "sending", smsClaimedAt: { $lt: new Date(now.getTime() - RECLAIM_AFTER_MS) } },
    ],
  };
  if (sheet.onlyNewSince) f.createdAt = { $gte: sheet.onlyNewSince };
  return f;
}

/**
 * The phone polls this. It is given the next message only if it is allowed to send right now: the phone is enabled and
 * assigned to Shine One, we are inside a lunch/night window, and the phone is under its hourly/daily/lunch limits and
 * past its random gap. Returns null otherwise (and the phone just asks again in a few seconds).
 */
export async function claimNext(h: DeviceHello, nowDate = new Date()): Promise<Claimed | null> {
  const device = await touchDevice(h);
  if (!device.enabled || !device.ready || device.role === "ggnhome") return null;
  if (device.nextAllowedAt && device.nextAllowedAt > nowDate) return null;

  const settings = effective(await getStoredSettings());
  if (settings.paused) return null;
  const now = DateTime.fromJSDate(nowDate).setZone(ZONE);
  const dayKey = dayKeyOf(now);

  // A console test message goes out at once (still paced by the gap), whatever the window.
  const test = await SmsSend.findOneAndUpdate(
    { kind: "test", status: "pending" },
    { status: "sending", deviceId: device.deviceId, deviceName: device.name, claimedAt: nowDate, dayKey },
    { sort: { createdAt: 1 }, new: true }
  );
  if (test) {
    await SmsDevice.updateOne({ _id: device._id }, { nextAllowedAt: new Date(nowDate.getTime() + randomGapMs(settings)) });
    return { id: String(test._id), phoneNumber: test.phone, message: test.message };
  }

  const window = currentWindow(settings, now);
  if (!window) return null;

  const counted = { deviceId: device.deviceId, kind: "lead", status: { $in: ["sending", "sent"] } };
  const [today, lastHour, lunchToday] = await Promise.all([
    SmsSend.countDocuments({ ...counted, dayKey }),
    SmsSend.countDocuments({ ...counted, claimedAt: { $gt: new Date(nowDate.getTime() - 3600_000) } }),
    SmsSend.countDocuments({ ...counted, dayKey, window: "lunch" }),
  ]);
  if (today >= settings.dailyLimit || lastHour >= settings.hourlyLimit) return null;
  if (window === "lunch" && lunchToday >= settings.lunchQuota) return null;

  // Sheets that are switched on and have a message, least recently served first (fair between sheets).
  const sheets = await SmsSheet.find({ auto: true, text: { $ne: "" } }).sort({ lastServedAt: 1, _id: 1 });
  for (const sheet of sheets) {
    for (let tries = 0; tries < 25; tries++) {
      const lead = await Lead.findOneAndUpdate(
        eligibleFilter(sheet, nowDate),
        { smsState: "sending", smsClaimedAt: nowDate },
        { sort: { createdAt: 1, _id: 1 }, new: true }
      );
      if (!lead) break;
      const phone = normalizePhone(lead.phone);
      if (!phone) {
        await Lead.updateOne({ _id: lead._id }, { smsState: "invalid", smsError: "Not a valid mobile number" });
        continue;
      }
      const send = await SmsSend.create({
        kind: "lead",
        leadId: lead._id,
        phone,
        message: fillTemplate(sheet.text, lead.name),
        sheet: sheet.sheet,
        deviceId: device.deviceId,
        deviceName: device.name,
        window,
        dayKey,
        status: "sending",
        claimedAt: nowDate,
      });
      await Promise.all([
        SmsSheet.updateOne({ _id: sheet._id }, { lastServedAt: nowDate }),
        SmsDevice.updateOne({ _id: device._id }, { nextAllowedAt: new Date(nowDate.getTime() + randomGapMs(settings)) }),
      ]);
      return { id: String(send._id), phoneNumber: phone, message: send.message };
    }
  }
  return null;
}

/** The phone reports { status: "sent" | "failed", error? }. A failed lead is retried later (up to 3 tries in all). */
export async function reportResult(id: string, deviceId: string, status: "sent" | "failed", error = "") {
  const send = await SmsSend.findById(id);
  if (!send) throw ApiError.notFound("Message not found");
  if (send.status === "sent") return; // a repeated report must not count twice
  const now = new Date();
  const errText = String(error).slice(0, 200);
  send.status = status;
  send.error = status === "failed" ? errText : "";
  if (status === "sent") {
    send.sentAt = now;
    send.message = ""; // never keep the customer's text
  }
  await send.save();

  if (send.leadId) {
    if (status === "sent") {
      await Lead.updateOne(
        { _id: send.leadId },
        {
          smsState: "sent",
          smsSentAt: now,
          smsError: "",
          $push: { smsHistory: { $each: [{ at: now, sheet: send.sheet, status: "sent", deviceName: send.deviceName }], $slice: -20 } },
        }
      );
    } else {
      const lead = await Lead.findByIdAndUpdate(send.leadId, { $inc: { smsAttempts: 1 }, smsError: errText }, { new: true });
      const gaveUp = !!lead && (lead.smsAttempts ?? 0) >= MAX_ATTEMPTS;
      await Lead.updateOne({ _id: send.leadId }, { smsState: gaveUp ? "failed" : "", smsClaimedAt: null });
    }
  }
  const dev = await SmsDevice.findOne({ deviceId: deviceId || send.deviceId });
  if (dev) {
    if (status === "sent") {
      dev.sentTotal += 1;
      dev.lastSentAt = now;
    } else {
      dev.failedTotal += 1;
      dev.lastError = errText;
    }
    await dev.save();
  }
}

export async function reportDelivery(id: string, status: "delivered" | "undelivered") {
  const send = await SmsSend.findByIdAndUpdate(id, { delivery: status }, { new: true });
  if (!send) throw ApiError.notFound("Message not found");
  if (send.leadId && status === "delivered") await Lead.updateOne({ _id: send.leadId, smsState: "sent" }, { smsState: "delivered" });
}

// ------------------------------------------------------------------ console ----

export async function sheetOverview() {
  const [configs, counts, settingsDoc, devices] = await Promise.all([
    SmsSheet.find({}).lean(),
    Lead.aggregate<{ _id: { sheet: string; state: string }; n: number }>([
      { $match: { archived: false, origin: { $nin: ["", null] } } },
      { $group: { _id: { sheet: "$origin", state: { $ifNull: ["$smsState", ""] } }, n: { $sum: 1 } } },
    ]),
    getStoredSettings(),
    SmsDevice.find({}).lean(),
  ]);
  const settings = effective(settingsDoc);
  const phones = devices.filter((d) => d.enabled && d.role !== "ggnhome").length;
  const cfg = new Map(configs.map((c) => [c.sheet, c]));
  const by = new Map<string, Record<string, number>>();
  for (const c of counts) {
    const row = by.get(c._id.sheet) ?? {};
    row[c._id.state || "unsent"] = (row[c._id.state || "unsent"] ?? 0) + c.n;
    by.set(c._id.sheet, row);
  }
  const names = [...new Set([...by.keys(), ...cfg.keys()])].sort((a, b) => a.localeCompare(b));
  return names.map((name) => {
    const c = cfg.get(name);
    const r = by.get(name) ?? {};
    const total = Object.values(r).reduce((a, b) => a + b, 0);
    const sent = (r.sent ?? 0) + (r.delivered ?? 0);
    const remaining = (r.unsent ?? 0) + (r.sending ?? 0);
    const perDay = Math.max(1, phones) * settings.dailyLimit;
    return {
      sheet: name,
      text: c?.text ?? "",
      auto: !!c?.auto,
      onlyNewSince: c?.onlyNewSince ?? null,
      total,
      sent,
      delivered: r.delivered ?? 0,
      failed: r.failed ?? 0,
      invalid: r.invalid ?? 0,
      remaining,
      etaDays: c?.auto && remaining ? Math.ceil(remaining / perDay) : null,
    };
  });
}

export async function saveSheet(sheet: string, input: { text?: string; auto?: boolean; onlyNew?: boolean }) {
  const name = String(sheet ?? "").trim();
  if (!name) throw ApiError.badRequest("Sheet name is required");
  if (input.text !== undefined && input.text.length > 600) throw ApiError.badRequest("Message is too long (600 characters max)");
  const doc = (await SmsSheet.findOne({ sheet: name })) ?? new SmsSheet({ sheet: name });
  if (input.text !== undefined) doc.text = input.text.trim();
  if (input.auto !== undefined) {
    if (input.auto && !doc.text) throw ApiError.badRequest("Write the message for this sheet before switching Auto-send on");
    if (input.auto && !doc.auto) doc.onlyNewSince = input.onlyNew ? new Date() : null;
    doc.auto = input.auto;
  }
  await doc.save();
  return doc;
}

export async function deviceList() {
  const settings = effective(await getStoredSettings());
  const dayKey = dayKeyOf();
  const devices = await SmsDevice.find({}).sort({ createdAt: 1 }).lean();
  const today = await SmsSend.aggregate<{ _id: string; n: number }>([
    { $match: { dayKey, kind: "lead", status: { $in: ["sending", "sent"] } } },
    { $group: { _id: "$deviceId", n: { $sum: 1 } } },
  ]);
  const map = new Map(today.map((t) => [t._id, t.n]));
  return {
    limits: settings,
    devices: devices.map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      role: d.role,
      enabled: d.enabled,
      ready: d.ready,
      online: !!d.lastSeen && Date.now() - d.lastSeen.getTime() < ONLINE_WINDOW_MS,
      lastSeen: d.lastSeen,
      appVersion: d.appVersion,
      sentToday: map.get(d.deviceId) ?? 0,
      sentTotal: d.sentTotal,
      failedTotal: d.failedTotal,
      lastSentAt: d.lastSentAt,
      lastError: d.lastError,
    })),
  };
}

export async function updateDevice(deviceId: string, input: { name?: string; role?: string; enabled?: boolean }) {
  const update: Record<string, unknown> = {};
  if (typeof input.name === "string" && input.name.trim()) update.name = input.name.trim().slice(0, 60);
  if (input.role !== undefined) {
    if (!["shine", "ggnhome", "both"].includes(input.role)) throw ApiError.badRequest("role must be shine, ggnhome or both");
    update.role = input.role;
  }
  if (typeof input.enabled === "boolean") update.enabled = input.enabled;
  const d = await SmsDevice.findOneAndUpdate({ deviceId }, update, { new: true });
  if (!d) throw ApiError.notFound("Device not found");
  return d;
}

export async function recentLog(limit = 100) {
  const rows = await SmsSend.find({}).sort({ createdAt: -1 }).limit(Math.min(500, Math.max(1, limit))).lean();
  return rows.map((r) => ({
    id: String(r._id),
    kind: r.kind,
    phone: r.phone,
    sheet: r.sheet,
    status: r.status,
    delivery: r.delivery,
    window: r.window,
    deviceName: r.deviceName,
    error: r.error,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
  }));
}

export async function queueTest(phone: string, message: string) {
  const p = normalizePhone(phone);
  if (!p) throw ApiError.badRequest("Enter a valid 10-digit mobile number");
  const send = await SmsSend.create({ kind: "test", phone: p, message: (message || "Test message from SMS Service").slice(0, 300), status: "pending", window: "any" });
  return String(send._id);
}

export async function statusForDevice(deviceId: string) {
  const dev = await SmsDevice.findOne({ deviceId }).lean();
  const settings = effective(await getStoredSettings());
  const dayKey = dayKeyOf();
  const sentToday = await SmsSend.countDocuments({ deviceId, dayKey, kind: "lead", status: { $in: ["sending", "sent"] } });
  const pending = await Lead.countDocuments({ smsState: { $in: ["", null] }, archived: false, origin: { $in: (await SmsSheet.find({ auto: true }).lean()).map((s) => s.sheet) } });
  return { role: dev?.role ?? "both", enabled: dev?.enabled ?? true, paused: settings.paused, window: currentWindow(settings), sentToday, dailyLimit: settings.dailyLimit, pending };
}
