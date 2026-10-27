import request from "supertest";
import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";
import { cleanServerUrl } from "../src/routes/serverRoutes";

const app = createApp();
const ADMIN_MOBILE = "8130483894";

describe("server list", () => {
  it("normalises urls", () => {
    expect(cleanServerUrl("https://a.onrender.com")).toBe("https://a.onrender.com/api");
    expect(cleanServerUrl("https://a.onrender.com/api/")).toBe("https://a.onrender.com/api");
    expect(cleanServerUrl("http://example.com/api")).toBeNull();
    expect(cleanServerUrl("nope")).toBeNull();
  });

  it("is readable by anyone and writable only by an admin", async () => {
    expect((await request(app).get("/api/servers")).body.urls).toEqual([]);
    const { token: userToken } = await registerUser(app, "9876546001", "4821", "Alice");
    expect((await authed(app, userToken).put("/api/servers").send({ urls: ["https://x.onrender.com/api"] })).status).toBe(403);

    const { token: adminToken } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const saved = await authed(app, adminToken).put("/api/servers").send({ urls: ["https://a.onrender.com", "https://b.onrender.com/api", "https://a.onrender.com/api"] });
    expect(saved.status).toBe(200);
    expect(saved.body.urls).toEqual(["https://a.onrender.com/api", "https://b.onrender.com/api"]);
    expect((await request(app).get("/api/servers")).body.urls).toHaveLength(2);
    expect((await authed(app, adminToken).put("/api/servers").send({ urls: ["ftp://bad"] })).status).toBe(400);
  });

  it("serves the admin page and script", async () => {
    expect((await request(app).get("/admin/servers")).text).toContain("Server URLs");
    expect((await request(app).get("/admin/servers/app.js")).status).toBe(200);
  });
});
