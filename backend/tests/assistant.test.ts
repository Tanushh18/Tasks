import request from "supertest";
import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("assistant (no GEMINI_API_KEY configured in this test environment)", () => {
  it("returns a clean 503 instead of crashing when the AI isn't configured", async () => {
    const { token } = await registerUser(app, "9876677777", "4821");
    const res = await authed(app, token).post("/api/assistant/message").send({ message: "How much did I spend?" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("rejects an empty message", async () => {
    const { token } = await registerUser(app, "9876688888", "4821");
    const res = await authed(app, token).post("/api/assistant/message").send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/assistant/message").send({ message: "hi" });
    expect(res.status).toBe(401);
  });
});
