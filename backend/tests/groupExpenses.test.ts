import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("group expenses", () => {
  it("creates a group, adds an equal-split expense, and reports correct balances", async () => {
    const alice = await registerUser(app, "9876560001", "4821", "Alice");
    const bob = await registerUser(app, "9876560002", "4821", "Bob");
    const carol = await registerUser(app, "9876560003", "4821", "Carol");
    const api = authed(app, alice.token);

    const group = await api.post("/api/group-expenses").send({
      name: "Goa Trip",
      memberIds: [bob.userId, carol.userId],
    });
    expect(group.status).toBe(201);
    expect(group.body.group.members).toHaveLength(3);
    const groupId = group.body.group.id;

    // Alice pays 300 for dinner, split equally three ways (100 each).
    const expense = await api.post(`/api/group-expenses/${groupId}/expenses`).send({
      paidBy: alice.userId,
      amount: 300,
      description: "Dinner",
      date: "2026-01-05",
    });
    expect(expense.status).toBe(201);
    expect(expense.body.expense.splits).toHaveLength(3);
    expect(expense.body.expense.splits.every((s: { amount: number }) => s.amount === 100)).toBe(true);

    const balances = await api.get(`/api/group-expenses/${groupId}/balances`);
    expect(balances.status).toBe(200);
    expect(balances.body.totalSpent).toBe(300);

    const aliceBalance = balances.body.balances.find((b: { userId: string }) => b.userId === alice.userId);
    const bobBalance = balances.body.balances.find((b: { userId: string }) => b.userId === bob.userId);
    expect(aliceBalance.net).toBe(200); // paid 300, owes 100
    expect(bobBalance.net).toBe(-100); // paid 0, owes 100

    // Suggested transfers should route Bob and Carol's debt to Alice.
    expect(balances.body.transfers).toHaveLength(2);
    for (const transfer of balances.body.transfers) {
      expect(transfer.to.userId).toBe(alice.userId);
      expect(transfer.amount).toBe(100);
    }
  });

  it("supports custom splits and rejects ones that don't add up", async () => {
    const alice = await registerUser(app, "9876560011", "4821", "Alice");
    const bob = await registerUser(app, "9876560012", "4821", "Bob");
    const api = authed(app, alice.token);

    const group = await api.post("/api/group-expenses").send({ name: "Roommates", memberIds: [bob.userId] });
    const groupId = group.body.group.id;

    const bad = await api.post(`/api/group-expenses/${groupId}/expenses`).send({
      paidBy: alice.userId,
      amount: 100,
      date: "2026-01-05",
      splitType: "custom",
      splits: [
        { userId: alice.userId, amount: 40 },
        { userId: bob.userId, amount: 40 },
      ],
    });
    expect(bad.status).toBe(400);

    const good = await api.post(`/api/group-expenses/${groupId}/expenses`).send({
      paidBy: alice.userId,
      amount: 100,
      date: "2026-01-05",
      splitType: "custom",
      splits: [
        { userId: alice.userId, amount: 30 },
        { userId: bob.userId, amount: 70 },
      ],
    });
    expect(good.status).toBe(201);
  });

  it("settling up reduces the suggested transfers", async () => {
    const alice = await registerUser(app, "9876560021", "4821", "Alice");
    const bob = await registerUser(app, "9876560022", "4821", "Bob");
    const api = authed(app, alice.token);

    const group = await api.post("/api/group-expenses").send({ name: "Weekend", memberIds: [bob.userId] });
    const groupId = group.body.group.id;

    await api.post(`/api/group-expenses/${groupId}/expenses`).send({
      paidBy: alice.userId,
      amount: 200,
      date: "2026-01-05",
    });

    const settle = await api.post(`/api/group-expenses/${groupId}/settlements`).send({
      fromUser: bob.userId,
      toUser: alice.userId,
      amount: 100,
      date: "2026-01-06",
    });
    expect(settle.status).toBe(201);

    const balances = await api.get(`/api/group-expenses/${groupId}/balances`);
    expect(balances.body.transfers).toHaveLength(0);
    for (const balance of balances.body.balances) {
      expect(balance.net).toBe(0);
    }
  });

  it("blocks the feature when the groupExpenses flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876560031", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);

    const off = await adminApi.patch("/api/admin/features").send({ groupExpenses: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/group-expenses");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ groupExpenses: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/group-expenses");
    expect(allowed.status).toBe(200);
  });
});
