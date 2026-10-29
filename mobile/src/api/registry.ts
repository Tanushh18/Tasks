import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { clearHttpCache } from "../offline/httpCache";
import { applyServerList } from "./client";

/**
 * Server registry: the backend URLs for this app are managed on Stashr (each project's Server URLs section), so
 * changing one needs no rebuild or redeploy. On every start the cached list is applied at once, then a fresh one is
 * fetched in the background. Stashr is the only source: there is no built-in server. If everything is switched off there, the list is empty and
 * the app does not connect; if Stashr cannot be reached, the last list it gave (cached on the phone) is kept.
 */
const APP = "wethree";
const CACHE_KEY = "registry.wethree";
// Stashr addresses, tried in order: the build env (EXPO_PUBLIC_STASHR_SERVER_URL, written by Stashr when its main
// server changes), then the current main server, then the old one as a last resort.
const trim = (u: string) => u.trim().replace(/\/+$/, "");
const REGISTRY_HOSTS = [...new Set([process.env.EXPO_PUBLIC_STASHR_SERVER_URL || "", "https://password-manager-server-g305.onrender.com", "https://password-manager-server-xxdr.onrender.com"].map((u) => trim(String(u))).filter(Boolean))];

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => /^https?:\/\//i.test(url));
}

/**
 * Whether the app may be used. "off" means the servers are switched off on Stashr: the app shows a blocked screen
 * and nothing else (no cached data). "checking" lasts only until the first answer (or CHECK_GRACE_MS).
 */
export type ServerStatus = "checking" | "on" | "off";

/** Registry polling while the app is open: a switch-off on Stashr takes effect within about this long. */
export const WATCH_INTERVAL_MS = 15000;
/** At start-up the app waits this long for the registry before falling back to the list cached on the phone. */
export const CHECK_GRACE_MS = 8000;

let status: ServerStatus = "checking";
const listeners = new Set<(next: ServerStatus) => void>();

function setStatus(next: ServerStatus): void {
  if (next === status) return;
  status = next;
  if (next === "off") void clearHttpCache().catch(() => undefined);
  listeners.forEach((fn) => fn(next));
}

export function getServerStatus(): ServerStatus {
  return status;
}

export function subscribeServerStatus(fn: (next: ServerStatus) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

let inFlight: Promise<string[] | null> | null = null;

/** Reads the list from Stashr (one request at a time) and applies it. Returns null when Stashr could not be reached. */
export function refreshServerList(timeoutMs = 60000): Promise<string[] | null> {
  if (!inFlight) {
    inFlight = fetchList(timeoutMs).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function fetchList(timeoutMs: number): Promise<string[] | null> {
  for (const host of REGISTRY_HOSTS) {
    try {
      // Long enough for a sleeping free-tier server to wake up (first call only; later polls are shorter).
      const res = await fetchWithTimeout(`${host}/registry/${APP}?t=${Date.now()}`, timeoutMs);
      if (!res.ok) continue;
      const urls = cleanList(((await res.json()) as { urls?: unknown }).urls);
      applyServerList(urls);
      setStatus(urls.length ? "on" : "off");
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(urls)).catch(() => undefined);
      return urls;
    } catch {
      /* try the next Stashr address */
    }
  }
  return null;
}

async function applyCachedList(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(CACHE_KEY);
    if (saved === null) return;
    const urls = cleanList(JSON.parse(saved));
    applyServerList(urls); // "[]" = switched off
    if (urls.length === 0) setStatus("off");
  } catch {
    /* no cache yet */
  }
}

let watching = false;

/**
 * Start-up check plus a live watch: the cached list is applied at once (an "off" cached list blocks immediately), the
 * registry is asked right away, and then again every WATCH_INTERVAL_MS and whenever the app comes back to the
 * foreground, so switching the servers off on Stashr stops an open app too. Calling it twice does nothing.
 */
export function startServerWatch(): void {
  if (watching) return;
  watching = true;
  void applyCachedList().then(async () => {
    const grace = setTimeout(() => {
      if (status === "checking") setStatus("on"); // registry slow or unreachable: keep working from the cached list
    }, CHECK_GRACE_MS);
    await refreshServerList();
    clearTimeout(grace);
    if (status === "checking") setStatus("on");
  });
  setInterval(() => void refreshServerList(15000), WATCH_INTERVAL_MS);
  AppState.addEventListener("change", (state) => {
    if (state === "active") void refreshServerList(15000);
  });
}
