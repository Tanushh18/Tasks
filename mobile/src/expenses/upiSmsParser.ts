/**
 * Pure parser for bank UPI debit/credit SMS (no React Native imports, so it also runs headless and in Jest).
 *
 * What is accepted: a message with an amount (Rs / Rs. / INR / ₹), a direction word (debited / sent /
 * paid ... = OUT, credited / received = IN) and evidence that it is a UPI payment: either the word "UPI"
 * (or a VPA) or a transaction reference number. A message with a direction and amount but neither
 * (card swipes, ATM, NEFT, bank charges) is NOT parsed: this feature tracks UPI only, and without a
 * reference there is nothing safe to de-duplicate on.
 *
 * Always rejected: OTPs, failed / declined / reversed / pending messages and anything promotional.
 *
 * De-duplication key: the UPI reference (`upi-<ref>`). With no reference, a hash of
 * amount + date + time + merchant + last4 (`upi-h<hash>`).
 */

export type UpiDirection = "OUT" | "IN";

export interface ParsedUpiSms {
  type: UpiDirection;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24 hour) */
  time: string;
  merchant: string;
  /** UPI reference number; "" when the message has none. */
  ref: string;
  /** Last 4 digits of the account; "" when the message doesn't say. */
  accountLast4: string;
  bank?: string;
  balance?: number;
  /** Idempotency key: `upi-<ref>` or `upi-h<hash>` when there is no ref. */
  key: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const OTP_OR_FAILED = /\b(?:otp|one[\s-]?time|failed|failure|declined|reversed|reversal|unsuccessful|rejected|insufficient|cancell?ed|pending|will be credited|will be reversed|collect request|requested)\b/i;
const PROMO = /\b(?:offer|cashback|congratulations|congrats|pre-?approved|apply now|click|loan|emi|discount|voucher|reward|win)\b|https?:\/\/|www\./i;

/** True for OTP / failed / reversed / promotional messages that must never become an expense. */
export function isObviouslyNotTransaction(body: string): boolean {
  return OTP_OR_FAILED.test(body) || PROMO.test(body);
}

const AMOUNT = /(?:\bRs\.?|\bINR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const OUT_WORD = /\b(?:debited|sent|paid|transferred|deducted)\b/i;
const IN_WORD = /\b(?:credited|received)\b/i;

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

function findDate(text: string): string | null {
  // 04Oct26, 04-Oct-2026, 4 Oct 26
  for (const m of text.matchAll(/\b(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2}|\d{4})\b/g)) {
    const month = MONTHS[m[2].toLowerCase()];
    const y = fullYear(Number(m[3]));
    if (month && validYmd(y, month, Number(m[1]))) return `${y}-${pad(month)}-${pad(Number(m[1]))}`;
  }
  // 04/10/26, 04-10-2026 (day first, the Indian convention)
  for (const m of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/g)) {
    const y = fullYear(Number(m[3]));
    if (validYmd(y, Number(m[2]), Number(m[1]))) return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  // 2026-10-04
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    if (validYmd(Number(m[1]), Number(m[2]), Number(m[3]))) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function findTime(text: string): string | null {
  const m = text.match(/\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(am|pm)?\b/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${pad(h)}:${m[2]}`;
}

function findRef(text: string): string {
  const m =
    text.match(/\b(?:UPI\s*)?(?:Ref(?:erence)?(?:\s*(?:No|Number|ID))?|Refno|RRN|UTR|Txn\s*(?:Id|No))\b\.?\s*[:#-]?\s*(\d{3,})/i) ??
    text.match(/\bUPI\/(?:[A-Z0-9]+\/)?(\d{9,})/i);
  return m ? m[1] : "";
}

function findLast4(text: string): string {
  const m = text.match(/\b(?:a\/c|acct?|account)\.?\s*(?:no\.?\s*)?(?:ending\s*(?:with\s*)?)?[:-]?\s*[Xx*•]*\s*(\d{4,})/i);
  return m ? m[1].slice(-4) : "";
}

function findBank(text: string): string | undefined {
  if (/State Bank of India|\bSBI\b/i.test(text)) return "SBI";
  const m = text.match(/\b([A-Za-z&]+)\s+Bank\b/);
  if (m && !/^(?:the|your|a|of|this|my|from|to|bank)$/i.test(m[1])) return `${m[1]} Bank`;
  return undefined;
}

function findBalance(text: string): number | undefined {
  const m = text.match(/\b(?:Avl\.?\s*)?Bal(?:ance)?\b[^\d]{0,15}([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function findMerchant(text: string, type: UpiDirection): string {
  const pattern =
    type === "OUT"
      ? /\b(?:to|paid to|trf to)\s+(?!a\/c\b|ac\b|account\b)(?:VPA\s+)?(.+)/i
      : /\b(?:from|by)\s+(?!a\/c\b|ac\b|account\b)(?:VPA\s+)?(.+)/i;
  const m = text.match(pattern);
  if (!m) return "";
  let rest = m[1];
  const cut = rest.search(
    /\s+(?:on|at|dated)\s+\d|[.,;]?\s*(?:UPI\s*)?\b(?:Ref|Refno|RRN|UTR|Txn)\b|\.\s*(?:Bal|Avl|Available|Not you|If not)|\s*\(|\s+(?:Bal|Avl)\b/i
  );
  if (cut >= 0) rest = rest.slice(0, cut);
  rest = rest.replace(/[.\s,;-]+$/g, "").trim();
  // "name@okhdfc JOHN DOE" -> prefer the readable name over the VPA.
  const words = rest.split(/\s+/);
  if (words.length > 1 && words[0].includes("@")) rest = words.slice(1).join(" ");
  return rest.slice(0, 60);
}

/** Small stable hash (FNV-1a, 32 bit) for the no-reference dedupe key. */
export function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function buildDedupeKey(p: { ref: string; amount: number; date: string; time: string; merchant: string; accountLast4: string }): string {
  if (p.ref) return `upi-${p.ref}`;
  return `upi-h${hash32([p.amount.toFixed(2), p.date, p.time, p.merchant.toLowerCase(), p.accountLast4].join("|"))}`;
}

function localParts(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * @param receivedAtMs when the SMS arrived; used for the date / time if the text has none.
 */
export function parseUpiSms(body: string, receivedAtMs?: number): ParsedUpiSms | null {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (!text || isObviouslyNotTransaction(text)) return null;

  const amountMatch = text.match(AMOUNT);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const out = text.search(OUT_WORD);
  const inn = text.search(IN_WORD);
  if (out < 0 && inn < 0) return null;
  const type: UpiDirection = out >= 0 && (inn < 0 || out < inn) ? "OUT" : "IN";

  const ref = findRef(text);
  if (!ref && !/\bUPI\b|\bVPA\b|@[a-z]{2,}/i.test(text)) return null;

  const merchant = findMerchant(text, type) || "Unknown";
  const fallback = receivedAtMs ? localParts(receivedAtMs) : localParts(Date.now());
  const date = findDate(text) ?? fallback.date;
  const time = findTime(text) ?? (receivedAtMs ? fallback.time : "00:00");
  const accountLast4 = findLast4(text);

  return {
    type,
    amount,
    date,
    time,
    merchant,
    ref,
    accountLast4,
    bank: findBank(text),
    balance: findBalance(text),
    key: buildDedupeKey({ ref, amount, date, time, merchant, accountLast4 }),
  };
}

const SENDER_LOOKS_LIKE_BANK = /^(?:[A-Za-z]{2}-)?[A-Za-z0-9]{3,10}(?:-[A-Za-z])?$/;

/**
 * "Clearly looks like a money message": amount + a money word, from a sender id that looks like a bank
 * (not a plain phone number) and not an OTP / promo / failure. Used to decide whether the AI fallback
 * is worth a call when the regex parser returned null.
 */
export function looksLikeTransaction(body: string, address: string): boolean {
  const text = (body ?? "").replace(/\s+/g, " ");
  if (!AMOUNT.test(text)) return false;
  if (!/\b(?:debit(?:ed)?|credit(?:ed)?|paid|sent|received|upi|txn|transfer(?:red)?|withdrawn|spent)\b/i.test(text)) return false;
  const sender = (address ?? "").trim();
  if (!/[A-Za-z]/.test(sender) || !SENDER_LOOKS_LIKE_BANK.test(sender)) return false;
  return !isObviouslyNotTransaction(text);
}

/** Validates an AI-extracted transaction the same way the regex parser's output is shaped. */
export function fromExtracted(x: {
  type: string;
  amount: number;
  date?: string | null;
  time?: string | null;
  merchant?: string | null;
  ref?: string | null;
  accountLast4?: string | null;
}, receivedAtMs?: number): ParsedUpiSms | null {
  if (x.type !== "IN" && x.type !== "OUT") return null;
  if (!Number.isFinite(x.amount) || x.amount <= 0) return null;
  const fb = receivedAtMs ? localParts(receivedAtMs) : localParts(Date.now());
  const date = x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : fb.date;
  const time = x.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : receivedAtMs ? fb.time : "00:00";
  const ref = (x.ref ?? "").replace(/\D/g, "");
  const accountLast4 = (x.accountLast4 ?? "").replace(/\D/g, "").slice(-4);
  const merchant = (x.merchant ?? "").trim().slice(0, 60) || "Unknown";
  return { type: x.type, amount: x.amount, date, time, merchant, ref, accountLast4, key: buildDedupeKey({ ref, amount: x.amount, date, time, merchant, accountLast4 }) };
}
