import request from "supertest";
import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("activity feed", () => {
  it("shows another family member's completed task and added contact", async () => {
    const alice = await registerUser(app, "9876570001", "4821", "Alice");
    const bob = await registerUser(app, "9876570002", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const task = await aliceApi.post("/api/tasks").send({
      title: "Buy groceries",
      date: "2026-01-05",
      time: "10:00",
    });
    expect(task.status).toBe(201);
    await aliceApi.patch(`/api/tasks/${task.body.task.id}/complete`).send({ completed: true });

    await aliceApi.post("/api/contacts").send({ name: "Plumber", number: "9998887777" });

    const feed = await bobApi.get("/api/activity-feed");
    expect(feed.status).toBe(200);
    const kinds = feed.body.entries.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain("task");
    expect(kinds).toContain("contact");

    const taskEntry = feed.body.entries.find((e: { kind: string }) => e.kind === "task");
    expect(taskEntry.actorName).toBe("Alice");
    expect(taskEntry.text).toContain("Buy groceries");
  });

  it("is visible to any authenticated user, not just the actor", async () => {
    const alice = await registerUser(app, "9876570011", "4821", "Alice");
    const bob = await registerUser(app, "9876570012", "4821", "Bob");
    await authed(app, alice.token).post("/api/contacts").send({ name: "Electrician", number: "9991112222" });

    const bobFeed = await authed(app, bob.token).get("/api/activity-feed");
    expect(bobFeed.status).toBe(200);
    expect(bobFeed.body.entries.some((e: { text: string }) => e.text.includes("Electrician"))).toBe(true);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/activity-feed");
    expect(res.status).toBe(401);
  });
});
