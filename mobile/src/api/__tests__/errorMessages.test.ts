import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { getApiErrorMessage } from "../client";

const config = {} as InternalAxiosRequestConfig;

function axiosError(status: number, data: unknown): AxiosError {
  const error = new Error(`Request failed with status code ${status}`) as AxiosError;
  (error as { isAxiosError: boolean }).isAxiosError = true;
  error.config = config;
  error.response = { status, data, statusText: "", headers: {}, config } as AxiosResponse;
  return error;
}

function networkError(code?: string): AxiosError {
  const error = new Error("Network Error") as AxiosError;
  (error as { isAxiosError: boolean }).isAxiosError = true;
  error.config = config;
  error.code = code;
  return error;
}

describe("getApiErrorMessage", () => {
  it("keeps backend messages that were written for users", () => {
    const message = getApiErrorMessage(
      axiosError(503, { error: { code: "AI_NOT_CONFIGURED", message: "The AI assistant isn't set up yet." } })
    );
    expect(message).toBe("The AI assistant isn't set up yet.");
  });

  it("replaces database and driver errors with plain language", () => {
    const message = getApiErrorMessage(
      axiosError(500, { error: { code: "INTERNAL", message: "MongoServerError: E11000 duplicate key" } })
    );
    expect(message).not.toMatch(/Mongo/i);
    expect(message).toBe("Something went wrong on our side. Please try again.");
  });

  it.each([
    ["JsonWebTokenError: jwt malformed", 401],
    ["CastError: Cast to ObjectId failed", 400],
    ["AxiosError: ECONNREFUSED 127.0.0.1:4000", 500],
    ["Gemini API quota exceeded for generativelanguage.googleapis.com", 503],
  ])("never leaks %s", (serverMessage, status) => {
    const message = getApiErrorMessage(axiosError(status, { error: { code: "INTERNAL", message: serverMessage } }));
    expect(message).not.toMatch(/jwt|Cast|Axios|ECONN|Gemini|googleapis/i);
    expect(message.length).toBeGreaterThan(0);
  });

  it("maps status codes to distinct, actionable messages", () => {
    expect(getApiErrorMessage(axiosError(401, {}))).toMatch(/sign in again/i);
    expect(getApiErrorMessage(axiosError(403, {}))).toMatch(/don't have access/i);
    expect(getApiErrorMessage(axiosError(404, {}))).toMatch(/couldn't find/i);
    expect(getApiErrorMessage(axiosError(409, {}))).toMatch(/already saved/i);
    expect(getApiErrorMessage(axiosError(422, {}))).toMatch(/check the information/i);
    expect(getApiErrorMessage(axiosError(429, {}))).toMatch(/too many attempts/i);
  });

  it("distinguishes being offline from a slow request", () => {
    expect(getApiErrorMessage(networkError())).toMatch(/offline/i);
    expect(getApiErrorMessage(networkError("ECONNABORTED"))).toMatch(/longer than expected/i);
  });

  it("falls back for non-HTTP failures", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
});
