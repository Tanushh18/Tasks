import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyServerList } from "./client";

/**
 * Server registry: the backend URLs for this app are managed on Stashr (each project's Server URLs section), so
 * changing one needs no rebuild or redeploy. On every start the cached list is applied at once, then a fresh one is
 * fetched in the background. Stashr is the only source: there is no built-in server. If everything is switched off there, the list is empty and
 * the app does not connect; if Stashr cannot be reached, the last list it gave (cached on the phone) is kept.
 */
const APP = "wethree";
const CACHE_KEY = "registry.wethree";
const REGISTRY_HOST = "https://password-manager-server-xxdr.onrender.com";

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => /^https?:\/\//i.test(url));
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshServerList(): Promise<string[] | null> {
  try {
    const saved = await AsyncStorage.getItem(CACHE_KEY);
    if (saved !== null) applyServerList(cleanList(JSON.parse(saved))); // "[]" = switched off
  } catch {
    /* no cache yet */
  }

  try {
    // Long enough for a sleeping free-tier server to wake up.
    const res = await fetchWithTimeout(`${REGISTRY_HOST}/registry/${APP}`, 60000);
    if (!res.ok) return null;
    const urls = cleanList(((await res.json()) as { urls?: unknown }).urls);
    applyServerList(urls);
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(urls)).catch(() => undefined);
    return urls;
  } catch {
    return null;
  }
}
