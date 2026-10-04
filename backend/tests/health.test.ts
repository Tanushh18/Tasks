import request from "supertest";
import { createApp } from "../src/app";

describe("health", () => {
  it("reports ok and the deployed commit", async () => {
    process.env.RENDER_GIT_COMMIT = "abc123";
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", commit: "abc123" });
    delete process.env.RENDER_GIT_COMMIT;
  });
});
