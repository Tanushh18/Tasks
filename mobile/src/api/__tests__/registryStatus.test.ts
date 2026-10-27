jest.mock("@react-native-async-storage/async-storage", () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (k in store ? store[k] : null),
      setItem: async (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: async (k: string) => {
        delete store[k];
      },
    },
  };
});

const mockClearHttpCache = jest.fn(async () => undefined);
jest.mock("../../offline/httpCache", () => ({ clearHttpCache: () => mockClearHttpCache() }));

import { API_BASE_URLS } from "../client";
import { getServerStatus, refreshServerList, subscribeServerStatus } from "../registry";

function reply(urls: unknown, ok = true) {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok, json: async () => ({ urls }) }));
}

describe("server status from the Stashr registry", () => {
  it("is on while the registry lists a server and applies the list", async () => {
    reply(["https://live.test/api/"]);
    expect(await refreshServerList()).toEqual(["https://live.test/api"]);
    expect(getServerStatus()).toBe("on");
    expect(API_BASE_URLS).toEqual(["https://live.test/api"]);
  });

  it("goes off the moment the registry list is empty, tells listeners and drops the cached responses", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeServerStatus((s) => seen.push(s));
    reply([]);
    await refreshServerList();
    expect(getServerStatus()).toBe("off");
    expect(API_BASE_URLS).toEqual([]);
    expect(seen).toEqual(["off"]);
    expect(mockClearHttpCache).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("comes back on when the servers are switched on again", async () => {
    reply(["https://live.test/api"]);
    await refreshServerList();
    expect(getServerStatus()).toBe("on");
  });

  it("keeps the last status when the registry cannot be reached", async () => {
    reply([]);
    await refreshServerList();
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error("offline");
    });
    expect(await refreshServerList()).toBeNull();
    expect(getServerStatus()).toBe("off");
  });
});
