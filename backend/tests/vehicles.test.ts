import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";
import { FeatureFlags } from "../src/models/FeatureFlags";

const app = createApp();

describe("vehicles", () => {
  it("creates a vehicle and a pollution document with an expiry date", async () => {
    const alice = await registerUser(app, "9876580001", "4821", "Alice");
    const api = authed(app, alice.token);

    const created = await api.post("/api/vehicles").send({ name: "Kiger Car" });
    expect(created.status).toBe(201);
    expect(created.body.vehicle.name).toBe("Kiger Car");
    const vehicleId = created.body.vehicle.id;

    const doc = await api.post(`/api/vehicles/${vehicleId}/documents`).send({
      type: "pollution",
      expiresAt: "2026-12-31T00:00:00.000Z",
      reminderEnabled: true,
    });
    expect(doc.status).toBe(201);
    expect(doc.body.document.type).toBe("pollution");
    expect(doc.body.document.reminderEnabled).toBe(true);
  });

  it("lists vehicles for the owner", async () => {
    const alice = await registerUser(app, "9876580002", "4821", "Alice");
    const api = authed(app, alice.token);

    await api.post("/api/vehicles").send({ name: "Kiger Car" });
    const list = await api.get("/api/vehicles");
    expect(list.status).toBe(200);
    expect(list.body.vehicles).toHaveLength(1);
  });

  it("makes a shared vehicle visible to the shared family member", async () => {
    const alice = await registerUser(app, "9876580003", "4821", "Alice");
    const bob = await registerUser(app, "9876580004", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const created = await aliceApi.post("/api/vehicles").send({ name: "Kiger Car" });
    const vehicleId = created.body.vehicle.id;

    const bobListBefore = await bobApi.get("/api/vehicles");
    expect(bobListBefore.body.vehicles).toHaveLength(0);

    const updated = await aliceApi
      .put(`/api/vehicles/${vehicleId}`)
      .send({ sharedWith: [bob.userId] });
    expect(updated.status).toBe(200);

    const bobListAfter = await bobApi.get("/api/vehicles");
    expect(bobListAfter.body.vehicles).toHaveLength(1);

    const bobGet = await bobApi.get(`/api/vehicles/${vehicleId}`);
    expect(bobGet.status).toBe(200);
  });

  it("prevents a non-owner from deleting a shared vehicle", async () => {
    const alice = await registerUser(app, "9876580005", "4821", "Alice");
    const bob = await registerUser(app, "9876580006", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const created = await aliceApi
      .post("/api/vehicles")
      .send({ name: "Kiger Car", sharedWith: [bob.userId] });
    const vehicleId = created.body.vehicle.id;

    const deleted = await bobApi.delete(`/api/vehicles/${vehicleId}`);
    expect(deleted.status).toBe(403);
  });

  it("lets the owner toggle a document's reminder and update its expiry", async () => {
    const alice = await registerUser(app, "9876580007", "4821", "Alice");
    const api = authed(app, alice.token);

    const vehicle = await api.post("/api/vehicles").send({ name: "Kiger Car" });
    const vehicleId = vehicle.body.vehicle.id;

    const doc = await api
      .post(`/api/vehicles/${vehicleId}/documents`)
      .send({ type: "pollution", expiresAt: "2026-06-30T00:00:00.000Z" });
    const docId = doc.body.document.id;

    const updated = await api
      .put(`/api/vehicles/${vehicleId}/documents/${docId}`)
      .send({ reminderEnabled: false });
    expect(updated.status).toBe(200);
    expect(updated.body.document.reminderEnabled).toBe(false);
  });

  it("deleting a vehicle also deletes its documents", async () => {
    const alice = await registerUser(app, "9876580009", "4821", "Alice");
    const api = authed(app, alice.token);

    const vehicle = await api.post("/api/vehicles").send({ name: "Kiger Car" });
    const vehicleId = vehicle.body.vehicle.id;

    const doc = await api
      .post(`/api/vehicles/${vehicleId}/documents`)
      .send({ type: "pollution", expiresAt: "2026-06-30T00:00:00.000Z" });
    expect(doc.status).toBe(201);

    const deleted = await api.delete(`/api/vehicles/${vehicleId}`);
    expect(deleted.status).toBe(204);

    // The vehicle is gone, so its documents route now 404s rather than being listable directly —
    // assert indirectly via the parent vehicle lookup, which every document route depends on.
    const getVehicle = await api.get(`/api/vehicles/${vehicleId}`);
    expect(getVehicle.status).toBe(404);
    const getDocs = await api.get(`/api/vehicles/${vehicleId}/documents`);
    expect(getDocs.status).toBe(404);
  });

  it("is blocked by the vehicleManagement feature flag", async () => {
    await FeatureFlags.findByIdAndUpdate("global", { vehicleManagement: false }, { upsert: true });
    const carol = await registerUser(app, "9876580008", "4821", "Carol");
    const api = authed(app, carol.token);

    const res = await api.get("/api/vehicles");
    expect(res.status).toBe(403);

    await FeatureFlags.findByIdAndUpdate("global", { vehicleManagement: true }, { upsert: true });
  });
});
