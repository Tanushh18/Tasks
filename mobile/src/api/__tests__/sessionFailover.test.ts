import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

process.env.EXPO_PUBLIC_API_URLS = "https://dead.test/api, https://live.test/api";

/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, getActiveBaseUrl } = require("../client") as typeof import("../client");
const { setSessionTokens, getAccessToken, registerSessionExpiredHandler } = require("../../auth/sessionStore") as typeof import("../../auth/sessionStore");
/* eslint-enable @typescript-eslint/no-require-imports */

function httpError(config: InternalAxiosRequestConfig, status: number) {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: true;
    config: InternalAxiosRequestConfig;
    response: AxiosResponse;
  };
  error.isAxiosError = true;
  error.config = config;
  error.response = { status, data: {}, statusText: "", headers: {}, config };
  return error;
}
const ok = (config: InternalAxiosRequestConfig): AxiosResponse => ({ status: 200, data: { ok: true }, statusText: "OK", headers: {}, config });

describe("sessions survive a dead server", () => {
  it("two requests failing on the dead server at once don't flip back onto it", async () => {
    const seen: string[] = [];
    apiClient.defaults.adapter = async (config) => {
      seen.push(String(config.baseURL));
      if (config.baseURL === "https://dead.test/api") {
        await new Promise((r) => setTimeout(r, 5));
        throw httpError(config, 503);
      }
      return ok(config);
    };
    const [a, b] = await Promise.all([apiClient.get("/finance/summary", { _noCache: true } as object), apiClient.get("/finance/accounts", { _noCache: true } as object)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(getActiveBaseUrl()).toBe("https://live.test/api");
  });

  it("refreshes an expired session on the live server even if another request just moved the client onto the dead one", async () => {
    await setSessionTokens({ accessToken: "old-access", refreshToken: "good-refresh" });
    const expired = jest.fn();
    registerSessionExpiredHandler(expired);
    const post = jest.spyOn(axios, "post").mockImplementation(async (url: string) => {
      if (url.startsWith("https://dead.test")) throw httpError({} as InternalAxiosRequestConfig, 503);
      return { data: { accessToken: "new-access", refreshToken: "good-refresh" }, status: 200 } as AxiosResponse;
    });
    expect(getActiveBaseUrl()).toBe("https://live.test/api");

    apiClient.defaults.adapter = async (config) => {
      if (config.baseURL === "https://dead.test/api") throw httpError(config, 503);
      if (config.url === "/flaky") throw httpError(config, 503);
      if (config.headers?.Authorization === "Bearer old-access") {
        await new Promise((r) => setTimeout(r, 20));
        throw httpError(config, 401);
      }
      return ok(config);
    };

    // /flaky fails on the live server and drags the client onto the dead one while /slow is still waiting for its 401.
    const [slow] = await Promise.all([
      apiClient.get("/slow", { _noCache: true } as object),
      apiClient.get("/flaky", { _noCache: true } as object).catch(() => undefined),
    ]);
    expect(slow.status).toBe(200);
    expect(getAccessToken()).toBe("new-access");
    expect(expired).not.toHaveBeenCalled();
    expect(post.mock.calls.map((c) => c[0])).toContain("https://live.test/api/auth/refresh");
    post.mockRestore();
  });

  it("still signs the person out when a working server refuses the refresh token", async () => {
    await setSessionTokens({ accessToken: "old-access", refreshToken: "revoked" });
    const expired = jest.fn();
    registerSessionExpiredHandler(expired);
    const post = jest.spyOn(axios, "post").mockImplementation(async (url: string) => {
      if (url.startsWith("https://dead.test")) throw httpError({} as InternalAxiosRequestConfig, 503);
      throw httpError({} as InternalAxiosRequestConfig, 401);
    });
    apiClient.defaults.adapter = async (config) => {
      if (config.baseURL === "https://dead.test/api") throw httpError(config, 503);
      throw httpError(config, 401);
    };
    await expect(apiClient.get("/finance/summary", { _noCache: true } as object)).rejects.toBeDefined();
    expect(expired).toHaveBeenCalled();
    post.mockRestore();
  });
});
