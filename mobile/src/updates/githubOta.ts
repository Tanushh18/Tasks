import * as FileSystem from "expo-file-system/legacy";

/**
 * GitHub-only over-the-air updates. `publish-ota.yml` builds a Hermes bundle and uploads it, with an
 * `ota-manifest.json`, to the release tagged `ota-<runtimeVersion>`. This module downloads it into
 * files/ota/, where the native `OtaBundle` (plugins/withGithubOta.js) picks it up on the next launch.
 */

const REPO = "Tanushh18/Tasks";

/** app.json `version` of the APK. A bundle only runs on an APK with the same runtime version. */
export const RUNTIME_VERSION = process.env.EXPO_PUBLIC_RUNTIME_VERSION ?? "";
/** When this JS bundle was built (epoch seconds). Baked into both the APK's bundle and every OTA bundle. */
export const OWN_VERSION = Number(process.env.EXPO_PUBLIC_OTA_VERSION ?? 0) || 0;

const OTA_DIR = `${FileSystem.documentDirectory ?? ""}ota/`;

export interface OtaManifest {
  version: number;
  runtimeVersion: string;
  size: number;
}

export interface InstallContext {
  runtimeVersion: string;
  ownVersion: number;
  stagedVersion: number;
  badVersion: number;
}

/** Whether `manifest` is a bundle this install should download. */
export function shouldInstall(manifest: OtaManifest, ctx: InstallContext): boolean {
  if (!ctx.runtimeVersion || manifest.runtimeVersion !== ctx.runtimeVersion) return false;
  if (!Number.isFinite(manifest.version) || manifest.size <= 0) return false;
  if (manifest.version <= Math.max(ctx.ownVersion, ctx.stagedVersion)) return false;
  if (manifest.version <= ctx.badVersion) return false;
  return true;
}

async function readNumber(name: string, line = 0): Promise<number> {
  try {
    const text = await FileSystem.readAsStringAsync(OTA_DIR + name);
    return Number(text.trim().split("\n")[line]) || 0;
  } catch {
    return 0;
  }
}

/** Tells the native side this launch got far enough to be trusted (otherwise it rolls the bundle back). */
export async function confirmOtaBoot(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.deleteAsync(OTA_DIR + "launching", { idempotent: true });
  } catch {
    // Nothing to confirm.
  }
}

/** Downloads a newer bundle if the release has one. Takes effect the next time the app is opened. */
export async function downloadOtaUpdate(): Promise<boolean> {
  if (__DEV__ || !RUNTIME_VERSION || !FileSystem.documentDirectory) return false;

  const base = `https://github.com/${REPO}/releases/download/ota-${RUNTIME_VERSION}`;
  const res = await fetch(`${base}/ota-manifest.json?t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) return false; // no OTA published for this runtime yet
  const manifest = (await res.json()) as OtaManifest;

  const ctx: InstallContext = {
    runtimeVersion: RUNTIME_VERSION,
    ownVersion: OWN_VERSION,
    stagedVersion: await readNumber("current.meta", 1),
    badVersion: await readNumber("bad"),
  };
  if (!shouldInstall(manifest, ctx)) return false;

  await FileSystem.makeDirectoryAsync(OTA_DIR, { intermediates: true });
  // A fresh file each time: the running app may have current.bundle memory-mapped, so never overwrite it in place.
  const tmp = `${OTA_DIR}download-${manifest.version}.bundle`;
  try {
    const result = await FileSystem.downloadAsync(`${base}/index.android.bundle`, tmp);
    if (result.status !== 200) throw new Error(`bundle download failed: ${result.status}`);
    const info = await FileSystem.getInfoAsync(tmp);
    if (!info.exists || info.size !== manifest.size) throw new Error("bundle download incomplete");

    // Meta goes last: native only trusts a bundle that has both files.
    await FileSystem.deleteAsync(OTA_DIR + "current.meta", { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: OTA_DIR + "current.bundle" });
    await FileSystem.writeAsStringAsync(OTA_DIR + "current.meta", `${manifest.runtimeVersion}\n${manifest.version}`);
    return true;
  } catch (error) {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}
