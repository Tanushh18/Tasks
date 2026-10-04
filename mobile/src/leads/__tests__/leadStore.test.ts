jest.mock("@react-native-async-storage/async-storage", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
const mockGet = jest.fn();
jest.mock("../../api/client", () => ({ apiClient: { get: (...a: unknown[]) => mockGet(...a) } }));
jest.mock("../../offline/httpQueue", () => ({ getHttpQueueCount: jest.fn(async () => 0) }));

import { setStorageScope } from "../../offline/scope";
import { applyLocalEdit, hasLocalLeads, queryLocalLeads, refreshLeadStore, removeLocalLead, resetLeadStoreMemory } from "../leadStore";

const mk = (i: number, extra: object = {}) => ({
  id: `l${i}`,
  name: `Person ${i}`,
  phone: `+9198765000${String(i).padStart(2, "0")}`,
  status: "",
  notes: "",
  info: "",
  archived: false,
  createdAt: `2026-10-0${(i % 9) + 1}T10:00:00.000Z`,
  sourceIds: [i % 2 ? "meta" : "calls"],
  ...extra,
});

describe("on-device lead store", () => {
  beforeEach(() => {
    setStorageScope("u1");
    resetLeadStoreMemory();
    mockGet.mockReset();
  });

  it("downloads every page, then pages, filters and searches offline", async () => {
    const all = Array.from({ length: 5 }, (_, i) => mk(i + 1, i === 1 ? { status: "Interested" } : {}));
    mockGet.mockImplementation(async (url: string, cfg: { params: { page: number } }) =>
      url === "/leads"
        ? { data: { leads: all.slice((cfg.params.page - 1) * 3, cfg.params.page * 3), totalPages: 2 } }
        : { data: { sources: [{ id: "meta", label: "Meta Sheet" }] } }
    );
    expect(await hasLocalLeads()).toBe(false);
    expect(await refreshLeadStore()).toBe(5);
    expect(await hasLocalLeads()).toBe(true);

    const everything = await queryLocalLeads({ page: 1, limit: 2, status: "all" });
    expect(everything).toMatchObject({ total: 5, totalAll: 5, totalPages: 3 });
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "New" }))!.total).toBe(4);
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "Interested" }))!.leads.map((l) => l.id)).toEqual(["l2"]);
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "all", sourceId: "meta" }))!.total).toBe(3);
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "all", search: "person 4" }))!.total).toBe(1);
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "all", search: "98765000" }))!.total).toBe(5);
  });

  it("applies edits and deletes to the saved copy and keeps them after a reload", async () => {
    mockGet.mockImplementation(async (url: string) =>
      url === "/leads" ? { data: { leads: [mk(1), mk(2)], totalPages: 1 } } : { data: { sources: [] } }
    );
    await refreshLeadStore();
    await applyLocalEdit("l1", { status: "Follow-up", notes: "call Monday" });
    await removeLocalLead("l2");
    resetLeadStoreMemory(); // as if the app was restarted
    const page = (await queryLocalLeads({ page: 1, limit: 10, status: "all" }))!;
    expect(page.leads).toHaveLength(1);
    expect(page.leads[0]).toMatchObject({ id: "l1", status: "Follow-up", notes: "call Monday" });
  });

  it("stays correct after edits (search and counts are not served from stale memory)", async () => {
    mockGet.mockImplementation(async (url: string) =>
      url === "/leads" ? { data: { leads: [mk(1), mk(2), mk(3)], totalPages: 1 } } : { data: { sources: [] } }
    );
    await refreshLeadStore();
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "all", search: "zebra" }))!.total).toBe(0);
    const before = await queryLocalLeads({ page: 1, limit: 10, status: "all" });
    expect(before!.stageCounts).toEqual([{ stage: "New", count: 3 }]);
    await applyLocalEdit("l2", { notes: "Zebra plot", status: "Interested" });
    expect((await queryLocalLeads({ page: 1, limit: 10, status: "all", search: "zebra" }))!.leads.map((l) => l.id)).toEqual(["l2"]);
    const after = await queryLocalLeads({ page: 1, limit: 10, status: "all" });
    expect(after!.stageCounts).toEqual(expect.arrayContaining([{ stage: "New", count: 2 }, { stage: "Interested", count: 1 }]));
    // newest first, as the server returns it
    const ids = after!.leads.map((l) => l.createdAt);
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("answers search, filter and paging over 5,000 leads in a few milliseconds", async () => {
    const big = Array.from({ length: 5000 }, (_, i) => mk(i + 1, { name: `Lead ${i}`, status: i % 7 ? "" : "Follow-up" }));
    mockGet.mockImplementation(async (url: string, cfg: { params: { page: number } }) =>
      url === "/leads"
        ? { data: { leads: big.slice((cfg.params.page - 1) * 100, cfg.params.page * 100), totalPages: 50 } }
        : { data: { sources: [] } }
    );
    await refreshLeadStore();
    await queryLocalLeads({ page: 1, limit: 10, status: "all" }); // warm
    const t = Date.now();
    for (let i = 0; i < 20; i++) {
      await queryLocalLeads({ page: 1 + (i % 5), limit: 10, status: i % 2 ? "New" : "Follow-up", search: i % 3 ? "lead 4" : "" });
    }
    expect((Date.now() - t) / 20).toBeLessThan(25);
  });
});
