import { createApp } from "../src/app";
import { resetStorageCache } from "../src/services/storageService";
import { authed, registerUser } from "./helpers";

const app = createApp();
const ADMIN_MOBILE = "8130483894";

describe("admin storage", () => {
  beforeEach(() => {
    resetStorageCache();
    delete process.env.MONGODB_STORAGE_LIMIT_MB;
  });

  it("rejects non-admin users", async () => {
    const { token } = await registerUser(app, "9876545101", "4821", "Alice");
    const res = await authed(app, token).get("/api/admin/storage");
    expect(res.status).toBe(403);
  });

  it("returns real db stats with default quota", async () => {
    const { token } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    const res = await authed(app, token).get("/api/admin/storage");
    expect(res.status).toBe(200);
    const s = res.body.storage;
    expect(s.totalSize).toBe(s.storageSize + s.indexSize);
    expect(s.usedBytes).toBe(s.totalSize);
    expect(s.limitBytes).toBe(512 * 1024 * 1024);
    expect(s.quotaSource).toBe("default");
    expect(s.freeBytes).toBe(s.limitBytes - s.usedBytes);
    expect(s.warning).toBe("ok");
    expect(Array.isArray(s.perCollection)).toBe(true);
    expect(s.perCollection.length).toBeLessThanOrEqual(15);
  });

  it("honours MONGODB_STORAGE_LIMIT_MB and flags critical usage", async () => {
    const { token } = await registerUser(app, ADMIN_MOBILE, "4821", "Admin");
    process.env.MONGODB_STORAGE_LIMIT_MB = "0.001";
    const res = await authed(app, token).get("/api/admin/storage");
    expect(res.status).toBe(200);
    expect(res.body.storage.quotaSource).toBe("env");
    expect(res.body.storage.freeBytes).toBe(0);
    expect(res.body.storage.warning).toBe("critical");
  });
});
