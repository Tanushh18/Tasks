import request from "supertest";

const mockResources = jest.fn();
const mockByIds = jest.fn();
const mockDestroy = jest.fn();

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    api: {
      resources: (...a: unknown[]) => mockResources(...a),
      resources_by_ids: (...a: unknown[]) => mockByIds(...a),
    },
    uploader: { destroy: (...a: unknown[]) => mockDestroy(...a), upload: jest.fn() },
    utils: { api_sign_request: (p: Record<string, unknown>, secret: string) => `sig:${secret}:${Object.keys(p).sort().join(",")}` },
  },
}));

import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { clearShineCache } from "../src/services/shineMediaService";
import { authed, registerUser } from "./helpers";

const app = createApp();

function configure(on: boolean) {
  env.shineCloudName = on ? "democloud" : "";
  env.shineApiKey = on ? "key123" : "";
  env.shineApiSecret = on ? "secret456" : "";
  clearShineCache();
}

beforeEach(() => {
  jest.clearAllMocks();
  configure(true);
  mockResources.mockImplementation(async (opts: { resource_type: string; prefix: string }) => {
    if (opts.resource_type === "video") {
      return opts.prefix === "ShineOne/sec 4/"
        ? { resources: [{ public_id: "ShineOne/sec 4/clip1", version: 5, bytes: 900, created_at: "2026-10-03T10:00:00Z" }] }
        : { resources: [] };
    }
    return opts.prefix === "ShineOne/sec 4/"
      ? {
          resources: [
            { public_id: "ShineOne/sec 4/a", version: 1, format: "jpg", bytes: 10, created_at: "2026-10-01T10:00:00Z" },
            { public_id: "ShineOne/sec 4/b", version: 2, format: "png", bytes: 20, created_at: "2026-10-02T10:00:00Z" },
          ],
        }
      : { resources: [] };
  });
  mockByIds.mockImplementation(async (ids: string[]) => ({
    resources: ids.map((id) => ({ public_id: id, version: 9, format: "jpg", bytes: 1, created_at: "2026-09-01T00:00:00Z" })),
  }));
  mockDestroy.mockResolvedValue({ result: "ok" });
});
afterAll(() => configure(false));

describe("shine media - public list for the website", () => {
  it("needs no sign-in, returns mp4/original links newest first, and allows any website", async () => {
    const res = await request(app).get("/api/public/shine/media").set("Origin", "https://www.shineoneestate.co.in");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeTruthy();
    expect(res.headers["cache-control"]).toContain("max-age=60");
    expect(Object.keys(res.body.folders)).toEqual(["sec 4", "sec 9", "sec 42", "sec 46", "reliance met city"]);
    expect(res.body.folders["sec 4"]).toEqual([
      "https://res.cloudinary.com/democloud/video/upload/v5/ShineOne/sec%204/clip1.mp4",
      "https://res.cloudinary.com/democloud/image/upload/v2/ShineOne/sec%204/b.png",
      "https://res.cloudinary.com/democloud/image/upload/v1/ShineOne/sec%204/a.jpg",
    ]);
  });

  it("includes the older photos stored outside the project folders", async () => {
    const res = await request(app).get("/api/public/shine/media");
    expect(res.body.folders["reliance met city"]).toHaveLength(3);
    expect(res.body.folders["sec 42"][0]).toContain("WhatsApp_Image_2026-09-05_at_22.53.10.jpg");
  });

  it("reports 503 until the Cloudinary variables are set", async () => {
    configure(false);
    const res = await request(app).get("/api/public/shine/media");
    expect(res.status).toBe(503);
  });

  it("serves repeat requests from a short cache", async () => {
    await request(app).get("/api/public/shine/media");
    const calls = mockResources.mock.calls.length;
    await request(app).get("/api/public/shine/media");
    expect(mockResources.mock.calls.length).toBe(calls);
  });
});

describe("shine media - app routes", () => {
  it("require sign-in", async () => {
    expect((await request(app).get("/api/shine-media/projects")).status).toBe(401);
    expect((await request(app).post("/api/shine-media/sign").send({})).status).toBe(401);
    expect((await request(app).post("/api/shine-media/delete").send({})).status).toBe(401);
  });

  it("lists every project with items for any signed-in user", async () => {
    const u = await registerUser(app, "9876590001", "4821", "Media User");
    const res = await authed(app, u.token).get("/api/shine-media/projects");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.projects.map((p: { key: string }) => p.key)).toHaveLength(5);
    const sec4 = res.body.projects.find((p: { key: string }) => p.key === "sec 4");
    expect(sec4.items).toHaveLength(3);
    expect(sec4.items[0]).toMatchObject({ kind: "video", publicId: "ShineOne/sec 4/clip1" });
    expect(sec4.items[0].thumb).toContain("so_0");
  });

  it("says not configured instead of failing when the variables are missing", async () => {
    configure(false);
    const u = await registerUser(app, "9876590002", "4821", "Media User 2");
    const res = await authed(app, u.token).get("/api/shine-media/projects");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it("signs an upload into the project folder with its tag, without exposing the secret", async () => {
    const u = await registerUser(app, "9876590003", "4821", "Media User 3");
    const res = await authed(app, u.token).post("/api/shine-media/sign").send({ project: "sec 9", kind: "video" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      uploadUrl: "https://api.cloudinary.com/v1_1/democloud/video/upload",
      apiKey: "key123",
      folder: "ShineOne/sec 9",
      tags: "sec9",
    });
    expect(res.body.signature).toBe("sig:secret456:folder,tags,timestamp");
    expect(JSON.stringify(res.body)).not.toContain("secret456\"");
  });

  it("rejects an unknown project or kind", async () => {
    const u = await registerUser(app, "9876590004", "4821", "Media User 4");
    const api = authed(app, u.token);
    expect((await api.post("/api/shine-media/sign").send({ project: "nope", kind: "image" })).status).toBe(400);
    expect((await api.post("/api/shine-media/sign").send({ project: "sec 9", kind: "pdf" })).status).toBe(400);
  });

  it("deletes a project file and refreshes the list; refuses files outside the projects", async () => {
    const u = await registerUser(app, "9876590005", "4821", "Media User 5");
    const api = authed(app, u.token);
    const ok = await api.post("/api/shine-media/delete").send({ publicId: "ShineOne/sec 4/a", kind: "image" });
    expect(ok.status).toBe(200);
    expect(mockDestroy).toHaveBeenCalledWith("ShineOne/sec 4/a", expect.objectContaining({ resource_type: "image", invalidate: true }));
    const legacy = await api.post("/api/shine-media/delete").send({ publicId: "WhatsApp_Image_2026-08-20_at_18.08.54", kind: "image" });
    expect(legacy.status).toBe(200);
    const bad = await api.post("/api/shine-media/delete").send({ publicId: "tasks-app/vault/secret", kind: "image" });
    expect(bad.status).toBe(400);
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when the file is already gone", async () => {
    mockDestroy.mockResolvedValue({ result: "not found" });
    const u = await registerUser(app, "9876590006", "4821", "Media User 6");
    const res = await authed(app, u.token).post("/api/shine-media/delete").send({ publicId: "ShineOne/sec 4/zz", kind: "image" });
    expect(res.status).toBe(404);
  });

  it("clears the cache after an upload so the website sees it", async () => {
    const u = await registerUser(app, "9876590007", "4821", "Media User 7");
    await request(app).get("/api/public/shine/media");
    const calls = mockResources.mock.calls.length;
    await authed(app, u.token).post("/api/shine-media/uploaded").send({});
    await request(app).get("/api/public/shine/media");
    expect(mockResources.mock.calls.length).toBeGreaterThan(calls);
  });
});
