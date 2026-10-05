import { z } from "zod";
import { ApiError } from "../utils/ApiError";
import { generateText, isAiConfigured } from "./geminiService";

const extractedSchema = z.object({
  isTransaction: z.boolean(),
  type: z.enum(["IN", "OUT"]).optional(),
  amount: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  merchant: z.string().max(80).nullish(),
  ref: z.string().max(40).nullish(),
  accountLast4: z.string().max(8).nullish(),
});

export interface ExtractedSmsTransaction {
  type: "IN" | "OUT";
  amount: number;
  date: string | null;
  time: string | null;
  merchant: string | null;
  ref: string | null;
  accountLast4: string | null;
}

const SYSTEM = `You extract one UPI bank transaction from a single Indian bank SMS.
Reply with ONLY a JSON object, no prose, no code fences, with these keys:
isTransaction (boolean: true only for a completed UPI debit or credit; false for OTPs, promotions, failed/declined/reversed payments, balance alerts, anything else),
type ("OUT" for money leaving the account, "IN" for money received),
amount (number, rupees),
date (YYYY-MM-DD or null),
time (HH:mm 24-hour or null),
merchant (payee or sender name or null),
ref (UPI reference number digits or null),
accountLast4 (last 4 digits of the account or null).
Never invent values: use null when the SMS does not say.`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Asks the AI to read an SMS the app's regex parser could not. Only the SMS text is sent to the model and
 * nothing is stored. Returns null when it isn't a completed transaction or the answer is unusable; throws
 * a 503 ApiError when AI isn't configured.
 */
export async function parseSmsWithAi(body: string): Promise<ExtractedSmsTransaction | null> {
  if (!isAiConfigured()) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "AI isn't set up on the server (GEMINI_API_KEY).");
  }
  const raw = await generateText({ prompt: body, systemInstruction: SYSTEM });
  const parsed = extractedSchema.safeParse(extractJson(raw));
  if (!parsed.success || !parsed.data.isTransaction || !parsed.data.type || !parsed.data.amount) return null;
  const d = parsed.data;
  return {
    type: d.type!,
    amount: d.amount!,
    date: d.date ?? null,
    time: d.time ?? null,
    merchant: d.merchant ?? null,
    ref: d.ref ?? null,
    accountLast4: d.accountLast4 ?? null,
  };
}
