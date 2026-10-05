jest.mock("../src/services/geminiService", () => ({
  generateText: jest.fn(),
  isAiConfigured: jest.fn(() => true),
}));

import { createApp } from "../src/app";
import * as gemini from "../src/services/geminiService";
import { authed, registerUser } from "./helpers";

const app = createApp();
const ADMIN_MOBILE = "8130483894";
const generateText = gemini.generateText as jest.Mock;
const isAiConfigured = gemini.isAiConfigured as jest.Mock;

describe("POST /api/finance/parse-sms", () => {
  beforeEach(() => {
    generateText.mockReset();
    isAiConfigured.mockReturnValue(true);
  });

  it("is admin only", async () => {
    const { token } = await registerUser(app, "9876541001", "4821", "Bob");
    const res = await authed(app, token).post("/api/finance/parse-sms").send({ body: "Rs 5 debited" });
    expect(res.status).toBe(403);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns the validated extraction (and sends only the SMS text)", async () => {
    generateText.mockResolvedValue(
      '```json\n{"isTransaction":true,"type":"OUT","amount":120,"date":"2026-10-04","time":"10:20","merchant":"Shop","ref":"123456789012","accountLast4":"9229"}\n```'
    );
    const { token } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const res = await authed(app, token).post("/api/finance/parse-sms").send({ body: "weird format SMS Rs 120" });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ type: "OUT", amount: 120, ref: "123456789012" });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0].prompt).toBe("weird format SMS Rs 120");
  });

  it("returns null for non-transactions and for invalid model output", async () => {
    const { token } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const api = authed(app, token);
    generateText.mockResolvedValueOnce('{"isTransaction":false}');
    expect((await api.post("/api/finance/parse-sms").send({ body: "x Rs 1" })).body.transaction).toBeNull();
    generateText.mockResolvedValueOnce("sorry I can't");
    expect((await api.post("/api/finance/parse-sms").send({ body: "x Rs 1" })).body.transaction).toBeNull();
    generateText.mockResolvedValueOnce('{"isTransaction":true,"type":"OUT","amount":-4}');
    expect((await api.post("/api/finance/parse-sms").send({ body: "x Rs 1" })).body.transaction).toBeNull();
  });

  it("503s when AI is not configured", async () => {
    isAiConfigured.mockReturnValue(false);
    const { token } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const res = await authed(app, token).post("/api/finance/parse-sms").send({ body: "x Rs 1" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });
});

describe("bulk transactions and category months", () => {
  async function setup(mobile: string) {
    const { token } = await registerUser(app, mobile, "4821", "Alice");
    const api = authed(app, token);
    const acc = await api.post("/api/finance/accounts").send({ name: "Bank X1 (UPI)", type: "personal" });
    return { api, accountId: acc.body.account.id as string };
  }
  const item = (accountId: string, ref: string, over: Record<string, unknown> = {}) => ({
    accountId, type: "OUT", amount: 10, category: "UPI", description: "UPI to X", date: "2019-03-02", time: "10:00",
    notes: "Auto-added from SMS", idempotencyKey: `upi-${ref}`, ...over,
  });

  it("creates back-dated items once, reports duplicates and failures per item", async () => {
    const { api, accountId } = await setup("9876541002");
    const items = [item(accountId, "111111"), item(accountId, "222222", { type: "IN", amount: 5 }), item("0123456789abcdef01234567", "333333")];
    const first = await api.post("/api/finance/transactions/bulk").send({ items });
    expect(first.status).toBe(200);
    expect(first.body.results.map((r: { status: string }) => r.status)).toEqual(["created", "created", "failed"]);
    expect(first.body.results[2].permanent).toBe(true);

    const again = await api.post("/api/finance/transactions/bulk").send({ items });
    expect(again.body.results.map((r: { status: string }) => r.status)).toEqual(["duplicate", "duplicate", "failed"]);

    const list = await api.get(`/api/finance/transactions?accountId=${accountId}`);
    expect(list.body.transactions).toHaveLength(2);
  });

  it("rejects more than 100 items", async () => {
    const { api, accountId } = await setup("9876541003");
    const items = Array.from({ length: 101 }, (_, i) => item(accountId, String(100000 + i)));
    expect((await api.post("/api/finance/transactions/bulk").send({ items })).status).toBe(400);
  });

  it("groups a category by month", async () => {
    const { api, accountId } = await setup("9876541004");
    await api.post("/api/finance/transactions/bulk").send({
      items: [
        item(accountId, "1", { date: "2026-10-04", amount: 200 }),
        item(accountId, "2", { date: "2026-10-05", amount: 50, type: "IN" }),
        item(accountId, "3", { date: "2026-09-26", amount: 182 }),
        item(accountId, "4", { date: "2026-09-27", amount: 9, category: "Food" }),
      ],
    });
    const res = await api.get("/api/finance/category-months?category=UPI");
    expect(res.body.months).toEqual([
      { month: "2026-10", cashIn: 50, cashOut: 200, count: 2 },
      { month: "2026-09", cashIn: 0, cashOut: 182, count: 1 },
    ]);
  });
});
