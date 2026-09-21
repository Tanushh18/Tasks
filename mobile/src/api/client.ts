import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getAccessToken, getRefreshToken, notifySessionExpired, setSessionTokens } from "../auth/sessionStore";

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

// Render's free tier spins a sleeping instance back up on the first request, which can take
// 30-50s; a shorter timeout would give up (and, for non-safe-to-replay requests, report failure)
// before the server ever gets a chance to answer.
export const apiClient = axios.create({
  baseURL: API_BASE_URLS[0],
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getActiveBaseUrl();
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
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

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await axios.post(`${getActiveBaseUrl()}/auth/refresh`, { refreshToken });
    const tokens = response.data as { accessToken: string; refreshToken: string };
    await setSessionTokens(tokens);
    return tokens.accessToken;
  } catch {
    return null;
  }
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
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean; _serversTried?: number })
      | undefined;
    const status = error.response?.status;

    if (original && API_BASE_URLS.length > 1 && isServerDown(error)) {
      const tried = original._serversTried ?? 1;
      if (tried < API_BASE_URLS.length) {
        original._serversTried = tried + 1;
        activeServerIndex = (activeServerIndex + 1) % API_BASE_URLS.length;
        return apiClient(original);
      }
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
      const newAccessToken = await refreshPromise;

      if (newAccessToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }

      notifySessionExpired();
    }

    return Promise.reject(error);
  }
);

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
