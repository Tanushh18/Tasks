import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("family events", () => {
  it("creates an event including the creator as an attendee, and lists it as upcoming", async () => {
    const alice = await registerUser(app, "9876570001", "4821", "Alice");
    const bob = await registerUser(app, "9876570002", "4821", "Bob");
    const api = authed(app, alice.token);

    const created = await api.post("/api/family-events").send({
      title: "Family Dinner",
      type: "dinner",
      date: "2099-01-05",
      time: "19:00",
      attendeeIds: [bob.userId],
    });
    expect(created.status).toBe(201);
    expect(created.body.event.attendees).toHaveLength(2);
    const eventId = created.body.event.id;

    const upcoming = await api.get("/api/family-events?when=upcoming");
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.events.some((e: { id: string }) => e.id === eventId)).toBe(true);

    const past = await api.get("/api/family-events?when=past");
    expect(past.status).toBe(200);
    expect(past.body.events.some((e: { id: string }) => e.id === eventId)).toBe(false);
  });

  it("lets an attendee view an event but only the creator update or delete it", async () => {
    const alice = await registerUser(app, "9876570011", "4821", "Alice");
    const bob = await registerUser(app, "9876570012", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const created = await aliceApi.post("/api/family-events").send({
      title: "Checkup",
      type: "appointment",
      date: "2099-02-01",
      attendeeIds: [bob.userId],
    });
    const eventId = created.body.event.id;

    const viewed = await bobApi.get(`/api/family-events/${eventId}`);
    expect(viewed.status).toBe(200);

    const blockedUpdate = await bobApi.put(`/api/family-events/${eventId}`).send({ title: "Nope" });
    expect(blockedUpdate.status).toBe(403);

    const allowedUpdate = await aliceApi.put(`/api/family-events/${eventId}`).send({ title: "Dentist" });
    expect(allowedUpdate.status).toBe(200);
    expect(allowedUpdate.body.event.title).toBe("Dentist");

    const blockedDelete = await bobApi.delete(`/api/family-events/${eventId}`);
    expect(blockedDelete.status).toBe(403);
  });

  it("rejects invalid event payloads", async () => {
    const alice = await registerUser(app, "9876570021", "4821", "Alice");
    const api = authed(app, alice.token);

    const bad = await api.post("/api/family-events").send({ title: "", date: "not-a-date" });
    expect(bad.status).toBe(400);
  });

  it("blocks the feature when the familyEvents flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876570031", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);

    const off = await adminApi.patch("/api/admin/features").send({ familyEvents: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/family-events");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ familyEvents: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/family-events");
    expect(allowed.status).toBe(200);
  });
});
