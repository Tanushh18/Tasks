import { apiClient } from "./client";

export interface OcrContactResult {
  name: string;
  number: string;
}

export interface OcrReceiptResult {
  amount: number;
  merchant: string;
  date: string;
  category: string;
}

export async function scanImage(base64: string, target: "contact"): Promise<OcrContactResult>;
export async function scanImage(base64: string, target: "receipt"): Promise<OcrReceiptResult>;
export async function scanImage(
  base64: string,
  target: "contact" | "receipt"
): Promise<OcrContactResult | OcrReceiptResult> {
  const { data } = await apiClient.post<{ contact?: OcrContactResult; receipt?: OcrReceiptResult }>("/ocr/scan", {
    image: base64,
    target,
  });
  return target === "contact" ? (data.contact as OcrContactResult) : (data.receipt as OcrReceiptResult);
}
