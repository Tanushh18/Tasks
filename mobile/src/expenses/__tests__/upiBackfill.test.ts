import AsyncStorage from "@react-native-async-storage/async-storage";
import { memFiles } from "../../test-utils/fsMock";

jest.mock("expo-file-system/legacy", () => require("../../test-utils/fsMock").createFsMock());
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

type Msg = { id: string; address: string; body: string; date: number };
const mockInbox: { current: Msg[] } = { current: [] };
const mockHooks: { onRead?: (call: number) => "fail" | void } = {};
const mockCalls = { reads: 0 };

jest.mock("../smsReader", () => ({
  smsReaderAvailable: true,
  hasSmsPermission: jest.fn(() => true),
  requestSmsPermission: jest.fn(async () => true),
  readInbox: jest.fn(async (since: number, limit: number) => {
    mockCalls.reads += 1;
    if (mockHooks.onRead?.(mockCalls.reads) === "fail") return null;
    return mockInbox.current
      .filter((m) => m.date > since)
      .sort((a, b) => a.date - b.date || a.id.localeCompare(b.id))
      .slice(0, limit);
  }),
  peekQueuedSms: jest.fn(() => []),
  removeQueuedSms: jest.fn(),
  onSmsReceived: jest.fn(() => () => undefined),
}));
jest.mock("../../api/finance", () => ({
  listAccounts: jest.fn(),
  createAccount: jest.fn(),
  createTransactionsBulk: jest.fn(),
  parseSmsWithAi: jest.fn(),
}));
const mockStart = jest.fn();
jest.mock("../upiImportService", () => ({
  SERVICE_SLICE_MS: 150000,
  startImportService: (...a: unknown[]) => mockStart(...a),
  registerUpiImportForegroundService: jest.fn(),
}));

import * as finance from "../../api/finance";
import * as reader from "../smsReader";
import { HEADLESS_BUDGET_MS, INBOX_BATCH, cancelUpiBackfill, getUpiSettings, setUpiTrackingEnabled, syncUpiExpenses } from "../upiExpenseSync";
import { readSmsLog, resetSmsLogCache } from "../upiSmsLog";

const api = finance as jest.Mocked<typeof finance>;
const rd = reader as jest.Mocked<typeof reader>;
const BASE = Date.UTC(2026, 0, 1);

const debit = (i: number, date = BASE + (i + 1) * 1000): Msg => ({
  id: `m${i}`,
  address: "VM-FEDBNK",
  date,
  body: `Debited Rs ${100 + i}.00 from a/c X9229 on 04Oct26 13:35 via UPI to Shop${i}. Ref ${600000000000 + i}.Bal Rs 1.00. Not you?Call 1800 -Federal Bank`,
});

let created: Set<string>;
let payloads: string[];
let clock: number;
let nowSpy: jest.SpyInstance | null = null;

beforeEach(async () => {
  await AsyncStorage.clear();
  memFiles.clear();
  resetSmsLogCache();
  jest.clearAllMocks();
  nowSpy?.mockRestore();
  nowSpy = null;
  mockInbox.current = [];
  mockHooks.onRead = undefined;
  mockCalls.reads = 0;
  mockStart.mockReset();
  mockStart.mockResolvedValue(null);
  created = new Set();
  payloads = [];
  rd.hasSmsPermission.mockReturnValue(true);
  api.listAccounts.mockResolvedValue([]);
  api.createAccount.mockImplementation(async (i) => ({ id: "acc1", name: i.name }) as never);
  api.createTransactionsBulk.mockImplementation(async (items) =>
    items.map((it, index) => {
      payloads.push(it.idempotencyKey!);
      if (created.has(it.idempotencyKey!)) return { index, status: "duplicate" as const };
      created.add(it.idempotencyKey!);
      return { index, status: "created" as const };
    })
  );
  api.parseSmsWithAi.mockResolvedValue(null);
  await setUpiTrackingEnabled(true, "user1");
});

afterEach(() => {
  nowSpy?.mockRestore();
  nowSpy = null;
});

/** Fake clock: every inbox read takes `step` ms. */
function useClock(step: number) {
  clock = 1_000_000;
  nowSpy = jest.spyOn(Date, "now").mockImplementation(() => clock);
  const inner = rd.readInbox.getMockImplementation()!;
  rd.readInbox.mockImplementation(async (s, l) => {
    clock += step;
    return inner(s, l);
  });
}

describe("resumable old-message import", () => {
  it("persists the cursor after every batch and stays active when interrupted", async () => {
    mockInbox.current = Array.from({ length: INBOX_BATCH * 3 }, (_, i) => debit(i));
    mockHooks.onRead = (n) => (n === 3 ? "fail" : undefined); // the app is killed / the read fails during batch 3
    const seenCursor: number[] = [];
    await syncUpiExpenses({ onProgress: async () => void seenCursor.push((await getUpiSettings()).backfill?.cursorMs ?? -1) });
    const s = await getUpiSettings();
    expect(s.backfill).toMatchObject({ active: true, scanned: INBOX_BATCH * 2 - 1, saved: INBOX_BATCH * 2 - 1 });
    expect(s.backfill?.cursorMs).toBe(mockInbox.current[INBOX_BATCH * 2 - 2].date);
    expect(s.lastScanMs).toBeUndefined(); // not finished: the incremental bookmark is untouched
    expect(created.size).toBe(INBOX_BATCH * 2 - 1);
    expect(s.totalSaved).toBe(INBOX_BATCH * 2 - 1);
  });

  it("resumes from the cursor without re-scanning processed batches, and finishes without duplicates", async () => {
    const total = INBOX_BATCH * 3;
    mockInbox.current = Array.from({ length: total }, (_, i) => debit(i));
    mockHooks.onRead = (n) => (n === 3 ? "fail" : undefined);
    await syncUpiExpenses();
    const cursor = (await getUpiSettings()).backfill!.cursorMs;
    mockHooks.onRead = undefined;
    rd.readInbox.mockClear();
    const summary = await syncUpiExpenses(); // a plain sync resumes it
    expect(rd.readInbox.mock.calls[0][0]).toBe(cursor - 1); // continues at the cursor (1 ms overlap)
    expect(summary).toMatchObject({ backfillActive: false });
    expect(created.size).toBe(total);
    expect(payloads).toHaveLength(total); // nothing was ever sent twice
    const s = await getUpiSettings();
    expect(s.backfill).toBeUndefined();
    expect(s.lastScanMs).toBe(mockInbox.current[total - 1].date);
    expect(s.totalSaved).toBe(total);
    // and the next normal run finds nothing new and makes no API call
    api.createTransactionsBulk.mockClear();
    await syncUpiExpenses();
    expect(api.createTransactionsBulk).not.toHaveBeenCalled();
  });

  it("completes over several short runs (deadline) with no duplicates", async () => {
    const total = INBOX_BATCH * 4 + 17;
    mockInbox.current = Array.from({ length: total }, (_, i) => debit(i));
    useClock(10);
    let runs = 0;
    for (;;) {
      runs += 1;
      const summary = await syncUpiExpenses({ deadlineMs: clock + 25 }); // room for ~2 batches
      expect(runs).toBeLessThan(20);
      if (!summary!.backfillActive) break;
      expect((await getUpiSettings()).backfill?.active).toBe(true);
    }
    expect(runs).toBeGreaterThan(1);
    expect(created.size).toBe(total);
    expect(payloads).toHaveLength(total);
    expect((await getUpiSettings()).backfill).toBeUndefined();
  });

  it("headless runs are short (~45 s) and continue an active import", async () => {
    const total = INBOX_BATCH * 6;
    mockInbox.current = Array.from({ length: total }, (_, i) => debit(i));
    useClock(20_000);
    // runUpiHeadlessTask = restoreSession + this call (its dynamic import can't run under Jest)
    const headless = () => syncUpiExpenses({ deadlineMs: Date.now() + HEADLESS_BUDGET_MS });
    await headless();
    const s1 = await getUpiSettings();
    expect(s1.backfill?.active).toBe(true);
    expect(created.size).toBeGreaterThan(0);
    expect(created.size).toBeLessThan(total);
    expect(HEADLESS_BUDGET_MS).toBe(45000);
    for (let i = 0; i < 10 && (await getUpiSettings()).backfill; i++) await headless();
    expect(created.size).toBe(total);
    expect(payloads).toHaveLength(total);
  });

  it("copes with more messages than a batch sharing ONE timestamp (JS-side overlap/limit growth)", async () => {
    const total = INBOX_BATCH * 2 + 50;
    mockInbox.current = [debit(-1, BASE), ...Array.from({ length: total }, (_, i) => debit(i, BASE + 5000)), debit(9999, BASE + 9000)];
    const summary = await syncUpiExpenses();
    expect(summary?.backfillActive).toBe(false);
    expect(created.size).toBe(total + 2);
    expect(payloads).toHaveLength(total + 2);
    expect((await getUpiSettings()).lastScanMs).toBe(BASE + 9000);
  });

  it("a failed inbox read pauses the import instead of ending it", async () => {
    mockInbox.current = [debit(1), debit(2)];
    mockHooks.onRead = () => "fail";
    const summary = await syncUpiExpenses();
    expect(summary).toMatchObject({ incomplete: true, backfillActive: true });
    expect((await getUpiSettings()).backfill?.active).toBe(true);
    mockHooks.onRead = undefined;
    await syncUpiExpenses();
    expect(created.size).toBe(2);
  });

  it("retries blocked/failed messages: an unreachable server leaves the batch for the next run", async () => {
    mockInbox.current = Array.from({ length: 5 }, (_, i) => debit(i));
    api.createTransactionsBulk.mockRejectedValueOnce(new Error("Network Error"));
    const first = await syncUpiExpenses();
    expect(first).toMatchObject({ incomplete: true, saved: 0, backfillActive: true });
    expect((await getUpiSettings()).backfill).toMatchObject({ active: true, scanned: 0 });
    await syncUpiExpenses();
    expect(created.size).toBe(5);
  });

  it("explicit 'Import old messages' resumes an active import of the same range instead of restarting", async () => {
    mockInbox.current = Array.from({ length: INBOX_BATCH * 2 }, (_, i) => debit(i));
    mockHooks.onRead = (n) => (n === 2 ? "fail" : undefined);
    await syncUpiExpenses({ backfillRange: "all" });
    const startedAt = (await getUpiSettings()).backfill!.startedAt;
    mockHooks.onRead = undefined;
    rd.readInbox.mockClear();
    await syncUpiExpenses({ backfillRange: "all" });
    expect(rd.readInbox.mock.calls[0][0]).toBeGreaterThan(0);
    expect(created.size).toBe(INBOX_BATCH * 2);
    expect(startedAt).toBeGreaterThan(0);
  });

  it("cancel stops the import and a later sync does not restart it", async () => {
    mockInbox.current = Array.from({ length: INBOX_BATCH * 3 }, (_, i) => debit(i));
    mockHooks.onRead = (n) => {
      if (n === 2) void cancelUpiBackfill();
    };
    await syncUpiExpenses();
    const s = await getUpiSettings();
    expect(s.backfill).toBeUndefined();
    expect(s.lastScanMs).toBeDefined();
    const saved = created.size;
    expect(saved).toBeLessThan(INBOX_BATCH * 3);
    await syncUpiExpenses();
    expect((await getUpiSettings()).backfill).toBeUndefined();
  });
});

describe("foreground service during the import", () => {
  const handle = () => ({ update: jest.fn(), stop: jest.fn(async () => undefined) });

  it("starts once, updates per batch and stops with the result", async () => {
    const h = handle();
    mockStart.mockResolvedValue(h);
    mockInbox.current = Array.from({ length: INBOX_BATCH * 2 }, (_, i) => debit(i));
    await syncUpiExpenses();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledTimes(3);
    expect(h.update.mock.calls[2][0]).toMatchObject({ saved: INBOX_BATCH * 2 });
    expect(h.stop).toHaveBeenCalledWith({ saved: INBOX_BATCH * 2 });
  });

  it("stops without the 'Done' result when paused", async () => {
    const h = handle();
    mockStart.mockResolvedValue(h);
    mockInbox.current = Array.from({ length: INBOX_BATCH * 2 }, (_, i) => debit(i));
    mockHooks.onRead = (n) => (n === 2 ? "fail" : undefined);
    await syncUpiExpenses();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.stop.mock.calls[0]).toEqual([]);
  });

  it("restarts the service for each slice (Android short-service limit) and still finishes", async () => {
    const handles: ReturnType<typeof handle>[] = [];
    mockStart.mockImplementation(async () => {
      const h = handle();
      handles.push(h);
      return h;
    });
    const total = INBOX_BATCH * 5;
    mockInbox.current = Array.from({ length: total }, (_, i) => debit(i));
    useClock(100_000); // two batches per 150 s slice
    await syncUpiExpenses();
    expect(handles.length).toBeGreaterThan(1);
    handles.forEach((h) => expect(h.stop).toHaveBeenCalledTimes(1));
    expect(handles[handles.length - 1].stop).toHaveBeenCalledWith({ saved: total });
    expect(created.size).toBe(total);
  });

  it.each([
    ["resolves null", () => mockStart.mockResolvedValue(null)],
    ["rejects", () => mockStart.mockRejectedValue(new Error("FGS not allowed"))],
  ])("the import still completes in the foreground when the service %s", async (_n, arrange) => {
    arrange();
    mockInbox.current = Array.from({ length: INBOX_BATCH + 10 }, (_, i) => debit(i));
    const summary = await syncUpiExpenses();
    expect(summary?.backfillActive).toBe(false);
    expect(created.size).toBe(INBOX_BATCH + 10);
  });
});

describe("old messages are logged too", () => {
  it("the backlog logs every old allowed-sender message once, even across resumes", async () => {
    mockInbox.current = [...Array.from({ length: INBOX_BATCH + 20 }, (_, i) => debit(i)), { id: "x", address: "VM-HDFCBK", date: BASE + 1, body: "hdfc msg -HDFC" }];
    mockHooks.onRead = (n) => (n === 2 ? "fail" : undefined);
    await syncUpiExpenses();
    mockHooks.onRead = undefined;
    await syncUpiExpenses();
    const log = await readSmsLog();
    expect(log).toHaveLength(INBOX_BATCH + 20);
    expect(log.every((e) => e.source === "inbox")).toBe(true);
  });
});
