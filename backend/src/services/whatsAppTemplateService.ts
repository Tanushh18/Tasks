import { WhatsAppTemplate, type WhatsAppTemplateDocument } from "../models/WhatsAppTemplate";
import { ApiError } from "../utils/ApiError";
import { isCloudinaryConfigured, removeFile, storeFile } from "./cloudinaryService";
import { generateText, isAiConfigured } from "./geminiService";

export const AI_NOT_SET_UP = "AI is not set up on the server";

export function serializeTemplate(t: WhatsAppTemplateDocument) {
  return {
    id: String(t._id),
    name: t.name,
    text: t.text,
    imageUrl: t.imageUrl || "",
    sheets: t.sheets ?? [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listTemplates() {
  return WhatsAppTemplate.find({}).sort({ createdAt: 1, _id: 1 });
}

/** A sheet uses at most one template: take these sheets off every other template (names compare case-insensitively). */
async function moveSheetsHere(templateId: unknown, sheets: string[]) {
  if (!sheets.length) return;
  const wanted = new Set(sheets.map((s) => s.toLowerCase()));
  const others = await WhatsAppTemplate.find({ _id: { $ne: templateId }, sheets: { $exists: true, $ne: [] } });
  for (const o of others) {
    const kept = o.sheets.filter((s) => !wanted.has(s.toLowerCase()));
    if (kept.length !== o.sheets.length) {
      o.sheets = kept as any;
      await o.save();
    }
  }
}

/** Stores a new data-URL image (Cloudinary when configured, else the data URL itself); https URLs are kept as given. */
async function applyImage(doc: WhatsAppTemplateDocument, imageUrl: string | null) {
  if (imageUrl === null || imageUrl === "") {
    await removeFile(doc.imagePublicId, doc.imageResourceType);
    doc.imageUrl = "";
    doc.imagePublicId = null;
    doc.imageResourceType = null;
    return;
  }
  if (imageUrl === doc.imageUrl) return;
  if (imageUrl.startsWith("data:")) {
    const stored = await storeFile(imageUrl, "whatsapp-templates");
    await removeFile(doc.imagePublicId, doc.imageResourceType);
    doc.imageUrl = stored.url;
    doc.imagePublicId = stored.publicId;
    doc.imageResourceType = stored.resourceType;
    return;
  }
  // A plain https link typed in or copied from elsewhere: we don't own the file, so nothing to clean up later.
  await removeFile(doc.imagePublicId, doc.imageResourceType);
  doc.imageUrl = imageUrl;
  doc.imagePublicId = null;
  doc.imageResourceType = null;
}

export interface TemplateInput {
  name?: string;
  text?: string;
  imageUrl?: string | null;
  sheets?: string[];
}

export async function createTemplate(userId: string, input: TemplateInput) {
  const doc = new WhatsAppTemplate({ name: input.name, text: input.text, sheets: input.sheets ?? [], createdBy: userId });
  if (input.imageUrl) await applyImage(doc, input.imageUrl);
  await doc.save();
  await moveSheetsHere(doc._id, doc.sheets);
  return doc;
}

export async function updateTemplate(id: string, input: TemplateInput) {
  const doc = await WhatsAppTemplate.findById(id);
  if (!doc) throw ApiError.notFound("Template not found");
  if (input.name !== undefined) doc.name = input.name;
  if (input.text !== undefined) doc.text = input.text;
  if (input.sheets !== undefined) doc.sheets = input.sheets as any;
  if (input.imageUrl !== undefined) await applyImage(doc, input.imageUrl);
  await doc.save();
  await moveSheetsHere(doc._id, doc.sheets);
  return doc;
}

export async function deleteTemplate(id: string) {
  const doc = await WhatsAppTemplate.findByIdAndDelete(id);
  if (!doc) throw ApiError.notFound("Template not found");
  await removeFile(doc.imagePublicId, doc.imageResourceType);
}

export function aiStatus() {
  return { connected: isAiConfigured(), provider: "Gemini", imageStorage: isCloudinaryConfigured() ? "cloudinary" : "inline" };
}

const SYSTEM = [
  "You rewrite a rough WhatsApp message that a real-estate / services team sends to leads.",
  "Write a polished, friendly, short WhatsApp message (a few short lines, at most about 600 characters).",
  "Keep the language of the sample: if it is Hindi, Hinglish or English, answer in the same language and script.",
  "Keep every {name} placeholder exactly as written; never invent a name, price, link, phone number or offer that is not in the sample.",
  "Sound human and warm. Avoid spammy words and tricks (free, guaranteed, limited offer, urgent, act now, winner, !!!, ALL CAPS, many emojis; at most one emoji).",
  "Reply with the message text only: no quotes, no title, no explanations.",
].join("\n");

/** Rewrites rough text into a WhatsApp-friendly message. 503 when no AI key is configured. */
export async function improveMessage(rough: string): Promise<string> {
  if (!isAiConfigured()) throw new ApiError(503, "AI_NOT_CONFIGURED", AI_NOT_SET_UP);
  let out = await generateText({ prompt: `Rough message:\n${rough}`, systemInstruction: SYSTEM });
  out = out.replace(/^```[a-z]*\n?|```$/gi, "").trim().replace(/^["“](.*)["”]$/s, "$1").trim();
  if (!out) throw new ApiError(502, "AI_EMPTY", "The AI didn't return a message. Try again.");
  if (rough.includes("{name}") && !out.includes("{name}")) out = `Hi {name},\n${out}`;
  return out.slice(0, 2000);
}
