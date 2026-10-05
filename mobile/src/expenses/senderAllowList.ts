/**
 * Only SMS from these senders are read for UPI expense tracking. Everything else is ignored completely:
 * never parsed, never queued, never sent to the AI fallback.
 *
 * Matched case-insensitively against the dash-separated parts of the sender address, so "VM-FEDBNK",
 * "AX-FEDMOBILE-S", "FEDBNK" and "FedMobile" all match, but "VM-HDFCBK" and "AX-AMAZON" do not.
 * Both ids are listed because the id shown in the Messages app may differ from the real SMS address.
 * To support another bank, add its sender id here AND to ALLOWED_SENDERS in
 * modules/sms-expense-reader/.../SmsExpenseReaderModule.kt (the native side filters first).
 *
 * Safety net (documented in docs): a saved contact name can replace the sender id in the SMS database. A
 * message from an unlisted address is therefore still accepted when its body ends with the bank's
 * signature "-Federal Bank" AND the regex parser reads it as a UPI transaction. Such messages never go to the AI.
 */
export const ALLOWED_SENDERS: readonly string[] = ["FEDBNK", "FEDMOBILE"];

export const ALLOWED_SENDERS_LABEL = "Federal Bank messages (FEDBNK / FedMobile)";

export function isAllowedSender(address: string | null | undefined): boolean {
  if (!address) return false;
  const parts = address
    .toUpperCase()
    .split("-")
    .map((p) => p.trim());
  return parts.some((p) => ALLOWED_SENDERS.includes(p));
}

const FEDERAL_SIGNATURE = /-\s*Federal Bank\s*\.?\s*$/i;

export function hasFederalSignature(body: string | null | undefined): boolean {
  return !!body && FEDERAL_SIGNATURE.test(body.trim());
}
