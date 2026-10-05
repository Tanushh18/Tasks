import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import type { WhatsAppTemplate } from "../api/leads";

/** Largest image a template may carry (the server enforces the same cap). */
export const MAX_TEMPLATE_IMAGE_BYTES = 2 * 1024 * 1024;

/** Sheets a template can always be attached to, even before any lead carries that name. */
export const BASE_SHEETS = ["OLF Data", "Meta Sheet", "Calling Data", "My contacts"];

/** Template text for one lead: every {name} becomes the lead's name (or nothing), with tidy spacing. */
export function fillTemplate(text: string, name: string | undefined | null): string {
  const first = (name ?? "").trim();
  return text
    .replace(/\{name\}/gi, first)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

/** The template attached to a sheet (origin), compared ignoring case; undefined when that sheet has none. */
export function templateForOrigin(templates: WhatsAppTemplate[], origin: string | undefined | null): WhatsAppTemplate | undefined {
  const o = (origin ?? "").trim().toLowerCase();
  if (!o) return undefined;
  return templates.find((t) => t.sheets.some((s) => s.trim().toLowerCase() === o));
}

/** wa.me link to a number with the message prefilled. `digits` already has the country code. */
export function whatsappUrl(digits: string, text?: string): string {
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

/** Decoded size of a base64 data URL, in bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((b64.length * 3) / 4);
}

export type PickedImage = { dataUrl: string } | { error: string } | null;

/** Photo library picker for a template image. Null when cancelled; `error` when it can't be used (e.g. over 2 MB). */
export async function pickTemplateImage(): Promise<PickedImage> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { error: "Allow photo access to pick an image." };
  // Compressed a little so ordinary phone photos fit under the cap.
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.5 });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType === "image/png" || asset.mimeType === "image/webp" ? asset.mimeType : "image/jpeg";
  const dataUrl = `data:${mime};base64,${asset.base64}`;
  if (dataUrlBytes(dataUrl) > MAX_TEMPLATE_IMAGE_BYTES) return { error: "That image is over 2 MB. Pick a smaller one." };
  return { dataUrl };
}

/**
 * Saves the template image to the cache and opens the phone's share sheet so the person can send it on WhatsApp.
 * WhatsApp can't be given text and an image together by this app, so this is the second step after the text.
 */
export async function shareTemplateImage(imageUrl: string): Promise<void> {
  const mime = /^data:(image\/[a-z+]+);/i.exec(imageUrl)?.[1] ?? "image/jpeg";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const uri = `${FileSystem.cacheDirectory}whatsapp-${Date.now()}.${ext}`;
  if (/^https?:\/\//i.test(imageUrl)) {
    const res = await FileSystem.downloadAsync(imageUrl, uri);
    if (res.status < 200 || res.status >= 300) throw new Error(`Download failed (${res.status})`);
  } else {
    await FileSystem.writeAsStringAsync(uri, imageUrl.slice(imageUrl.indexOf(",") + 1), { encoding: FileSystem.EncodingType.Base64 });
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone");
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: "Send image on WhatsApp" });
}
