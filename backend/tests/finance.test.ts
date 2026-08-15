import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

async function client(mobileNumber = "9876533333") {
  const { token } = await registerUser(app, mobileNumber, "4821");
  return authed(app, token);
}

describe("finance", () => {
  it("creates an account", async () => {
    const api = await client();
    const res = await api.post("/api/finance/accounts").send({ name: "Home Expenses", type: "home" });
    expect(res.status).toBe(201);
    expect(res.body.account.name).toBe("Home Expenses");
  });

  it("rejects a duplicate account name for the same user", async () => {
    const api = await client();
    await api.post("/api/finance/accounts").send({ name: "Home Expenses" });
    const res = await api.post("/api/finance/accounts").send({ name: "Home Expenses" });
    expect(res.status).toBe(409);
  });

  it("rejects a transaction with a non-positive amount", async () => {
    const api = await client();
    const account = await api.post("/api/finance/accounts").send({ name: "Personal" });
    const res = await api
      .post("/api/finance/transactions")
      .send({ accountId: account.body.account.id, type: "OUT", amount: -10, date: "2026-01-01", time: "10:00" });
    expect(res.status).toBe(400);
  });

  it("rejects a transaction against another user's account", async () => {
    const apiA = await client("9876544444");
    const apiB = await client("9876555555");
    const accountA = await apiA.post("/api/finance/accounts").send({ name: "A's account" });

    const res = await apiB
      .post("/api/finance/transactions")
      .send({ accountId: accountA.body.account.id, type: "IN", amount: 100, date: "2026-01-01", time: "10:00" });
    expect(res.status).toBe(404);
  });

  it("computes cash in, cash out, net flow, and per-account balance correctly", async () => {
    const api = await client("9876566666");
    const account = await api.post("/api/finance/accounts").send({ name: "Home Expenses", type: "home" });
    const accountId = account.body.account.id;

    await api.post("/api/finance/transactions").send({ accountId, type: "IN", amount: 80000, category: "Salary", date: "2026-01-01", time: "09:00" });
    await api.post("/api/finance/transactions").send({ accountId, type: "OUT", amount: 42000, category: "Utilities", date: "2026-01-01", time: "10:00" });

    const summary = await api.get("/api/finance/summary");
    expect(summary.body.summary.cashIn).toBe(80000);
    expect(summary.body.summary.cashOut).toBe(42000);
    expect(summary.body.summary.netFlow).toBe(38000);
    expect(summary.body.summary.accounts[0].balance).toBe(38000);
  });

  it("prevents deleting an account that still has transactions", async () => {
    const api = await client("9876577777");
    const account = await api.post("/api/finance/accounts").send({ name: "Business" });
    await api.post("/api/finance/transactions").send({ accountId: account.body.account.id, type: "IN", amount: 100, date: "2026-01-01", time: "09:00" });

    const res = await api.delete(`/api/finance/accounts/${account.body.account.id}`);
    expect(res.status).toBe(400);
  });

  it("archives an account instead of deleting it", async () => {
    const api = await client("9876588888");
    const account = await api.post("/api/finance/accounts").send({ name: "Travel" });
    const res = await api.put(`/api/finance/accounts/${account.body.account.id}`).send({ archived: true });
    expect(res.body.account.archived).toBe(true);

    const list = await api.get("/api/finance/accounts");
    expect(list.body.accounts).toHaveLength(0);
  });

  it("isolates finance data between two different users", async () => {
    const apiA = await client("9876599999");
    const apiB = await client("9876600000");
    await apiA.post("/api/finance/accounts").send({ name: "A's account" });

    const listB = await apiB.get("/api/finance/accounts");
    expect(listB.body.accounts).toHaveLength(0);

    const summaryB = await apiB.get("/api/finance/summary");
    expect(summaryB.body.summary.cashIn).toBe(0);
  });

  it("does not create a duplicate transaction when the same idempotency key is replayed", async () => {
    const api = await client("9876622222");
    const account = await api.post("/api/finance/accounts").send({ name: "Personal" });
    const payload = {
      accountId: account.body.account.id,
      type: "OUT",
      amount: 500,
      date: "2026-01-01",
      time: "10:00",
      idempotencyKey: "offline-txn-1",
    };

    const first = await api.post("/api/finance/transactions").send(payload);
    const second = await api.post("/api/finance/transactions").send(payload);

    expect(first.status).toBe(201);
    expect(second.body.transaction.id).toBe(first.body.transaction.id);

    const list = await api.get("/api/finance/transactions").query({ accountId: account.body.account.id });
    expect(list.body.transactions).toHaveLength(1);
  });

  it("breaks down spending by category", async () => {
    const api = await client("9876611111");
    const account = await api.post("/api/finance/accounts").send({ name: "Personal" });
    const accountId = account.body.account.id;
    await api.post("/api/finance/transactions").send({ accountId, type: "OUT", amount: 1500, category: "Groceries", date: "2026-01-01", time: "09:00" });
    await api.post("/api/finance/transactions").send({ accountId, type: "OUT", amount: 3000, category: "Groceries", date: "2026-01-02", time: "09:00" });
    await api.post("/api/finance/transactions").send({ accountId, type: "OUT", amount: 500, category: "Transport", date: "2026-01-03", time: "09:00" });

    const res = await api.get("/api/finance/spending-analysis");
    expect(res.body.analysis.totalSpent).toBe(5000);
    const groceries = res.body.analysis.categories.find((c: { category: string }) => c.category === "Groceries");
    expect(groceries.total).toBe(4500);
  });
});
