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
/** "com.whatsapp.w4b" when WhatsApp Business is installed, else "". Normal WhatsApp is never used. */
export const whatsappPackage = (): string => { try { return Native?.whatsappPackage() ?? ""; } catch { return ""; } };
export const cancelJob = (): void => { try { Native?.cancelJob(); } catch { /* ignore */ } };

/** The folder the image lives in. Anything pushed here (or picked in the app) is what gets sent. */
export const imageDir = (): string => `${FileSystem.documentDirectory ?? ""}whatsapp-auto/`;

const BUNDLE_VERSION = "bundle-v2";
const BUNDLED = [
  { file: "ad1.webp", mod: () => require("../../assets/whatsapp/ad1.webp") },
  { file: "ad2.webp", mod: () => require("../../assets/whatsapp/ad2.webp") },
  { file: "ad3.webp", mod: () => require("../../assets/whatsapp/ad3.webp") },
];

/**
 * First run (or after an app update that changes the bundled set): saves the three bundled ad pictures into the folder.
 * A marker file records the version so the copy isn't repeated on every run.
 */
async function seedBundledImages(): Promise<void> {
  const dir = imageDir();
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  if (names.includes(`.${BUNDLE_VERSION}`)) return;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  for (const n of names) await FileSystem.deleteAsync(dir + n, { idempotent: true });
  for (const b of BUNDLED) {
    const asset = Asset.fromModule(b.mod());
    await asset.downloadAsync();
    if (asset.localUri) await FileSystem.copyAsync({ from: asset.localUri, to: dir + b.file });
  }
  await FileSystem.writeAsStringAsync(dir + `.${BUNDLE_VERSION}`, "1");
}

/** All images in the folder, sorted by name. */
async function imageFiles(): Promise<string[]> {
  const dir = imageDir();
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  return names.filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort();
}

/**
 * One image for the next send, chosen at random from the folder (so the three ads rotate), or null when the folder is
 * empty. Each send re-reads the folder, so a changed image is used right away.
 */
export async function findImage(random: () => number = Math.random): Promise<{ uri: string; mime: string } | null> {
  try {
    await seedBundledImages().catch(() => undefined);
    const names = await imageFiles();
    if (!names.length) return null;
    const name = names[Math.min(names.length - 1, Math.floor(random() * names.length))];
    const mime = /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";
    return { uri: imageDir() + name, mime };
  } catch {
    return null;
  }
}

export async function saveImageToFolder(sourceUri: string, mime: string): Promise<void> {
  const dir = imageDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  // Only one image is kept: a new pick replaces the old one.
  for (const n of await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[])) await FileSystem.deleteAsync(dir + n, { idempotent: true });
  // Uploaded image replaces the bundled set; keep the marker so the bundle isn't copied back on the next run.
  await FileSystem.writeAsStringAsync(dir + `.${BUNDLE_VERSION}`, "1").catch(() => undefined);
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
  if (!pkg) return { ok: false, error: "WhatsApp Business isn't installed" };
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

/** Every image in the folder (for the screen), newest rotation pool. */
export async function listImages(): Promise<{ uri: string; name: string }[]> {
  try {
    await seedBundledImages().catch(() => undefined);
    return (await imageFiles()).map((name) => ({ uri: imageDir() + name, name }));
  } catch {
    return [];
  }
}
