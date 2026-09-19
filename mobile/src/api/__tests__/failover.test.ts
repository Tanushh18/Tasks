import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

process.env.EXPO_PUBLIC_API_URLS = "https://primary.test/api, https://backup.test/api/";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, getActiveBaseUrl, API_BASE_URLS } = require("../client") as typeof import("../client");

function networkError(config: InternalAxiosRequestConfig) {
  const error = new Error("Network Error") as Error & { isAxiosError: true; config: InternalAxiosRequestConfig; code: string };
  error.isAxiosError = true;
  error.config = config;
  error.code = "ERR_NETWORK";
  return error;
}

function ok(config: InternalAxiosRequestConfig): AxiosResponse {
  return { status: 200, data: { ok: true }, statusText: "OK", headers: {}, config };
}

describe("apiClient server failover", () => {
  it("parses a comma-separated server list and trims trailing slashes", () => {
    expect(API_BASE_URLS).toEqual(["https://primary.test/api", "https://backup.test/api"]);
  });

  it("falls back to the next server when the first is unreachable, and stays on it", async () => {
    const seen: string[] = [];
    apiClient.defaults.adapter = async (config) => {
      seen.push(String(config.baseURL));
      if (config.baseURL === "https://primary.test/api") throw networkError(config);
      return ok(config);
    };

    const res = await apiClient.get("/tasks");
    expect(res.status).toBe(200);
    expect(seen).toEqual(["https://primary.test/api", "https://backup.test/api"]);
    expect(getActiveBaseUrl()).toBe("https://backup.test/api");

    await apiClient.get("/tasks");
    expect(seen[seen.length - 1]).toBe("https://backup.test/api");
  });

  it("gives up after trying every server", async () => {
    let calls = 0;
    apiClient.defaults.adapter = async (config) => {
      calls += 1;
      throw networkError(config);
    };
    await expect(apiClient.get("/tasks")).rejects.toBeDefined();
    expect(calls).toBe(2);
  });
});
