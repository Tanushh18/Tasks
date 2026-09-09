import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("recurring payments", () => {
  it("creates a recurring payment and computes status from nextDueDate", async () => {
    const alice = await registerUser(app, "9876570001", "4821", "Alice");
    const api = authed(app, alice.token);

    const overdue = await api.post("/api/recurring-payments").send({
      name: "Electricity",
      amount: 1500,
      frequency: "monthly",
      nextDueDate: todayPlusDays(-2),
    });
    expect(overdue.status).toBe(201);
    expect(overdue.body.payment.status).toBe("overdue");

    const dueSoon = await api.post("/api/recurring-payments").send({
      name: "Internet",
      amount: 999,
      frequency: "monthly",
      nextDueDate: todayPlusDays(1),
    });
    expect(dueSoon.body.payment.status).toBe("due-soon");

    const upcoming = await api.post("/api/recurring-payments").send({
      name: "Rent",
      amount: 20000,
      frequency: "monthly",
      nextDueDate: todayPlusDays(20),
    });
    expect(upcoming.body.payment.status).toBe("upcoming");

    const list = await api.get("/api/recurring-payments");
    expect(list.status).toBe(200);
    expect(list.body.payments).toHaveLength(3);
  });

  it("marking a payment paid records history and advances nextDueDate", async () => {
    const alice = await registerUser(app, "9876570002", "4821", "Alice");
    const api = authed(app, alice.token);

    const created = await api.post("/api/recurring-payments").send({
      name: "Rent",
      amount: 20000,
      frequency: "monthly",
      nextDueDate: "2026-01-05",
    });
    const id = created.body.payment.id;

    const paid = await api.post(`/api/recurring-payments/${id}/mark-paid`).send({
      date: "2026-01-05",
    });
    expect(paid.status).toBe(200);
    expect(paid.body.payment.history).toHaveLength(1);
    expect(paid.body.payment.history[0].amount).toBe(20000);
    expect(paid.body.payment.nextDueDate).toBe("2026-02-05");
  });

  it("rejects creating a recurring payment with an invalid frequency", async () => {
    const alice = await registerUser(app, "9876570003", "4821", "Alice");
    const api = authed(app, alice.token);

    const bad = await api.post("/api/recurring-payments").send({
      name: "Water",
      amount: 200,
      frequency: "daily",
      nextDueDate: "2026-01-05",
    });
    expect(bad.status).toBe(400);
  });

  it("blocks the feature when the recurringPayments flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876570004", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);

    const off = await adminApi.patch("/api/admin/features").send({ recurringPayments: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/recurring-payments");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ recurringPayments: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/recurring-payments");
    expect(allowed.status).toBe(200);
  });
});
