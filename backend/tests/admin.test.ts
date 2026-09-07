import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

// The admin phone number used in tests must match env.adminMobileNumbers (defaults to
// "8130483894" when ADMIN_MOBILE_NUMBERS isn't set).
const ADMIN_MOBILE = "8130483894";

describe("admin", () => {
  it("rejects non-admin users on all /api/admin routes", async () => {
    const { token, userId } = await registerUser(app, "9876545001", "4821", "Alice");
    const api = authed(app, token);

    const list = await api.get("/api/admin");
    expect(list.status).toBe(403);

    const block = await api.post(`/api/admin/${userId}/block`);
    expect(block.status).toBe(403);
  });

  it("lets an admin list users, excluding themselves", async () => {
    const { token: adminToken, userId: adminId } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const { userId: bobId } = await registerUser(app, "9876545002", "4821", "Bob");
    const api = authed(app, adminToken);

    const res = await api.get("/api/admin");
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: { id: string }) => u.id);
    expect(ids).toContain(bobId);
    expect(ids).not.toContain(adminId);
  });

  it("lets an admin block and unblock a user, and a blocked user can't log in", async () => {
    const { token: adminToken } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const { userId: bobId } = await registerUser(app, "9876545003", "4821", "Bob");
    const api = authed(app, adminToken);

    const block = await api.post(`/api/admin/${bobId}/block`);
    expect(block.status).toBe(200);
    expect(block.body.user.blocked).toBe(true);

    const loginBlocked = await require("supertest")(app)
      .post("/api/auth/login")
      .send({ mobileNumber: "9876545003", mpin: "4821" });
    expect(loginBlocked.status).toBe(403);

    const unblock = await api.post(`/api/admin/${bobId}/unblock`);
    expect(unblock.status).toBe(200);
    expect(unblock.body.user.blocked).toBe(false);

    const loginOk = await require("supertest")(app)
      .post("/api/auth/login")
      .send({ mobileNumber: "9876545003", mpin: "4821" });
    expect(loginOk.status).toBe(200);
  });

  it("lets an admin reset a user's MPIN, returning a plaintext MPIN once and forcing a change", async () => {
    const { token: adminToken } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const { userId: bobId } = await registerUser(app, "9876545004", "4821", "Bob");
    const api = authed(app, adminToken);

    const reset = await api.post(`/api/admin/${bobId}/reset-mpin`);
    expect(reset.status).toBe(200);
    expect(reset.body.mpin).toMatch(/^\d{6}$/);
    expect(reset.body.user.id).toBe(bobId);

    const loginOld = await require("supertest")(app)
      .post("/api/auth/login")
      .send({ mobileNumber: "9876545004", mpin: "4821" });
    expect(loginOld.status).toBe(401);

    const loginNew = await require("supertest")(app)
      .post("/api/auth/login")
      .send({ mobileNumber: "9876545004", mpin: reset.body.mpin });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.user.mustChangeMpin).toBe(true);
  });
});
