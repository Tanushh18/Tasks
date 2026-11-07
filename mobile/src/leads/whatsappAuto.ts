import { requireOptionalNativeModule } from "expo";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * Android-only wrapper over the WhatsAppAutoSender native module (modules/whatsapp-auto-sender). On iOS, or on an APK
 * built before the module existed, everything here reports "not supported" and does nothing.
 */
interface Native {
  isServiceEnabled(): boolean;
  openAccessibilitySettings(): void;
  whatsappPackage(): string;
  startJob(pkg: string, imageUri: string | null, mime: string, text: string, digits: string | null, chatName: string | null): boolean;
  jobState(): { state: "idle" | "running" | "done" | "failed"; message: string };
  cancelJob(): void;
}

const Native: Native | null = Platform.OS === "android" ? requireOptionalNativeModule<Native>("WhatsAppAutoSender") : null;

export const autoSendSupported = !!Native;
export const isServiceEnabled = (): boolean => { try { return !!Native?.isServiceEnabled(); } catch { return false; } };
export const openAccessibilitySettings = (): void => { try { Native?.openAccessibilitySettings(); } catch { /* ignore */ } };
/** "com.whatsapp.w4b" if WhatsApp Business is installed, else "com.whatsapp", else "". */
export const whatsappPackage = (): string => { try { return Native?.whatsappPackage() ?? ""; } catch { return ""; } };
export const cancelJob = (): void => { try { Native?.cancelJob(); } catch { /* ignore */ } };

/** The folder the image lives in. Anything pushed here (or picked in the app) is what gets sent. */
export const imageDir = (): string => `${FileSystem.documentDirectory ?? ""}whatsapp-auto/`;

/** First run: saves the bundled ad picture (assets/whatsapp/ad01.png) into the folder so there is always an image to send. */
async function seedBundledImage(): Promise<void> {
  const dir = imageDir();
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  if (names.some((n) => /\.(jpe?g|png|webp)$/i.test(n))) return;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const asset = Asset.fromModule(require("../../assets/whatsapp/ad01.png"));
  await asset.downloadAsync();
  if (asset.localUri) await FileSystem.copyAsync({ from: asset.localUri, to: `${dir}ad01.png` });
}

/** Newest image file in the folder, or null. */
export async function findImage(): Promise<{ uri: string; mime: string } | null> {
  const dir = imageDir();
  try {
    await seedBundledImage().catch(() => undefined);
    const names = (await FileSystem.readDirectoryAsync(dir)).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort();
    if (!names.length) return null;
    const name = names[names.length - 1];
    const mime = /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";
    return { uri: dir + name, mime };
  } catch {
    return null;
  }
}

export async function saveImageToFolder(sourceUri: string, mime: string): Promise<void> {
  const dir = imageDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  // Only one image is kept: a new pick replaces the old one.
  for (const n of await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[])) await FileSystem.deleteAsync(dir + n, { idempotent: true });
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  await FileSystem.copyAsync({ from: sourceUri, to: `${dir}promo.${ext}` });
}

export interface SendRequest {
  text: string;
  /** Lead's number including country code, digits only. Leave out when `chatName` is used. */
  digits?: string;
  /** Test mode: pick this chat by name from WhatsApp's "Send to" list instead of using a number. */
  chatName?: string;
  image?: { uri: string; mime: string } | null;
}

export type SendResult = { ok: true } | { ok: false; error: string };

const POLL_MS = 1000;
const MAX_WAIT_MS = 80_000;

/** Opens the chat and waits for the accessibility service to press Send. */
export async function sendOne(req: SendRequest): Promise<SendResult> {
  if (!Native) return { ok: false, error: "Auto send isn't available in this build" };
  if (!isServiceEnabled()) return { ok: false, error: "Turn on the accessibility service first" };
  const pkg = whatsappPackage();
  if (!pkg) return { ok: false, error: "WhatsApp isn't installed" };
  const contentUri = req.image ? await FileSystem.getContentUriAsync(req.image.uri) : null;
  const started = Native.startJob(pkg, contentUri, req.image?.mime ?? "image/jpeg", req.text, req.digits ?? null, req.chatName ?? null);
  if (!started) return { ok: false, error: "The accessibility service isn't running" };
  const t0 = Date.now();
  while (Date.now() - t0 < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const s = Native.jobState();
    if (s.state === "done") return { ok: true };
    if (s.state === "failed") return { ok: false, error: s.message || "Failed" };
  }
  Native.cancelJob();
  return { ok: false, error: "Timed out" };
}
