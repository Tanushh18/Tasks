import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import * as Crypto from "expo-crypto";
import { getAccessToken, getRefreshToken, notifySessionExpired, setSessionTokens } from "../auth/sessionStore";
import {
  getCachedResponse,
  isBypassing,
  isCacheableUrl,
  markCacheStale,
  putCachedResponse,
} from "../offline/httpCache";
import { isQueueableWrite, isUnreachableError, queueWrite } from "../offline/httpQueue";

/** Per-request flags the interceptors below use to talk to each other. */
type ClientConfig = InternalAxiosRequestConfig & {
  _retried?: boolean;
  _serversTried?: number;
  /** The reply came from the on-device cache, so it must not be written back (it would look fresh). */
  _fromCache?: boolean;
  /** Set when replaying a queued write, so a second failure isn't queued again. */
  _skipQueue?: boolean;
  /** Don't read or write the on-device response cache (used by the lead store, which keeps its own copy). */
  _noCache?: boolean;
};

/** When an older copy exists locally, don't make the person wait out a cold-starting server. */
const STALE_CACHE_TIMEOUT_MS = 8000;

function methodOf(config: { method?: string }): string {
  return (config.method ?? "get").toLowerCase();
}

function isCacheableGet(config: ClientConfig): boolean {
  return methodOf(config) === "get" && isCacheableUrl(config.url) && !config._noCache;
}

function cachedReply(config: ClientConfig, data: unknown, note: string): AxiosResponse {
  return { data, status: 200, statusText: note, headers: {}, config, request: {} };
}

/**
 * Backend servers in priority order. EXPO_PUBLIC_API_URLS is a comma-separated list; the single
 * EXPO_PUBLIC_API_URL still works for local development. If the active server is down the client
 * moves on to the next one and stays there until that one fails too.
 */
export const API_BASE_URLS: string[] = (
  process.env.EXPO_PUBLIC_API_URLS ??
  process.env.EXPO_PUBLIC_API_URL ??
  "http://localhost:4000/api"
)
  .split(",")
  .map((url: string) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

let activeServerIndex = 0;

/** The server requests are currently sent to. */
export function getActiveBaseUrl(): string {
  return API_BASE_URLS[activeServerIndex];
}

export const API_BASE_URL = API_BASE_URLS[0];

/** The build-time list: the bootstrap that registry results are layered on top of. */
const BOOTSTRAP_URLS: string[] = [...API_BASE_URLS];

/**
 * Swap in the server list from the Stashr registry (see api/registry.ts). The build-time URLs stay at
 * the end as a last resort. The list is edited in place so existing imports of API_BASE_URLS stay
 * valid, and the server currently in use is kept when it is still listed.
 */
export function applyServerList(fresh: string[]): void {
  const cleaned = fresh.map((url) => url.trim().replace(/\/+$/, "")).filter(Boolean);
  if (cleaned.length === 0) return;
  const list = [...cleaned, ...BOOTSTRAP_URLS].filter((url, i, all) => all.indexOf(url) === i);
  const current = API_BASE_URLS[activeServerIndex];
  API_BASE_URLS.splice(0, API_BASE_URLS.length, ...list);
  const kept = API_BASE_URLS.indexOf(current);
  activeServerIndex = kept >= 0 ? kept : 0;
}

// Render's free tier spins a sleeping instance back up on the first request, which can take
// 30-50s; a shorter timeout would give up (and, for non-safe-to-replay requests, report failure)
// before the server ever gets a chance to answer.
export const apiClient = axios.create({
  baseURL: API_BASE_URLS[0],
  timeout: 30000,
});

apiClient.interceptors.request.use(async (config: ClientConfig) => {
  config.baseURL = getActiveBaseUrl();
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Every POST carries an idempotency key so a retry (timeout, failover, offline replay) can't
  // create the same record twice — the backend answers a repeat with the original response.
  if (methodOf(config) === "post" && config.headers && !config.headers["Idempotency-Key"]) {
    config.headers["Idempotency-Key"] = Crypto.randomUUID();
  }

  if (isCacheableGet(config) && config.url) {
    const cached = await getCachedResponse(config.url, config.params);
    if (cached) {
      if (cached.fresh && !isBypassing()) {
        // No server call at all — this is what makes opening a recently-visited screen instant.
        config._fromCache = true;
        config.adapter = async (adapterConfig) => cachedReply(adapterConfig as ClientConfig, cached.data, "OK (on-device)");
      } else {
        config.timeout = Math.min(config.timeout ?? STALE_CACHE_TIMEOUT_MS, STALE_CACHE_TIMEOUT_MS);
      }
    }
  }
  return config;
});

// Only these auth endpoints must never trigger a refresh-and-retry: /login and /register aren't
// authenticated in the first place, and /refresh is the refresh call itself (retrying it would
// loop). Every other /auth/* route (e.g. /auth/me, /auth/settings) IS authenticated and must be
// retried after a silent refresh — excluding the whole "/auth/" prefix here previously meant a
// stale access token (they expire every 15 min) made the startup /auth/me call fail outright,
// forcing a full re-login far more often than the 30-day refresh token should ever require.
const NO_REFRESH_RETRY_URLS = ["/auth/login", "/auth/register", "/auth/refresh"];

type RefreshResult =
  | { status: "ok"; accessToken: string }
  /** The server looked at the refresh token and refused it — the only case that ends the session. */
  | { status: "rejected" }
  /** Couldn't get an answer (offline, server down, cold start). The session must survive this. */
  | { status: "unreachable" };

let refreshPromise: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return { status: "rejected" };

  // Ask the active server first, then the others: a server that is down or suspended must not look
  // like "couldn't refresh", or the request that triggered this fails with a bogus session error.
  for (let i = 0; i < API_BASE_URLS.length; i++) {
    const index = (activeServerIndex + i) % API_BASE_URLS.length;
    try {
      const response = await axios.post(`${API_BASE_URLS[index]}/auth/refresh`, { refreshToken }, { timeout: 30000 });
      const tokens = response.data as { accessToken: string; refreshToken: string };
      await setSessionTokens(tokens);
      activeServerIndex = index;
      return { status: "ok", accessToken: tokens.accessToken };
    } catch (err) {
      // Signing someone out because their signal dropped mid-refresh would break "log in once, stay
      // logged in". Only an explicit refusal from a working server counts.
      const refused = axios.isAxiosError(err) && err.response && [400, 401, 403, 404].includes(err.response.status);
      if (refused) return { status: "rejected" };
    }
  }
  return { status: "unreachable" };
}

// Endpoints with no side effects worth worrying about duplicating: a timed-out login/register
// almost never means the write landed (Render free-tier cold starts just don't answer in time),
// and retrying either one against the other server is harmless even on the rare chance it did.
const SAFE_TO_REPLAY_ON_TIMEOUT_URLS = ["/auth/login", "/auth/register"];

/** True when the server itself looks unreachable (as opposed to it answering with an error). */
function isServerDown(error: AxiosError): boolean {
  const status = error.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  if (error.response) return false;
  if (error.code === "ERR_CANCELED") return false;
  // A timeout may mean the server did receive a write, so only replay reads (and the handful of
  // known-safe writes above) after one.
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    const method = (error.config?.method ?? "get").toLowerCase();
    if (method === "get") return true;
    const url = error.config?.url ?? "";
    return SAFE_TO_REPLAY_ON_TIMEOUT_URLS.some((safeUrl) => url.includes(safeUrl));
  }
  return true;
}

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config as ClientConfig;
    if (!config._fromCache) {
      if (isCacheableGet(config) && config.url) {
        // Fire-and-forget: a slow disk write must never delay the screen that asked.
        void putCachedResponse(config.url, config.params, response.data).catch(() => undefined);
      } else if (methodOf(config) !== "get" && !config.url?.startsWith("/auth")) {
        // Something changed on the server, so every local copy is now out of date.
        void markCacheStale().catch(() => undefined);
      }
    }
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as ClientConfig | undefined;
    const status = error.response?.status;

    if (original && API_BASE_URLS.length > 1 && isServerDown(error)) {
      const tried = original._serversTried ?? 1;
      if (tried < API_BASE_URLS.length) {
        original._serversTried = tried + 1;
        // Several requests can fail on the same dead server at once; only the first one moves the
        // active server on, or two failures would flip it straight back to the dead one.
        if (!original.baseURL || original.baseURL === getActiveBaseUrl()) {
          activeServerIndex = (activeServerIndex + 1) % API_BASE_URLS.length;
        }
        return apiClient(original);
      }
    }

    // Server unreachable or failing: keep the app usable from what's already on the phone.
    const serverFailing = error.response ? (status ?? 0) >= 500 : error.code !== "ERR_CANCELED";
    if (original && serverFailing && isCacheableGet(original) && original.url) {
      const cached = await getCachedResponse(original.url, original.params);
      if (cached) return cachedReply(original, cached.data, "OK (on-device, server unreachable)");
    }

    // A write that couldn't reach the server is saved and replayed later (see offline/httpQueue.ts).
    if (
      original &&
      !original._skipQueue &&
      methodOf(original) !== "get" &&
      isUnreachableError(error) &&
      isQueueableWrite(methodOf(original), original.url)
    ) {
      const queued = await queueWrite({
        method: methodOf(original),
        url: original.url as string,
        data: original.data,
        idempotencyKey: original.headers?.["Idempotency-Key"] as string | undefined,
      });
      if (queued) return cachedReply(original, queued.data, "Accepted (saved on-device, will sync)");
    }

    if (
      status === 401 &&
      original &&
      !original._retried &&
      !NO_REFRESH_RETRY_URLS.some((url) => original.url?.includes(url))
    ) {
      original._retried = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const refreshed = await refreshPromise;

      if (refreshed.status === "ok") {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${refreshed.accessToken}`;
        return apiClient(original);
      }
      // "unreachable" leaves the session alone; the caller just sees this request fail.
      if (refreshed.status === "rejected") notifySessionExpired();
    }

    return Promise.reject(error);
  }
);

/** Replays one write from the offline queue against the live server. */
export async function sendQueuedWrite(item: {
  id: string;
  method: string;
  url: string;
  data?: unknown;
}): Promise<void> {
  await apiClient.request({
    method: item.method,
    url: item.url,
    data: item.data,
    headers: { "Idempotency-Key": item.id },
    _skipQueue: true,
  } as unknown as InternalAxiosRequestConfig);
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** True when a request failed because it was deliberately aborted (e.g. a user-tapped Stop
 * button), as opposed to a real network/server error — callers should skip showing an error. */
export function isRequestCanceled(error: unknown): boolean {
  return axios.isCancel(error) || (axios.isAxiosError(error) && error.code === "ERR_CANCELED");
}

/** Backend error codes whose own message is already written for the person reading it. */
const USER_FACING_ERROR_CODES = new Set([
  "AI_NOT_CONFIGURED",
  "VALIDATION_ERROR",
  "INVALID_CREDENTIALS",
  "ACCOUNT_LOCKED",
  "DUPLICATE_MOBILE",
  "NOT_FOUND",
]);

/** Anything that looks like machinery rather than an explanation. */
const TECHNICAL_NOISE =
  /Mongo|Mongoose|ValidationError|CastError|AxiosError|ECONN|ETIMEDOUT|ENOTFOUND|jwt|JsonWebToken|TokenExpired|Gemini|generativelanguage|stack|at\s+\w+\s+\(/i;

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return "Please check the information and try again.";
    case 401:
      return "Please sign in again.";
    case 403:
      return "You don't have access to that.";
    case 404:
      return "We couldn't find that.";
    case 409:
      return "That's already saved.";
    case 429:
      return "Too many attempts. Please wait a little and try again.";
    case 503:
      return "That service is unavailable right now. Please try again shortly.";
    default:
      return status >= 500
        ? "Something went wrong on our side. Please try again."
        : "Something went wrong. Please try again.";
  }
}

/**
 * Turns any failure into something worth showing a person.
 *
 * The backend's own message is preferred when it was written for users (validation details, "the
 * assistant isn't set up yet"), but anything carrying database, JWT, network-stack or AI-provider
 * wording is replaced by a plain sentence — those strings leak implementation detail and mean
 * nothing to the person holding the phone (spec §58).
 */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!axios.isAxiosError(error)) return fallback;

  if (error.code === "ECONNABORTED") {
    return "That's taking longer than expected. Please try again.";
  }
  if (!error.response) {
    return "You're offline. Check your connection and try again.";
  }

  const body = error.response.data as ApiErrorBody | undefined;
  const serverMessage = body?.error?.message;
  const serverCode = body?.error?.code;

  if (serverMessage && !TECHNICAL_NOISE.test(serverMessage)) {
    // Trust an explicitly user-facing code, or any short sentence that reads like prose.
    if ((serverCode && USER_FACING_ERROR_CODES.has(serverCode)) || serverMessage.length <= 160) {
      return serverMessage;
    }
  }

  return messageForStatus(error.response.status);
}
