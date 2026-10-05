import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import { fsFailures, memFiles } from "../../test-utils/fsMock";

jest.mock("expo-file-system/legacy", () => require("../../test-utils/fsMock").createFsMock());
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

type Msg = { id: string; address: string; body: string; date: number };
const mockInbox: { current: Msg[] } = { current: [] };
const mockQueue: { current: Msg[] } = { current: [] };

jest.mock("../smsReader", () => ({
  smsReaderAvailable: true,
  hasSmsPermission: jest.fn(() => true),
  requestSmsPermission: jest.fn(async () => true),
  readInbox: jest.fn(async (since: number, limit: number) => mockInbox.current.filter((m) => m.date > since).sort((a, b) => a.date - b.date).slice(0, limit)),
  peekQueuedSms: jest.fn(() => mockQueue.current),
  removeQueuedSms: jest.fn(),
  onSmsReceived: jest.fn(() => () => undefined),
}));
jest.mock("../../api/finance", () => ({
  listAccounts: jest.fn(),
  createAccount: jest.fn(),
  createTransactionsBulk: jest.fn(),
  parseSmsWithAi: jest.fn(),
}));
jest.mock("../upiImportService", () => ({ SERVICE_SLICE_MS: 150000, startImportService: jest.fn(async () => null), registerUpiImportForegroundService: jest.fn() }));

import * as finance from "../../api/finance";
import { handleIncomingSms, setUpiTrackingEnabled, syncUpiExpenses, getUpiHistory } from "../upiExpenseSync";
import { SMS_LOG_FILENAME, clearSmsLog, exportSmsLog, getSmsLogStats, logSmsBatch, readSmsLog, resetSmsLogCache } from "../upiSmsLog";

const api = finance as jest.Mocked<typeof finance>;
const LOG = `file:///doc/${SMS_LOG_FILENAME}`;
const BASE = Date.UTC(2026, 8, 1);
const S1 = "Debited Rs 200.00 from a/c X9229 on 04Oct26 13:35 via UPI to Facebook Ind. Ref 664394072564.Bal Rs 11940.61. Not you?Call 18004251199 -Federal Bank";
const OTP = "123456 is your OTP for login. Do not share. -Federal Bank";

let created: Set<string>;
let payloads: unknown[];
let logAtSaveTime: string[];

beforeEach(async () => {
  await AsyncStorage.clear();
  memFiles.clear();
  fsFailures.write = false;
  resetSmsLogCache();
  jest.clearAllMocks();
  mockInbox.current = [];
  mockQueue.current = [];
  created = new Set();
  payloads = [];
  logAtSaveTime = [];
  api.listAccounts.mockResolvedValue([]);
  api.createAccount.mockImplementation(async (i) => ({ id: "acc1", name: i.name }) as never);
  api.createTransactionsBulk.mockImplementation(async (items) => {
    logAtSaveTime.push(memFiles.get(LOG) ?? "");
    return items.map((it, index) => {
      payloads.push(it);
      if (created.has(it.idempotencyKey!)) return { index, status: "duplicate" as const };
      created.add(it.idempotencyKey!);
      return { index, status: "created" as const };
    });
  });
  api.parseSmsWithAi.mockResolvedValue(null);
  await setUpiTrackingEnabled(true, "user1");
});

describe("local message log", () => {
  it("logs the inbox path verbatim, transaction or not, before the Money save", async () => {
    mockInbox.current = [
      { id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1 },
      { id: "8", address: "VM-FEDBNK", body: OTP, date: BASE + 2 },
      { id: "9", address: "VM-HDFCBK", body: "Rs 5 debited -HDFC", date: BASE + 3 },
    ];
    await syncUpiExpenses();
    const log = await readSmsLog();
    expect(log.map((e) => e.id)).toEqual(["7", "8"]); // other senders are never logged
    expect(log[0]).toMatchObject({
      id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1, source: "inbox", category: null,
      parsed: { type: "OUT", amount: 200, merchant: "Facebook Ind", ref: "664394072564", accountLast4: "9229", date: "2026-10-04", time: "13:35" },
    });
    expect(typeof log[0].loggedAt).toBe("number");
    expect(log[1]).toMatchObject({ body: OTP, parsed: null, category: null }); // OTPs are kept too
    // the file already held the message when the bulk save was called
    expect(logAtSaveTime[0]).toContain("664394072564");
  });

  it("logs the live path and the native-queue path", async () => {
    await handleIncomingSms({ address: "FEDBNK", body: S1, date: BASE + 5 });
    mockQueue.current = [{ id: "q-1", address: "AX-FEDMOBILE-S", body: OTP, date: BASE + 6 }];
    await syncUpiExpenses({ backfillRange: "3m" });
    const log = await readSmsLog();
    expect(log.map((e) => e.source).sort()).toEqual(["live", "queue"]);
    expect(log.find((e) => e.source === "live")!.body).toBe(S1);
    expect(log.find((e) => e.source === "queue")!.id).toBe("q-1");
  });

  it("never duplicates on re-scans, across paths, or the same SMS read live then from the inbox", async () => {
    mockInbox.current = [{ id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1 }];
    await handleIncomingSms({ address: "VM-FEDBNK", body: S1, date: BASE + 1 });
    await syncUpiExpenses();
    await syncUpiExpenses({ backfillRange: "all" });
    await syncUpiExpenses({ backfillRange: "all" });
    expect(await readSmsLog()).toHaveLength(1);
    expect(await getSmsLogStats()).toMatchObject({ count: 1 });
  });

  it("writes one file write per batch, not per message", async () => {
    const fs = require("expo-file-system/legacy");
    fs.writeAsStringAsync.mockClear();
    const msgs = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, address: "VM-FEDBNK", body: `Rs ${i} debited -Federal Bank`, date: BASE + i }));
    await logSmsBatch(msgs, "inbox");
    expect(fs.writeAsStringAsync).toHaveBeenCalledTimes(1);
  });

  it("a logging failure never breaks the sync", async () => {
    fsFailures.write = true;
    mockInbox.current = [{ id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1 }];
    const summary = await syncUpiExpenses();
    expect(summary).toMatchObject({ saved: 1, incomplete: false });
    expect(created.has("upi-664394072564")).toBe(true);
    expect(await readSmsLog()).toEqual([]);
  });

  it("the SMS text appears in the local log but never in API payloads, notes or history", async () => {
    mockInbox.current = [{ id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1 }];
    await syncUpiExpenses();
    expect(JSON.stringify(payloads)).not.toMatch(/Debited|Not you|Bal Rs|18004251199/);
    expect(JSON.stringify(await getUpiHistory())).not.toMatch(/Debited|Not you/);
    expect(memFiles.get(LOG)).toContain("Debited Rs 200.00");
  });

  it("export produces one valid JSON array and shares it; empty log exports nothing", async () => {
    expect(await exportSmsLog()).toBeNull();
    mockInbox.current = [
      { id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1 },
      { id: "8", address: "VM-FEDBNK", body: OTP, date: BASE + 2 },
    ];
    await syncUpiExpenses();
    const uri = await exportSmsLog();
    expect(uri).toMatch(/^file:\/\/\/cache\/upi-sms-log-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(memFiles.get(uri!)!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty("category", null);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: "application/json" }));
  });

  it("clear empties the log and logging works again afterwards", async () => {
    mockInbox.current = [{ id: "7", address: "VM-FEDBNK", body: S1, date: BASE + 1 }];
    await syncUpiExpenses();
    expect((await getSmsLogStats()).count).toBe(1);
    await clearSmsLog();
    expect(await getSmsLogStats()).toEqual({ count: 0, bytes: 0 });
    expect(memFiles.has(LOG)).toBe(false);
    await syncUpiExpenses({ backfillRange: "all" });
    expect((await getSmsLogStats()).count).toBe(1);
  });
});
