import * as ocrApi from "../api/ocr";
import { scanImageLocal } from "./client";

/**
 * Local-first, cloud-fallback OCR: tries the family's local server first (see
 * localServer/client.ts), and — if it's unset, unreachable, or doesn't have a usable result for
 * this target (including today's expected 501 stub) — falls back to the existing cloud OCR at
 * api/ocr.ts exactly as before. Shared by ContactFormScreen and TransactionFormScreen so the
 * try/fallback logic lives in one place.
 */
export async function scanImageWithFallback(
  base64: string,
  target: "contact"
): Promise<ocrApi.OcrContactResult>;
export async function scanImageWithFallback(
  base64: string,
  target: "receipt"
): Promise<ocrApi.OcrReceiptResult>;
export async function scanImageWithFallback(
  base64: string,
  target: "contact" | "receipt"
): Promise<ocrApi.OcrContactResult | ocrApi.OcrReceiptResult> {
  const local = await scanImageLocal(base64, target);
  if (target === "contact") {
    if (local?.contact) return local.contact;
    return ocrApi.scanImage(base64, "contact");
  }
  if (local?.receipt) return local.receipt;
  return ocrApi.scanImage(base64, "receipt");
}
