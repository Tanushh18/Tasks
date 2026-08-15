import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("global search", () => {
  it("finds matching tasks, transactions, and accounts across resource types", async () => {
    const { token } = await registerUser(app, "9876633333", "4821");
    const api = authed(app, token);

    await api.post("/api/tasks").send({ title: "Pay electricity bill", date: "2099-01-01", time: "09:00" });
    const account = await api.post("/api/finance/accounts").send({ name: "Electricity Fund" });
    await api.post("/api/finance/transactions").send({
      accountId: account.body.account.id,
      type: "OUT",
      amount: 3500,
      description: "Electricity payment",
      date: "2026-01-01",
      time: "10:00",
    });
    await api.post("/api/tasks").send({ title: "Buy groceries", date: "2099-01-01", time: "09:00" });

    const res = await api.get("/api/search").query({ q: "electricity" });
    expect(res.status).toBe(200);
    expect(res.body.results.tasks).toHaveLength(1);
    expect(res.body.results.tasks[0].title).toBe("Pay electricity bill");
    expect(res.body.results.accounts).toHaveLength(1);
    expect(res.body.results.transactions).toHaveLength(1);
  });

  it("only searches within the authenticated user's own data", async () => {
    const userA = await registerUser(app, "9876644444", "4821");
    const userB = await registerUser(app, "9876655555", "4821");
    await authed(app, userA.token).post("/api/tasks").send({ title: "Unique search term xyz", date: "2099-01-01", time: "09:00" });

    const res = await authed(app, userB.token).get("/api/search").query({ q: "xyz" });
    expect(res.body.results.tasks).toHaveLength(0);
  });

  it("rejects an empty query", async () => {
    const { token } = await registerUser(app, "9876666666", "4821");
    const res = await authed(app, token).get("/api/search").query({ q: "" });
    expect(res.status).toBe(400);
  });
});
