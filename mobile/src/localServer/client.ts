import axios from "axios";
import { getLocalServerUrl } from "./config";

/**
 * Talks directly to the family's local server (see local-server/ at the repo root) with a plain
 * axios call — deliberately NOT `apiClient` from api/client.ts, since the local server has no
 * bearer auth or refresh-token flow, and mixing it into that interceptor chain would risk it
 * being treated as an authenticated Render request. Every call here is best-effort: any failure
 * (unreachable host, timeout, non-2xx — including today's expected 501 stub responses) resolves
 * to `null` rather than throwing, so callers can fall back to the cloud silently.
 */

const HEALTH_TIMEOUT_MS = 2500;
const OCR_TIMEOUT_MS = 15000;
const VOICE_TIMEOUT_MS = 8000;

export interface LocalHealth {
  ok: boolean;
  ocrReady: boolean;
  voiceReady: boolean;
}

export async function pingLocalServer(url?: string): Promise<LocalHealth | null> {
  try {
    const base = url ?? (await getLocalServerUrl());
    if (!base) return null;
    const { data } = await axios.get(`${base}/health`, { timeout: HEALTH_TIMEOUT_MS });
    return { ok: data?.status === "ok", ocrReady: Boolean(data?.ocrReady), voiceReady: Boolean(data?.voiceReady) };
  } catch {
    return null;
  }
}

export interface LocalOcrContact {
  name: string;
  number: string;
}

export interface LocalOcrReceipt {
  amount: number;
  merchant: string;
  date: string;
  category: string;
}

export interface LocalOcrResult {
  contact?: LocalOcrContact;
  receipt?: LocalOcrReceipt;
}

export async function scanImageLocal(base64: string, target: "contact" | "receipt"): Promise<LocalOcrResult | null> {
  try {
    const base = await getLocalServerUrl();
    if (!base) return null;
    const { data } = await axios.post<LocalOcrResult>(
      `${base}/ocr/scan`,
      { image: base64, target },
      { timeout: OCR_TIMEOUT_MS }
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Best-effort scaffolding for the (currently stubbed) local voice endpoint — always resolves to
 * `null` today since local-server.js's /voice/process returns 501, but wires the call site so it
 * activates automatically once a real local engine is installed there.
 */
export async function processVoiceLocal(text: string): Promise<unknown | null> {
  try {
    const base = await getLocalServerUrl();
    if (!base) return null;
    const { data } = await axios.post(`${base}/voice/process`, { text }, { timeout: VOICE_TIMEOUT_MS });
    return data;
  } catch {
    return null;
  }
}
