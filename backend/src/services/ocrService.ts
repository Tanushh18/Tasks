import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { isAiConfigured } from "./geminiService";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.geminiApiKey) {
    throw new ApiError(
      503,
      "AI_NOT_CONFIGURED",
      "The AI assistant isn't set up yet. Add GEMINI_API_KEY to the backend .env file to enable it."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return client;
}

function stripDataUrlPrefix(base64: string): string {
  const match = /^data:[^;]+;base64,(.*)$/s.exec(base64);
  return match ? match[1] : base64;
}

function extractJson(text: string): unknown {
  let cleaned = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(cleaned);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    throw ApiError.badRequest("Could not read that image clearly — try a clearer photo.");
  }
}

async function runOcrPrompt(base64: string, prompt: string): Promise<unknown> {
  if (!isAiConfigured()) {
    throw new ApiError(
      503,
      "AI_NOT_CONFIGURED",
      "The AI assistant isn't set up yet. Add GEMINI_API_KEY to the backend .env file to enable it."
    );
  }

  const response = await getClient().models.generateContent({
    model: env.geminiModel,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: stripDataUrlPrefix(base64) } }],
      },
    ],
  });

  const text = response.text;
  if (!text) {
    throw ApiError.badRequest("Could not read that image clearly — try a clearer photo.");
  }
  return extractJson(text);
}

const contactSchema = z.object({
  name: z.string().min(1),
  number: z.string().min(1),
});

const receiptSchema = z.object({
  amount: z.number(),
  merchant: z.string().min(1),
  date: z.string().min(1),
  category: z.string().min(1),
});

export async function extractContactFromImage(base64: string): Promise<{ name: string; number: string }> {
  const prompt =
    "You are an OCR engine reading a photo of a business card or a phone contact screen. " +
    "Respond with ONLY minified JSON, no markdown, no explanation, matching exactly this shape: " +
    '{"name":"<full name>","number":"<phone number>"}. ' +
    "If a field is unreadable, make your best guess rather than leaving it empty.";

  const json = await runOcrPrompt(base64, prompt);
  const result = contactSchema.safeParse(json);
  if (!result.success) {
    throw ApiError.badRequest("Could not read that image clearly — try a clearer photo.");
  }
  return result.data;
}

export async function extractReceiptFromImage(
  base64: string
): Promise<{ amount: number; merchant: string; date: string; category: string }> {
  const prompt =
    "You are an OCR engine reading a photo of a purchase receipt. " +
    "Respond with ONLY minified JSON, no markdown, no explanation, matching exactly this shape: " +
    '{"amount":<number, total amount as a plain number with no currency symbol>,"merchant":"<merchant/store name>","date":"<ISO 8601 date, YYYY-MM-DD>","category":"<a short spending category like Groceries, Dining, Transport, Shopping>"}. ' +
    "If a field is unreadable, make your best guess rather than leaving it empty.";

  const json = await runOcrPrompt(base64, prompt);
  const result = receiptSchema.safeParse(json);
  if (!result.success) {
    throw ApiError.badRequest("Could not read that image clearly — try a clearer photo.");
  }
  return result.data;
}
