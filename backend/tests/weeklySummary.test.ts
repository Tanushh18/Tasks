import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("weekly summary", () => {
  it("is blocked until the user opts in via weeklySummaryEnabled", async () => {
    const alice = await registerUser(app, "9876580001", "4821", "Alice");
    const api = authed(app, alice.token);

    const blocked = await api.get("/api/weekly-summary");
    expect(blocked.status).toBe(400);

    const opted = await api.put("/api/auth/settings").send({ weeklySummaryEnabled: true });
    expect(opted.status).toBe(200);
    expect(opted.body.user.weeklySummaryEnabled).toBe(true);

    const allowed = await api.get("/api/weekly-summary");
    expect(allowed.status).toBe(200);
    expect(allowed.body).toHaveProperty("tasksCompleted");
    expect(allowed.body).toHaveProperty("totalExpenses");
    expect(allowed.body).toHaveProperty("upcomingReminders");
  });

  it("computes tasks completed and total expenses for the last 7 days", async () => {
    const alice = await registerUser(app, "9876580011", "4821", "Alice");
    const api = authed(app, alice.token);
    await api.put("/api/auth/settings").send({ weeklySummaryEnabled: true });

    const task = await api.post("/api/tasks").send({
      title: "Do laundry",
      date: todayStr(),
      time: "09:00",
    });
    expect(task.status).toBe(201);
    const complete = await api.patch(`/api/tasks/${task.body.task.id}/complete`).send({ completed: true });
    expect(complete.status).toBe(200);

    const account = await api.post("/api/finance/accounts").send({ name: "Wallet", type: "personal" });
    expect(account.status).toBe(201);
    const tx = await api.post("/api/finance/transactions").send({
      accountId: account.body.account.id,
      type: "OUT",
      amount: 250,
      category: "Groceries",
      date: todayStr(),
      time: "10:00",
    });
    expect(tx.status).toBe(201);

    const summary = await api.get("/api/weekly-summary");
    expect(summary.status).toBe(200);
    expect(summary.body.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(summary.body.totalExpenses).toBeGreaterThanOrEqual(250);
    expect(summary.body.insight).toContain("Groceries");
  });

  it("blocks the feature when the weeklySummary flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876580021", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);
    await api.put("/api/auth/settings").send({ weeklySummaryEnabled: true });

    const off = await adminApi.patch("/api/admin/features").send({ weeklySummary: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/weekly-summary");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ weeklySummary: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/weekly-summary");
    expect(allowed.status).toBe(200);
  });
});
