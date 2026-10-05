import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

const REPO_OWNER = "Tanushh18";
const REPO_NAME = "Tasks";
const GITHUB_API = "https://api.github.com";
const RELEASE_TAG = "ota-release"; // Releases tagged with this are OTA bundles
const UPDATES_DIR = FileSystem.documentDirectory + "updates/";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

/**
 * Get the currently installed bundle version from secure storage.
 */
async function getInstalledVersion(): Promise<string> {
  try {
    const version = await SecureStore.getItemAsync("ota_bundle_version");
    return version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Save the newly installed bundle version to secure storage.
 */
async function setInstalledVersion(version: string): Promise<void> {
  try {
    await SecureStore.setItemAsync("ota_bundle_version", version);
  } catch (error) {
    console.warn("Failed to save OTA version:", error);
  }
}

/**
 * Fetch the latest release from GitHub.
 */
async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
      }
    );

    if (!response.ok) {
      console.debug(`GitHub API returned ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.debug("Failed to fetch GitHub release:", error);
    return null;
  }
}

/**
 * Download the bundle file from GitHub release assets.
 */
async function downloadBundle(downloadUrl: string, fileName: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(UPDATES_DIR, { intermediates: true });
  const filePath = UPDATES_DIR + fileName;

  const downloadResult = await FileSystem.downloadAsync(downloadUrl, filePath);

  if (downloadResult.status !== 200) {
    throw new Error(`Download failed with status ${downloadResult.status}`);
  }

  return filePath;
}

/**
 * Check for updates and download if available.
 * The actual bundle application happens on the next app restart via RootNavigator.
 */
export async function downloadAndApplyUpdate(): Promise<void> {
  // Fetch latest release from GitHub
  const release = await fetchLatestRelease();
  if (!release) {
    throw new Error("No release found");
  }

  const newVersion = release.tag_name;
  const currentVersion = await getInstalledVersion();

  // Compare versions (simple string comparison: "1.0.1" > "1.0.0")
  if (newVersion <= currentVersion) {
    console.debug("Already on latest version:", currentVersion);
    return;
  }

  // Find the bundle file in assets
  const bundleAsset = release.assets.find(
    (asset) => asset.name === "index.android.bundle"
  );

  if (!bundleAsset) {
    throw new Error("Bundle file not found in release assets");
  }

  // Download the bundle
  const bundlePath = await downloadBundle(
    bundleAsset.browser_download_url,
    `index.android.bundle`
  );

  // Save the new version and path
  await setInstalledVersion(newVersion);
  await SecureStore.setItemAsync("ota_bundle_path", bundlePath);

  console.log(`Downloaded OTA update v${newVersion}`);
}

/**
 * Get the path to the custom bundle (if one was downloaded).
 * Call this from RootNavigator to load the updated bundle.
 */
export async function getCustomBundlePath(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("ota_bundle_path");
  } catch {
    return null;
  }
}

/**
 * Clear stored update info (for dev/testing).
 */
export async function clearStoredUpdate(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync("ota_bundle_version");
    await SecureStore.deleteItemAsync("ota_bundle_path");
    const info = await FileSystem.getInfoAsync(UPDATES_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(UPDATES_DIR, { idempotent: true });
    }
  } catch (error) {
    console.warn("Failed to clear stored update:", error);
  }
}
