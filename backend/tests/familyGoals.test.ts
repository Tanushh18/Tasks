import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("family goals", () => {
  it("creates a goal, adds contributions, and computes progress at read time", async () => {
    const alice = await registerUser(app, "9876580001", "4821", "Alice");
    const bob = await registerUser(app, "9876580002", "4821", "Bob");
    const api = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const goal = await api.post("/api/family-goals").send({
      name: "Goa Trip",
      targetAmount: 1000,
      sharedWith: [bob.userId],
    });
    expect(goal.status).toBe(201);
    expect(goal.body.goal.savedAmount).toBe(0);
    expect(goal.body.goal.progress).toBe(0);
    const goalId = goal.body.goal.id;

    const contribution = await api.post(`/api/family-goals/${goalId}/contributions`).send({
      amount: 300,
      date: "2026-01-05",
    });
    expect(contribution.status).toBe(201);

    // A shared member (not the creator) should also be able to contribute.
    const bobContribution = await bobApi.post(`/api/family-goals/${goalId}/contributions`).send({
      amount: 200,
      date: "2026-01-06",
      note: "From Bob",
    });
    expect(bobContribution.status).toBe(201);

    const updated = await api.get(`/api/family-goals/${goalId}`);
    expect(updated.body.goal.savedAmount).toBe(500);
    expect(updated.body.goal.progress).toBe(0.5);

    const contributions = await api.get(`/api/family-goals/${goalId}/contributions`);
    expect(contributions.status).toBe(200);
    expect(contributions.body.contributions).toHaveLength(2);
  });

  it("rejects a contribution to a goal the user cannot access", async () => {
    const alice = await registerUser(app, "9876580011", "4821", "Alice");
    const stranger = await registerUser(app, "9876580012", "4821", "Stranger");
    const api = authed(app, alice.token);
    const strangerApi = authed(app, stranger.token);

    const goal = await api.post("/api/family-goals").send({ name: "Emergency Fund", targetAmount: 5000 });
    const goalId = goal.body.goal.id;

    const blocked = await strangerApi.post(`/api/family-goals/${goalId}/contributions`).send({
      amount: 100,
      date: "2026-01-05",
    });
    expect(blocked.status).toBe(404);
  });

  it("only lets the creator update or delete a goal", async () => {
    const alice = await registerUser(app, "9876580021", "4821", "Alice");
    const bob = await registerUser(app, "9876580022", "4821", "Bob");
    const api = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const goal = await api.post("/api/family-goals").send({ name: "New Car", targetAmount: 800000, sharedWith: [bob.userId] });
    const goalId = goal.body.goal.id;

    const bobUpdate = await bobApi.put(`/api/family-goals/${goalId}`).send({ name: "Renamed" });
    expect(bobUpdate.status).toBe(403);

    const aliceUpdate = await api.put(`/api/family-goals/${goalId}`).send({ name: "Renamed" });
    expect(aliceUpdate.status).toBe(200);
    expect(aliceUpdate.body.goal.name).toBe("Renamed");
  });

  it("blocks the feature when the familyGoals flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876580031", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);

    const off = await adminApi.patch("/api/admin/features").send({ familyGoals: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/family-goals");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ familyGoals: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/family-goals");
    expect(allowed.status).toBe(200);
  });
});
