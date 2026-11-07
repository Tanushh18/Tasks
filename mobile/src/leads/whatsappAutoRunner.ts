import AsyncStorage from "@react-native-async-storage/async-storage";
import * as api from "../api/leads";
import { decide, dailyTarget, dayKey, randomGapMs } from "./whatsappAutoPlan";
import { findImage, sendOne } from "./whatsappAuto";
import { pickAutoTemplate, renderAutoTemplate } from "./whatsappAutoTemplates";

const STATE_KEY = "leads.whatsappAuto.state.v1";

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

/**
 * Sends to the saved leads of a sheet one at a time, following whatsappAutoPlan. Leads that already have WhatsApp marked
 * as sent are skipped, and a lead is marked as sent on the server right after WhatsApp's Send was pressed. Stops when
 * `stop()` is called or there is nobody left to message.
 */
export function startRunner(opts: { origin?: string; onStatus: (s: RunStatus) => void; onState: (s: AutoState) => void }): RunnerHandle {
  let stopped = false;
  const skipped = new Set<string>();

  const loop = async () => {
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
      const tpl = pickAutoTemplate(state.lastTemplateId);
      opts.onStatus({ phase: "sending", text: `Sending to ${lead.name || lead.phone}...` });
      const res = await sendOne({ digits, text: renderAutoTemplate(tpl.text, lead.name), image });
      const entry = { at: Date.now(), name: lead.name, phone: lead.phone, template: tpl.name, ok: res.ok, error: res.ok ? undefined : res.error };
      if (res.ok) {
        // Server marks it sent so it shows on the lead and is never messaged twice.
        await api.setWhatsAppSent(lead.id, true, null, tpl.name).catch(() => undefined);
        state = { ...state, sentToday: state.sentToday + 1, sentTotal: state.sentTotal + 1, lastTemplateId: tpl.id, nextDueAt: Date.now() + randomGapMs(), log: [entry, ...state.log] };
      } else {
        skipped.add(lead.id);
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

/** Test only: one message, with the picture, to the WhatsApp chat named `chatName`. Never touches any lead. */
export async function sendTest(chatName: string): Promise<{ ok: boolean; error?: string; template: string }> {
  const image = await findImage();
  const tpl = pickAutoTemplate(null);
  const res = await sendOne({ chatName, text: renderAutoTemplate(tpl.text, chatName), image });
  return { ok: res.ok, error: res.ok ? undefined : res.error, template: tpl.name };
}
