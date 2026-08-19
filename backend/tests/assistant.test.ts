import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("assistant (AI not configured)", () => {
  it("returns a clean 503 instead of crashing when the AI isn't configured", async () => {
    // Force the "no key" path deterministically — backend/.env may or may not have a real
    // GEMINI_API_KEY depending on the environment this suite runs in (e.g. a dev machine with
    // Phase 2 set up vs. a clean CI checkout), so this must not depend on that.
    const realKey = env.geminiApiKey;
    env.geminiApiKey = "";
    try {
      const { token } = await registerUser(app, "9876677777", "4821");
      // Deliberately unparseable by the rule engine: anything it recognises (including
      // "How much did I spend?") is now answered locally without the model. See
      // tests/rulesCommands.test.ts for that path.
      const res = await authed(app, token)
        .post("/api/assistant/message")
        .send({ message: "hmm about that thing we discussed earlier" });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
    } finally {
      env.geminiApiKey = realKey;
    }
  });

  it("answers a known command locally even with no AI key configured", async () => {
    const realKey = env.geminiApiKey;
    env.geminiApiKey = "";
    try {
      const { token } = await registerUser(app, "9876677778", "4821");
      const res = await authed(app, token)
        .post("/api/assistant/message")
        .send({ message: "How much did I spend?" });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBeTruthy();
    } finally {
      env.geminiApiKey = realKey;
    }
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
