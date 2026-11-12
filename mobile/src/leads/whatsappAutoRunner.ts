import AsyncStorage from "@react-native-async-storage/async-storage";
import * as api from "../api/leads";
import { decide, dailyTarget, dayKey, randomGapMs } from "./whatsappAutoPlan";
import { findImage, sendOne } from "./whatsappAuto";
import { messagePool } from "./whatsappAutoMessages";
import { pickAutoTemplate, renderAutoTemplate } from "./whatsappAutoTemplates";

const STATE_KEY = "leads.whatsappAuto.state.v1";
/** Gap between test messages. Short on purpose so a test run finishes in minutes. */
export const TEST_GAP_MS = 45_000;

export interface AutoState {
  day: string;
  sentToday: number;
  sentTotal: number;
  nextDueAt: number | null;
  lastTemplateId: string | null;
  /** Newest first, capped. */
  log: { at: number; name: string; phone: string; template: string; ok: boolean; error?: string }[];
}

const fresh = (): AutoState => ({ day: dayKey(), sentToday: 0, sentTotal: 0, nextDueAt: null, lastTemplateId: null, log: [] });

export async function loadState(): Promise<AutoState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const s = raw ? ({ ...fresh(), ...JSON.parse(raw) } as AutoState) : fresh();
    if (s.day !== dayKey()) return { ...s, day: dayKey(), sentToday: 0 };
    return s;
  } catch {
    return fresh();
  }
}

async function saveState(s: AutoState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ ...s, log: s.log.slice(0, 60) })).catch(() => undefined);
}

/** Digits with country code, or null when the number can't be a mobile number (Indian numbers assumed without a prefix). */
export function normalizePhone(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length >= 12 && d.length <= 14) return d;
  return null;
}

export type RunStatus = { phase: "idle" | "sending" | "waiting" | "stopped"; text: string };

export interface RunnerHandle {
  stop(): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The number has no WhatsApp account: record it so the list moves on instead of retrying it forever. */
export const NO_WHATSAPP_NOTE = "No WhatsApp (skipped)";
export function isNotOnWhatsApp(error: string | undefined): boolean {
  return !!error && /not on whatsapp/i.test(error);
}

/**
 * Sends one message at a time. Normal mode: to unsent saved leads of a sheet, following whatsappAutoPlan (window, daily
 * target, random gaps), and each sent lead is marked on the server. Test mode (`testChats`): to the named WhatsApp chats in
 * turn, with no lead data touched, no window or daily cap, and TEST_GAP_MS between messages.
 */
export function startRunner(opts: {
  origin?: string;
  testChats?: string[];
  onStatus: (s: RunStatus) => void;
  onState: (s: AutoState) => void;
}): RunnerHandle {
  let stopped = false;
  const skipped = new Set<string>();

  const runTest = async (chats: string[]) => {
    let state = await loadState();
    let i = 0;
    while (!stopped) {
      const chat = chats[i % chats.length];
      i += 1;
      const image = await findImage();
      if (!image) return opts.onStatus({ phase: "stopped", text: "No image in the folder. Choose an image first." });
      const pool = await messagePool();
      const tpl = pickAutoTemplate(state.lastTemplateId, pool);
      opts.onStatus({ phase: "sending", text: `Test: sending to ${chat}...` });
      const res = await sendOne({ chatName: chat, text: renderAutoTemplate(tpl.text, ""), image });
      const entry = { at: Date.now(), name: chat, phone: "test", template: tpl.name, ok: res.ok, error: res.ok ? undefined : res.error };
      state = { ...state, lastTemplateId: tpl.id, log: [entry, ...state.log] };
      if (res.ok) state = { ...state, sentTotal: state.sentTotal + 1 };
      await saveState(state);
      opts.onState(state);
      if (!res.ok) return opts.onStatus({ phase: "stopped", text: `Test stopped: ${res.error}` });
      const wait = Math.round(TEST_GAP_MS / 1000);
      for (let s = wait; s > 0 && !stopped; s -= 5) {
        opts.onStatus({ phase: "waiting", text: `Test: next message in ${s} s...` });
        await sleep(Math.min(5000, s * 1000));
      }
    }
    opts.onStatus({ phase: "stopped", text: "Stopped." });
  };

  const loop = async () => {
    if (opts.testChats?.length) return runTest(opts.testChats);
    let state = await loadState();
    opts.onState(state);
    while (!stopped) {
      const now = new Date();
      if (state.day !== dayKey(now)) state = { ...state, day: dayKey(now), sentToday: 0 };
      const d = decide(now, state.sentToday, state.nextDueAt);
      if (d.action === "wait") {
        const why = d.reason === "daily-limit" ? `Done for today (${state.sentToday}/${dailyTarget(state.day)}). Resumes at 10:00 AM.` : d.reason === "window" ? "Outside 10 AM to 7 PM. Waiting." : `Next message in ${Math.ceil(d.ms / 60000)} min.`;
        opts.onStatus({ phase: "waiting", text: why });
        await sleep(Math.min(d.ms, 30_000));
        continue;
      }
      const image = await findImage();
      if (!image) {
        opts.onStatus({ phase: "stopped", text: "No image in the folder. Choose an image first." });
        return;
      }
      let lead: api.Lead | undefined;
      try {
        const page = await api.listLeadsPage({ page: 1, status: "all", limit: 50, origin: opts.origin });
        lead = page.leads.find((l) => !l.whatsappSentAt && !l.archived && !skipped.has(l.id) && normalizePhone(l.phone));
      } catch {
        opts.onStatus({ phase: "waiting", text: "Couldn't load leads. Retrying in a minute." });
        await sleep(60_000);
        continue;
      }
      if (!lead) {
        opts.onStatus({ phase: "stopped", text: "No unsent leads left." });
        return;
      }
      const digits = normalizePhone(lead.phone)!;
      const pool = await messagePool();
      const tpl = pickAutoTemplate(state.lastTemplateId, pool);
      opts.onStatus({ phase: "sending", text: `Sending to ${lead.name || lead.phone}...` });
      const res = await sendOne({ digits, text: renderAutoTemplate(tpl.text, lead.name), image });
      const entry = { at: Date.now(), name: lead.name, phone: lead.phone, template: tpl.name, ok: res.ok, error: res.ok ? undefined : res.error };
      if (res.ok) {
        // Server marks it sent so it shows on the lead and is never messaged twice.
        await api.setWhatsAppSent(lead.id, true, null, tpl.name).catch(() => undefined);
        state = { ...state, sentToday: state.sentToday + 1, sentTotal: state.sentTotal + 1, lastTemplateId: tpl.id, nextDueAt: Date.now() + randomGapMs(), log: [entry, ...state.log] };
      } else {
        skipped.add(lead.id);
        if (isNotOnWhatsApp(res.error)) await api.setWhatsAppSent(lead.id, true, null, NO_WHATSAPP_NOTE).catch(() => undefined);
        state = { ...state, nextDueAt: Date.now() + 60_000, log: [entry, ...state.log] };
      }
      await saveState(state);
      opts.onState(state);
    }
    opts.onStatus({ phase: "stopped", text: "Stopped." });
  };

  void loop().catch((e) => opts.onStatus({ phase: "stopped", text: `Error: ${e?.message ?? e}` }));
  return { stop: () => { stopped = true; } };
}

/** One message, with the picture, to a named WhatsApp chat. Never touches any lead. */
export async function sendTest(chatName: string): Promise<{ ok: boolean; error?: string; template: string }> {
  const image = await findImage();
  const tpl = pickAutoTemplate(null, await messagePool());
  const res = await sendOne({ chatName, text: renderAutoTemplate(tpl.text, ""), image });
  return { ok: res.ok, error: res.ok ? undefined : res.error, template: tpl.name };
}

/** One message, with the picture, to a phone number. Same path as a lead (opened by number). Never touches any lead. */
export async function sendTestNumber(rawNumber: string): Promise<{ ok: boolean; error?: string; template: string }> {
  const digits = normalizePhone(rawNumber);
  if (!digits) return { ok: false, error: "Enter a valid 10-digit mobile number", template: "" };
  const image = await findImage();
  const tpl = pickAutoTemplate(null, await messagePool());
  const res = await sendOne({ digits, text: renderAutoTemplate(tpl.text, ""), image });
  return { ok: res.ok, error: res.ok ? undefined : res.error, template: tpl.name };
}

/**
 * Full flow test, from the app only: one unsent lead of the chosen list, the same path as a real send (opened by number in
 * WhatsApp Business, image + message, Send pressed by the accessibility service, then marked sent on the server). It skips
 * the 10 AM-7 PM window and the daily cap, and it only ever sends once.
 */
export async function runFullFlowOnce(origin?: string): Promise<{ ok: boolean; lead?: string; error?: string }> {
  const image = await findImage();
  if (!image) return { ok: false, error: "Choose an image first." };
  let lead: api.Lead | undefined;
  try {
    const page = await api.listLeadsPage({ page: 1, status: "all", limit: 50, origin });
    lead = page.leads.find((l) => !l.whatsappSentAt && !l.archived && normalizePhone(l.phone));
  } catch (e) {
    return { ok: false, error: `Couldn't load leads: ${(e as Error)?.message ?? e}` };
  }
  if (!lead) return { ok: false, error: "No unsent lead in this list." };
  const digits = normalizePhone(lead.phone)!;
  const tpl = pickAutoTemplate(null, await messagePool());
  const res = await sendOne({ digits, text: renderAutoTemplate(tpl.text, lead.name), image });
  let state = await loadState();
  const entry = { at: Date.now(), name: lead.name, phone: lead.phone, template: `${tpl.name} (full test)`, ok: res.ok, error: res.ok ? undefined : res.error };
  if (res.ok) {
    await api.setWhatsAppSent(lead.id, true, null, tpl.name).catch(() => undefined);
    state = { ...state, sentToday: state.sentToday + 1, sentTotal: state.sentTotal + 1, lastTemplateId: tpl.id, log: [entry, ...state.log] };
  } else {
    if (isNotOnWhatsApp(res.error)) await api.setWhatsAppSent(lead.id, true, null, NO_WHATSAPP_NOTE).catch(() => undefined);
    state = { ...state, log: [entry, ...state.log] };
  }
  await saveState(state);
  return res.ok ? { ok: true, lead: lead.name || lead.phone } : { ok: false, lead: lead.name || lead.phone, error: res.error };
}

/** Clears the on-tablet counters (today, total) and the log. Does not change any lead on the server. */
export async function resetAutoCounts(): Promise<void> {
  await saveState(fresh());
}
