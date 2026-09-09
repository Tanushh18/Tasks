import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

const ADMIN_MOBILE = "8130483894";

describe("feature flags", () => {
  it("returns all flags defaulted to true on first fetch", async () => {
    const { token } = await registerUser(app, "9876547001", "4821", "Alice");
    const api = authed(app, token);

    const res = await api.get("/api/features");
    expect(res.status).toBe(200);
    expect(res.body.features).toEqual({
      contacts: true,
      chat: true,
      ocr: true,
      location: true,
      assistant: true,
      notes: true,
      groupExpenses: true,
      documentVault: true,
      householdInventory: true,
      emergencyInfo: true,
      familyEvents: true,
      shoppingLists: true,
      recurringPayments: true,
      familyGoals: true,
      polls: true,
      weeklySummary: true,
    });
  });

  it("rejects non-admin users from reading or updating admin feature flags", async () => {
    const { token } = await registerUser(app, "9876547002", "4821", "Alice");
    const api = authed(app, token);

    const get = await api.get("/api/admin/features");
    expect(get.status).toBe(403);

    const patch = await api.patch("/api/admin/features").send({ contacts: false });
    expect(patch.status).toBe(403);
  });

  it("lets an admin flip a flag, and non-admins observe the change via /api/features", async () => {
    const { token: adminToken } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const { token } = await registerUser(app, "9876547003", "4821", "Alice");
    const adminApi = authed(app, adminToken);
    const api = authed(app, token);

    const patch = await adminApi.patch("/api/admin/features").send({ contacts: false });
    expect(patch.status).toBe(200);
    expect(patch.body.features.contacts).toBe(false);

    const features = await api.get("/api/features");
    expect(features.body.features.contacts).toBe(false);

    const restore = await adminApi.patch("/api/admin/features").send({ contacts: true });
    expect(restore.status).toBe(200);
    expect(restore.body.features.contacts).toBe(true);
  });

  it("blocks a gated route with 403 when its flag is off, and allows it again once re-enabled", async () => {
    const { token: adminToken } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const { token } = await registerUser(app, "9876547004", "4821", "Alice");
    const adminApi = authed(app, adminToken);
    const api = authed(app, token);

    const off = await adminApi.patch("/api/admin/features").send({ contacts: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/contacts");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ contacts: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/contacts");
    expect(allowed.status).toBe(200);
  });
});
