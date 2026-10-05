import AsyncStorage from "@react-native-async-storage/async-storage";

const mockInbox: { current: { id: string; address: string; body: string; date: number }[] } = { current: [] };
const mockQueue: { current: { id: string; address: string; body: string; date: number }[] } = { current: [] };

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

import * as finance from "../../api/finance";
import * as reader from "../smsReader";
import {
  AI_MAX_PER_RUN,
  INBOX_BATCH,
  SAVE_CHUNK,
  getUpiHistory,
  getUpiSettings,
  handleIncomingSms,
  saveParsedMessage,
  setUpiTrackingEnabled,
  syncUpiExpenses,
  updateUpiSettings,
} from "../upiExpenseSync";
import { parseUpiSms } from "../upiSmsParser";

const api = finance as jest.Mocked<typeof finance>;
const rd = reader as jest.Mocked<typeof reader>;

const S1 = "Debited Rs 200.00 from a/c X9229 on 04Oct26 13:35 via UPI to Facebook Ind. Ref 664394072564.Bal Rs 11940.61. Not you?Call 18004251199 -Federal Bank";
const S2 = "Debited Rs 182.00 from a/c X9229 on 26Sep26 18:03 via UPI to Zomato Media. Ref 663526514328.Bal Rs 2874.61. Not you?Call 18004251199 -Federal Bank";
const S3 = "Debited Rs 500.00 from a/c X9229 on 25Sep26 21:35 via UPI to Meta Verifie. Ref 626895136750.Bal Rs 6056.61. Not you?Call 18004251199 -Federal Bank";
const BASE = Date.UTC(2026, 8, 1);

let n = 0;
const msg = (body: string, address = "VM-FEDBNK", date = BASE + ++n * 1000) => ({ id: `id${n}`, address, body, date });
const debit = (i: number, address = "VM-FEDBNK") =>
  msg(`Debited Rs ${100 + i}.00 from a/c X9229 on 04Oct26 13:35 via UPI to Shop${i}. Ref ${600000000000 + i}.Bal Rs 1.00. Not you?Call 1800 -Federal Bank`, address);

let created: Set<string>;
let payloads: finance.TransactionInput[];

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  n = 0;
  mockInbox.current = [];
  mockQueue.current = [];
  created = new Set();
  payloads = [];
  rd.hasSmsPermission.mockReturnValue(true);
  api.listAccounts.mockResolvedValue([]);
  api.createAccount.mockImplementation(async (i) => ({ id: "acc1", name: i.name, description: "", type: "personal", archived: false, settledUpTo: null, createdAt: "", updatedAt: "" }) as never);
  api.createTransactionsBulk.mockImplementation(async (items) =>
    items.map((it, index) => {
      payloads.push(it);
      if (created.has(it.idempotencyKey!)) return { index, status: "duplicate" as const };
      created.add(it.idempotencyKey!);
      return { index, status: "created" as const };
    })
  );
  api.parseSmsWithAi.mockResolvedValue(null);
  await setUpiTrackingEnabled(true, "user1");
});

describe("syncUpiExpenses", () => {
  it("saves the three Federal Bank samples once, with no SMS text, and never calls the AI", async () => {
    mockInbox.current = [msg(S3, "VM-FEDBNK", BASE + 1), msg(S2, "VM-FEDBNK", BASE + 2), msg(S1, "VM-FEDBNK", BASE + 3)];
    const summary = await syncUpiExpenses();
    expect(summary).toMatchObject({ scanned: 3, saved: 3, incomplete: false });
    expect(payloads).toHaveLength(3);
    const first = payloads.find((p) => p.idempotencyKey === "upi-664394072564")!;
    expect(first).toMatchObject({
      accountId: "acc1", type: "OUT", amount: 200, category: "UPI", date: "2026-10-04", time: "13:35",
      description: "UPI to Facebook Ind", notes: "Auto-added from SMS • Ref 664394072564",
    });
    const all = JSON.stringify(payloads);
    expect(all).not.toMatch(/Debited|Not you|Bal Rs|18004251199/);
    expect(api.createAccount).toHaveBeenCalledTimes(1);
    expect(api.createAccount.mock.calls[0][0].name).toBe("Federal Bank X9229 (UPI)");
    expect(api.parseSmsWithAi).not.toHaveBeenCalled();
    const history = JSON.stringify(await getUpiHistory());
    expect(history).not.toMatch(/Debited|Not you/);
    expect((await getUpiHistory())[0]).toMatchObject({ status: "saved" });
  });

  it("creates IN transactions as 'UPI from'", async () => {
    mockInbox.current = [msg("Credited Rs 50.00 to a/c X9229 on 05Oct26 09:10 via UPI from Ramesh Kumar. Ref 123456789012.Bal Rs 5.00 -Federal Bank")];
    await syncUpiExpenses();
    expect(payloads[0]).toMatchObject({ type: "IN", description: "UPI from Ramesh Kumar" });
  });

  it("does not duplicate on re-runs, including a full re-import", async () => {
    mockInbox.current = [msg(S1), msg(S2)];
    await syncUpiExpenses();
    const again = await syncUpiExpenses();
    expect(again?.saved).toBe(0);
    const reimport = await syncUpiExpenses({ backfillRange: "all" });
    expect(reimport).toMatchObject({ saved: 0, duplicates: 2 });
    expect(created.size).toBe(2);
    expect(api.createAccount).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure: the scan bookmark does not move past unsaved messages", async () => {
    mockInbox.current = [msg(S1)];
    api.createTransactionsBulk.mockRejectedValueOnce(new Error("Network Error"));
    const first = await syncUpiExpenses();
    expect(first).toMatchObject({ incomplete: true, saved: 0 });
    expect((await getUpiSettings()).lastScanMs ?? 0).toBeLessThan(mockInbox.current[0].date);
    const second = await syncUpiExpenses();
    expect(second).toMatchObject({ saved: 1, incomplete: false });
    expect(created.has("upi-664394072564")).toBe(true);
  });

  it("does nothing when the toggle is off or SMS permission is missing", async () => {
    mockInbox.current = [msg(S1)];
    await setUpiTrackingEnabled(false);
    expect(await syncUpiExpenses()).toBeNull();
    expect(rd.readInbox).not.toHaveBeenCalled();
    await setUpiTrackingEnabled(true, "user1");
    rd.hasSmsPermission.mockReturnValue(false);
    expect(await syncUpiExpenses()).toBeNull();
    expect(api.createTransactionsBulk).not.toHaveBeenCalled();
  });

  it("imports the whole inbox by default, in batches, without duplicates on a second pass", async () => {
    const total = INBOX_BATCH * 2 + 50;
    mockInbox.current = Array.from({ length: total }, (_, i) => debit(i));
    const progress: number[] = [];
    const summary = await syncUpiExpenses({ onProgress: (p) => progress.push(p.scanned) });
    expect(summary).toMatchObject({ scanned: total, saved: total });
    expect(rd.readInbox).toHaveBeenCalledTimes(3);
    expect(rd.readInbox.mock.calls[0]).toEqual([0, INBOX_BATCH]);
    expect(progress).toEqual([200, 400, 450]);
    expect(Math.max(...api.createTransactionsBulk.mock.calls.map((c) => c[0].length))).toBeLessThanOrEqual(SAVE_CHUNK);
    expect(created.size).toBe(total);
    expect((await getUpiSettings()).totalSaved).toBe(total);

    const again = await syncUpiExpenses({ backfillRange: "all" });
    expect(again?.saved).toBe(0);
    expect(created.size).toBe(total);
  });

  it("limits how far back an import looks when a range is chosen", async () => {
    const before = Date.now();
    await syncUpiExpenses({ backfillRange: "3m" });
    const since = rd.readInbox.mock.calls[0][0];
    expect(before - since).toBeGreaterThan(80 * 86400000);
    expect(before - since).toBeLessThan(100 * 86400000);
  });

  it("drains the native queue and deletes what it processed", async () => {
    mockQueue.current = [{ id: "q1", address: "VM-FEDBNK", body: S1, date: BASE }, { id: "q2", address: "VM-FEDBNK", body: "Your OTP is 123456", date: BASE }];
    await syncUpiExpenses();
    expect(created.has("upi-664394072564")).toBe(true);
    expect([...rd.removeQueuedSms.mock.calls[0][0]].sort()).toEqual(["q1", "q2"]);
  });
});

describe("sender allow-list", () => {
  it.each(["VM-FEDBNK", "FEDBNK", "AX-FEDMOBILE-S", "FedMobile", "vm-fedbnk"])("accepts %s", async (address) => {
    mockInbox.current = [msg(S1, address)];
    expect((await syncUpiExpenses())?.saved).toBe(1);
  });

  it("ignores other senders completely: nothing parsed, saved or sent to the AI", async () => {
    mockInbox.current = [
      msg(S1.replace(" -Federal Bank", ""), "VM-HDFCBK"),
      msg("Rs 250 paid to Foo via some new format xyz", "VM-HDFCBK"),
      msg("123456 is your OTP. Rs 500 debited", "AX-AMAZON"),
    ];
    const summary = await syncUpiExpenses();
    expect(summary?.saved).toBe(0);
    expect(api.createTransactionsBulk).not.toHaveBeenCalled();
    expect(api.parseSmsWithAi).not.toHaveBeenCalled();
  });

  it("accepts an unlisted sender only with the Federal Bank signature AND a regex parse (never AI)", async () => {
    mockInbox.current = [msg(S1, "Ramesh"), msg("Rs 250 paid to Foo via new format xyz -Federal Bank", "Ramesh")];
    const summary = await syncUpiExpenses();
    expect(summary?.saved).toBe(1);
    expect(created.has("upi-664394072564")).toBe(true);
    expect(api.parseSmsWithAi).not.toHaveBeenCalled();
  });

  it("applies to live messages too", async () => {
    await handleIncomingSms({ address: "VM-HDFCBK", body: S1.replace(" -Federal Bank", ""), date: BASE });
    expect(api.createTransactionsBulk).not.toHaveBeenCalled();
    await handleIncomingSms({ address: "VM-FEDBNK", body: S1, date: BASE });
    expect(created.has("upi-664394072564")).toBe(true);
  });
});

describe("AI fallback", () => {
  const odd = (i: number) => msg(`Rs ${300 + i} paid to Foo${i} via brand new format ${i}`);

  it("is used once for an unrecognised transaction-like message, and never twice for the same SMS", async () => {
    await updateUpiSettings({ lastScanMs: 1 });
    mockInbox.current = [odd(1)];
    api.parseSmsWithAi.mockResolvedValue({ type: "OUT", amount: 301, date: "2026-10-04", time: "10:00", merchant: "Foo1", ref: "999888777666", accountLast4: "9229" });
    await syncUpiExpenses();
    expect(api.parseSmsWithAi).toHaveBeenCalledTimes(1);
    expect(api.parseSmsWithAi).toHaveBeenCalledWith(mockInbox.current[0].body);
    expect(created.has("upi-999888777666")).toBe(true);
    await syncUpiExpenses({ backfillRange: "all" });
    expect(api.parseSmsWithAi).toHaveBeenCalledTimes(1);
  });

  it("is not used for the samples, OTPs, promos or failures", async () => {
    mockInbox.current = [
      msg(S1), msg(S2), msg(S3),
      msg("123456 is your OTP for payment of Rs 500 via UPI"),
      msg("Offer! Rs 500 cashback on your UPI payment, click now"),
      msg("UPI payment of Rs 500 failed. Ref 123456789012"),
    ];
    await syncUpiExpenses();
    expect(api.parseSmsWithAi).not.toHaveBeenCalled();
  });

  it("respects the per-run cap and retries the rest next run", async () => {
    await updateUpiSettings({ lastScanMs: 1 });
    mockInbox.current = Array.from({ length: AI_MAX_PER_RUN + 3 }, (_, i) => odd(i));
    api.parseSmsWithAi.mockImplementation(async (body) => {
      const i = Number(body.match(/format (\d+)/)![1]);
      return { type: "OUT", amount: 300 + i, date: "2026-10-04", time: "10:00", merchant: `Foo${i}`, ref: String(700000000000 + i), accountLast4: "9229" };
    });
    await syncUpiExpenses();
    expect(api.parseSmsWithAi).toHaveBeenCalledTimes(AI_MAX_PER_RUN);
    expect(created.size).toBe(AI_MAX_PER_RUN);
    await syncUpiExpenses();
    expect(created.size).toBe(AI_MAX_PER_RUN + 3);
    expect(api.parseSmsWithAi).toHaveBeenCalledTimes(AI_MAX_PER_RUN + 3);
  });

  it("copes with AI not being configured (503) without blocking the scan", async () => {
    await updateUpiSettings({ lastScanMs: 1 });
    mockInbox.current = [odd(1), odd(2)];
    const err = Object.assign(new Error("503"), { isAxiosError: true, response: { status: 503 } });
    api.parseSmsWithAi.mockRejectedValue(err);
    const summary = await syncUpiExpenses();
    expect(summary).toMatchObject({ saved: 0, incomplete: false });
    expect(api.parseSmsWithAi).toHaveBeenCalledTimes(1);
    expect((await getUpiSettings()).lastScanMs).toBeGreaterThan(mockInbox.current[1].date - 1);
  });
});

describe("saveParsedMessage", () => {
  it("saves a pasted message (no native module needed) and reports duplicates", async () => {
    const parsed = parseUpiSms(S1, BASE)!;
    expect(await saveParsedMessage(parsed)).toBe("saved");
    expect(await saveParsedMessage(parsed)).toBe("duplicate");
    expect(JSON.stringify(payloads)).not.toMatch(/Debited/);
  });
});
