import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { apiClient } from "../client";
import * as sessionStore from "../../auth/sessionStore";

function unauthorizedError(config: InternalAxiosRequestConfig) {
  const error = new Error("Request failed with status code 401") as Error & {
    isAxiosError: true;
    response: AxiosResponse;
    config: InternalAxiosRequestConfig;
  };
  error.isAxiosError = true;
  error.config = config;
  error.response = { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config } as AxiosResponse;
  return error;
}

/** Regression test for the bug where the interceptor skipped its refresh-and-retry for *every*
 * "/auth/*" URL — including authenticated ones like /auth/me — so a merely-expired 15-minute
 * access token (not an actually-dead 30-day session) forced a full re-login on every app open
 * more than 15 minutes apart. Only the token-issuing endpoints should be excluded. */
describe("apiClient 401 refresh-and-retry", () => {
  const originalAdapter = apiClient.defaults.adapter;

  afterEach(() => {
    jest.restoreAllMocks();
    apiClient.defaults.adapter = originalAdapter;
  });

  it("refreshes the access token and retries an authenticated call like /auth/me", async () => {
    jest.spyOn(sessionStore, "getRefreshToken").mockReturnValue("stored-refresh-token");
    jest.spyOn(sessionStore, "setSessionTokens").mockResolvedValue(undefined);
    const postSpy = jest
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { accessToken: "new-access", refreshToken: "new-refresh" } } as AxiosResponse);

    let callCount = 0;
    apiClient.defaults.adapter = jest.fn((config: InternalAxiosRequestConfig) => {
      callCount += 1;
      if (callCount === 1) return Promise.reject(unauthorizedError(config));
      return Promise.resolve({
        data: { user: { id: "1" } },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as AxiosResponse);
    });

    const response = await apiClient.get("/auth/me");

    expect(response.data).toEqual({ user: { id: "1" } });
    expect(callCount).toBe(2); // first call 401s, second (retried) call succeeds
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a refresh for /auth/login — a wrong MPIN must surface immediately", async () => {
    const postSpy = jest.spyOn(axios, "post");
    apiClient.defaults.adapter = jest.fn((config: InternalAxiosRequestConfig) => Promise.reject(unauthorizedError(config)));

    await expect(apiClient.post("/auth/login", { mobileNumber: "9999999999", mpin: "0000" })).rejects.toBeTruthy();

    expect(postSpy).not.toHaveBeenCalled();
  });

  it("does not attempt a refresh for /auth/refresh itself (would otherwise loop)", async () => {
    const postSpy = jest.spyOn(axios, "post");
    apiClient.defaults.adapter = jest.fn((config: InternalAxiosRequestConfig) => Promise.reject(unauthorizedError(config)));

    await expect(apiClient.post("/auth/refresh", { refreshToken: "stale" })).rejects.toBeTruthy();

    expect(postSpy).not.toHaveBeenCalled();
  });
});
