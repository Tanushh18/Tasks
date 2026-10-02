import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyServerList } from "./client";

/**
 * Server registry: the backend URLs for this app live on Stashr (Servers page), so changing one needs
 * no rebuild or redeploy. On start the cached list is applied at once, then a fresh one is fetched in
 * the background. If Stashr can't be reached the build-time URLs (EXPO_PUBLIC_API_URLS) keep working.
 */
const APP = "wethree";
const CACHE_KEY = "registry.wethree";
const REGISTRY_HOSTS: string[] = (
  process.env.EXPO_PUBLIC_REGISTRY_URLS ??
  "https://password-manager-server-xxdr.onrender.com,https://password-manager-server-8gvj.onrender.com"
)
  .split(",")
  .map((url: string) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

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
    const cached = cleanList(JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? "[]"));
    if (cached.length) applyServerList(cached);
  } catch {
    /* no cache yet */
  }

  for (const host of REGISTRY_HOSTS) {
    try {
      // Long enough for a sleeping free-tier server to wake up.
      const res = await fetchWithTimeout(`${host}/registry/${APP}`, 60000);
      if (!res.ok) continue;
      const urls = cleanList(((await res.json()) as { urls?: unknown }).urls);
      if (urls.length === 0) continue;
      applyServerList(urls);
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(urls)).catch(() => undefined);
      return urls;
    } catch {
      /* try the next registry host */
    }
  }
  return null;
}
