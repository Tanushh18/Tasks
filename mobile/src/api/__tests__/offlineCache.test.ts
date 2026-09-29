import type { InternalAxiosRequestConfig } from "axios";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// jest-expo auto-mocks expo-crypto so randomUUID() returns undefined, which would give every queued
// write the same id. Use real UUIDs so the queue's identity handling is actually exercised.
jest.mock("expo-crypto", () => ({
  randomUUID: () => jest.requireActual("crypto").randomUUID(),
}));

process.env.EXPO_PUBLIC_API_URLS = "https://server.test/api";

/* eslint-disable @typescript-eslint/no-require-imports */
const axios = require("axios") as typeof import("axios").default;
const { apiClient, sendQueuedWrite } = require("../client") as typeof import("../client");
const { setStorageScope } = require("../../offline/scope") as typeof import("../../offline/scope");
const { bypassCacheBriefly } = require("../../offline/httpCache") as typeof import("../../offline/httpCache");
const { flushHttpQueue, getHttpQueueCount } = require("../../offline/httpQueue") as typeof import("../../offline/httpQueue");
const { registerSessionExpiredHandler, setSessionTokens } = require("../../auth/sessionStore") as typeof import("../../auth/sessionStore");
/* eslint-enable @typescript-eslint/no-require-imports */

type Reply = { status?: number; data: unknown };

let online = true;
let seen: InternalAxiosRequestConfig[] = [];
let handler: (config: InternalAxiosRequestConfig) => Reply = () => ({ data: {} });
let userCounter = 0;

function failure(config: InternalAxiosRequestConfig, code: string, status?: number) {
  const error = new Error(status ? `Request failed with status code ${status}` : "Network Error") as Error & Record<string, unknown>;
  error.isAxiosError = true;
  error.config = config;
  error.code = code;
  if (status) error.response = { status, data: {}, headers: {}, config };
  return error;
}

beforeEach(() => {
  online = true;
  seen = [];
  handler = () => ({ data: {} });
  // A fresh user per test keeps each one's on-device cache and queue separate.
  userCounter += 1;
  setStorageScope(`user-${userCounter}`);
  apiClient.defaults.adapter = async (config) => {
    seen.push(config);
    if (!online) throw failure(config, "ERR_NETWORK");
    const reply = handler(config);
    if (reply.status && reply.status >= 400) throw failure(config, "ERR_BAD_REQUEST", reply.status);
    return { status: reply.status ?? 200, data: reply.data, statusText: "OK", headers: {}, config };
  };
});

/** The client stores responses fire-and-forget, so give those writes a moment to land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

describe("on-device response cache", () => {
  it("serves a recently fetched screen from the phone without calling the server again", async () => {
    handler = () => ({ data: { notes: [{ id: "1", title: "Milk" }] } });

    const first = await apiClient.get("/notes");
    await settle();
    const second = await apiClient.get("/notes");

    expect(first.data).toEqual(second.data);
    expect(seen).toHaveLength(1);
  });

  it("treats different query params as different screens", async () => {
    handler = (config) => ({ data: { notes: [{ id: String(config.params?.search) }] } });

    await apiClient.get("/notes", { params: { search: "a" } });
    await settle();
    const other = await apiClient.get("/notes", { params: { search: "b" } });

    expect(seen).toHaveLength(2);
    expect(other.data).toEqual({ notes: [{ id: "b" }] });
  });

  it("goes back to the server after a pull-to-refresh", async () => {
    handler = () => ({ data: { notes: [] } });
    await apiClient.get("/notes");
    await settle();

    bypassCacheBriefly();
    await apiClient.get("/notes");

    expect(seen).toHaveLength(2);
  });

  it("shows the last saved data when the server can't be reached", async () => {
    handler = () => ({ data: { notes: [{ id: "1", title: "Milk" }] } });
    await apiClient.get("/notes");
    await settle();

    online = false;
    bypassCacheBriefly();
    const offline = await apiClient.get("/notes");

    expect(offline.data).toEqual({ notes: [{ id: "1", title: "Milk" }] });
  });

  it("shows the last saved data when the server is failing with a 5xx", async () => {
    handler = () => ({ data: { notes: [{ id: "1" }] } });
    await apiClient.get("/notes");
    await settle();

    handler = () => ({ status: 503, data: {} });
    bypassCacheBriefly();
    const res = await apiClient.get("/notes");

    expect(res.data).toEqual({ notes: [{ id: "1" }] });
  });

  it("still fails when there is nothing saved for that screen", async () => {
    online = false;
    await expect(apiClient.get("/notes")).rejects.toBeDefined();
  });

  it("does not answer a 4xx from the cache", async () => {
    handler = () => ({ data: { notes: [] } });
    await apiClient.get("/notes");
    await settle();

    handler = () => ({ status: 404, data: {} });
    bypassCacheBriefly();
    await expect(apiClient.get("/notes")).rejects.toBeDefined();
  });

  it("marks everything stale after a successful write, so the next read is fresh from the server", async () => {
    handler = () => ({ data: { notes: [] } });
    await apiClient.get("/notes");
    await settle();

    await apiClient.post("/notes", { title: "New" });
    await settle();
    await apiClient.get("/notes");

    expect(seen.filter((c) => c.method === "get")).toHaveLength(2);
  });

  it("never caches live endpoints such as chat", async () => {
    handler = () => ({ data: { messages: [] } });
    await apiClient.get("/chat/conversations");
    await settle();
    await apiClient.get("/chat/conversations");

    expect(seen).toHaveLength(2);
  });

  it("keeps each signed-in user's data separate", async () => {
    handler = () => ({ data: { notes: [{ id: "mine" }] } });
    await apiClient.get("/notes");
    await settle();

    setStorageScope("someone-else");
    online = false;
    await expect(apiClient.get("/notes")).rejects.toBeDefined();
  });
});

describe("writes made while offline", () => {
  it("saves a new note, shows it in the cached list straight away, and replays it once", async () => {
    handler = () => ({ data: { notes: [{ id: "1", title: "Existing" }] } });
    await apiClient.get("/notes");
    await settle();

    online = false;
    const created = await apiClient.post("/notes", { title: "Bought offline" });
    // The screen reads whatever key it expects (`note`, `lead`…) and gets the record back.
    expect((created.data as { note: { title: string } }).note.title).toBe("Bought offline");
    expect(await getHttpQueueCount()).toBe(1);

    const list = await apiClient.get("/notes");
    expect((list.data as { notes: Array<{ title: string }> }).notes.map((n) => n.title)).toEqual([
      "Bought offline",
      "Existing",
    ]);

    online = true;
    seen = [];
    const result = await flushHttpQueue(sendQueuedWrite);

    expect(result).toEqual({ synced: 1, failed: 0, stillOffline: false });
    expect(await getHttpQueueCount()).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/notes");
    expect(JSON.parse(seen[0].data as string)).toEqual({ title: "Bought offline" });
    expect(String(seen[0].headers["Idempotency-Key"])).toHaveLength(36);
  });

  it("sends the same idempotency key on the first attempt and on the replay", async () => {
    online = false;
    await apiClient.post("/notes", { title: "x" });
    const firstAttemptKey = String(seen[0].headers["Idempotency-Key"]);
    expect(firstAttemptKey).toHaveLength(36);

    online = true;
    seen = [];
    await flushHttpQueue(sendQueuedWrite);

    expect(String(seen[0].headers["Idempotency-Key"])).toBe(firstAttemptKey);
  });

  it("folds an edit to a record created offline into the queued create", async () => {
    online = false;
    const created = await apiClient.post("/contacts", { name: "Asha" });
    const localId = (created.data as { contact: { id: string } }).contact.id;

    await apiClient.put(`/contacts/${localId}`, { name: "Asha K" });
    expect(await getHttpQueueCount()).toBe(1);

    online = true;
    seen = [];
    await flushHttpQueue(sendQueuedWrite);
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0].data as string)).toEqual({ name: "Asha K" });
  });

  it("drops a record created and deleted while offline without telling the server", async () => {
    online = false;
    const created = await apiClient.post("/contacts", { name: "Temp" });
    const localId = (created.data as { contact: { id: string } }).contact.id;
    await apiClient.delete(`/contacts/${localId}`);

    expect(await getHttpQueueCount()).toBe(0);
  });

  it("merges repeated edits to the same record into one request", async () => {
    online = false;
    await apiClient.patch("/leads/abc", { status: "Called" });
    await apiClient.patch("/leads/abc", { notes: "Call back Friday" });
    expect(await getHttpQueueCount()).toBe(1);

    online = true;
    seen = [];
    await flushHttpQueue(sendQueuedWrite);
    expect(JSON.parse(seen[0].data as string)).toEqual({ status: "Called", notes: "Call back Friday" });
  });

  it("stops replaying when the server is still unreachable and keeps the queue", async () => {
    online = false;
    await apiClient.post("/notes", { title: "a" });
    await apiClient.post("/notes", { title: "b" });

    const result = await flushHttpQueue(sendQueuedWrite);
    expect(result.stillOffline).toBe(true);
    expect(await getHttpQueueCount()).toBe(2);
  });

  it("sets aside a write the server rejects, and carries on with the rest", async () => {
    online = false;
    await apiClient.post("/notes", { title: "bad" });
    await apiClient.post("/notes", { title: "good" });

    online = true;
    handler = (config) => (String(config.data).includes("bad") ? { status: 422, data: {} } : { data: {} });
    const result = await flushHttpQueue(sendQueuedWrite);

    expect(result).toEqual({ synced: 1, failed: 1, stillOffline: false });
    expect(await getHttpQueueCount()).toBe(0);
  });

  it("does not queue writes that need the server (nested routes, tasks, auth)", async () => {
    online = false;
    await expect(apiClient.post("/notes/1/items", { x: 1 })).rejects.toBeDefined();
    await expect(apiClient.post("/contacts/bulk", { contacts: [] })).rejects.toBeDefined();
    // Tasks and transactions keep their own dedicated queue, so the raw error must still surface.
    await expect(apiClient.post("/tasks", { title: "x" })).rejects.toBeDefined();
    await expect(apiClient.post("/auth/login", {})).rejects.toBeDefined();
    expect(await getHttpQueueCount()).toBe(0);
  });

  it("does not queue a write the server actively rejected", async () => {
    handler = () => ({ status: 422, data: {} });
    await expect(apiClient.post("/notes", { title: "" })).rejects.toBeDefined();
    expect(await getHttpQueueCount()).toBe(0);
  });
});

describe("staying signed in", () => {
  const expired = jest.fn();

  beforeEach(async () => {
    expired.mockClear();
    registerSessionExpiredHandler(expired);
    await setSessionTokens({ accessToken: "old-access", refreshToken: "refresh" });
  });

  afterEach(() => jest.restoreAllMocks());

  function unauthorizedOnce() {
    let first = true;
    handler = () => {
      if (first) {
        first = false;
        return { status: 401, data: {} };
      }
      return { data: { ok: true } };
    };
  }

  it("refreshes silently and retries when the access token has expired", async () => {
    unauthorizedOnce();
    jest.spyOn(axios, "post").mockResolvedValue({ data: { accessToken: "new-access", refreshToken: "refresh" } });

    const res = await apiClient.get("/auth/me");

    expect(res.data).toEqual({ ok: true });
    expect(expired).not.toHaveBeenCalled();
    expect(String(seen[1].headers.Authorization)).toBe("Bearer new-access");
  });

  it("stays signed in when the refresh call can't reach the server", async () => {
    unauthorizedOnce();
    jest.spyOn(axios, "post").mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }));

    await expect(apiClient.get("/auth/me")).rejects.toBeDefined();
    expect(expired).not.toHaveBeenCalled();
  });

  it("stays signed in when the server is failing during refresh", async () => {
    unauthorizedOnce();
    jest
      .spyOn(axios, "post")
      .mockRejectedValue(Object.assign(new Error("boom"), { isAxiosError: true, response: { status: 503 } }));

    await expect(apiClient.get("/auth/me")).rejects.toBeDefined();
    expect(expired).not.toHaveBeenCalled();
  });

  it("signs out only when the server explicitly refuses the refresh token", async () => {
    unauthorizedOnce();
    jest
      .spyOn(axios, "post")
      .mockRejectedValue(Object.assign(new Error("nope"), { isAxiosError: true, response: { status: 401 } }));

    await expect(apiClient.get("/auth/me")).rejects.toBeDefined();
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
