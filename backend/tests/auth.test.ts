import request from "supertest";
import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("auth", () => {
  it("registers a new user and returns tokens", async () => {
    const { res } = await registerUser(app, "9876500001", "4821");
    expect(res.status).toBe(201);
    expect(res.body.user.mobileNumber).toBe("9876500001");
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("rejects a weak MPIN", async () => {
    const { res } = await registerUser(app, "9876500002", "1234");
    expect(res.status).toBe(400);
  });

  it("rejects registering the same mobile number twice", async () => {
    await registerUser(app, "9876500003", "4821");
    const { res } = await registerUser(app, "9876500003", "5511");
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    await registerUser(app, "9876500004", "4821");
    const res = await request(app).post("/api/auth/login").send({ mobileNumber: "9876500004", mpin: "4821" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects login with wrong MPIN", async () => {
    await registerUser(app, "9876500005", "4821");
    const res = await request(app).post("/api/auth/login").send({ mobileNumber: "9876500005", mpin: "0000" });
    expect(res.status).toBe(401);
  });

  it("locks the account after repeated failed logins", async () => {
    await registerUser(app, "9876500006", "4821");
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ mobileNumber: "9876500006", mpin: "0000" });
    }
    const res = await request(app).post("/api/auth/login").send({ mobileNumber: "9876500006", mpin: "4821" });
    expect(res.status).toBe(429);
  });

  it("rejects requests without a bearer token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    const { token } = await registerUser(app, "9876500007", "4821");
    const res = await authed(app, token).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.mobileNumber).toBe("9876500007");
  });

  it("changes the MPIN and allows login with the new one", async () => {
    const { token } = await registerUser(app, "9876500008", "4821");
    const changeRes = await authed(app, token)
      .post("/api/auth/change-mpin")
      .send({ currentMpin: "4821", newMpin: "6699", confirmNewMpin: "6699" });
    expect(changeRes.status).toBe(204);

    const loginRes = await request(app).post("/api/auth/login").send({ mobileNumber: "9876500008", mpin: "6699" });
    expect(loginRes.status).toBe(200);
  });

  it("refreshes the access token with a valid refresh token", async () => {
    const { refreshToken } = await registerUser(app, "9876500009", "4821");
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("logs out and invalidates the refresh token", async () => {
    const { token, refreshToken } = await registerUser(app, "9876500010", "4821");
    const logoutRes = await authed(app, token).post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it("keeps the same refresh token across silent refreshes so a lost response can't sign the user out", async () => {
    const { refreshToken } = await registerUser(app, "9876500011", "4821");
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.refreshToken).toBe(refreshToken);
      expect(res.body.accessToken).toBeTruthy();
    }
  });

  it("keeps every device signed in, and logging one out leaves the others", async () => {
    const first = await registerUser(app, "9876500012", "4821");
    const secondLogin = await request(app).post("/api/auth/login").send({ mobileNumber: "9876500012", mpin: "4821" });
    const secondRefresh = secondLogin.body.refreshToken as string;

    // Signing in on a second device must not invalidate the first.
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: first.refreshToken })).status).toBe(200);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: secondRefresh })).status).toBe(200);

    // Logging out the first device with its own token leaves the second one alone.
    await authed(app, first.token).post("/api/auth/logout").send({ refreshToken: first.refreshToken });
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: first.refreshToken })).status).toBe(401);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: secondRefresh })).status).toBe(200);
  });
});

describe("idempotent writes", () => {
  it("replays the stored response instead of creating a duplicate", async () => {
    const { token } = await registerUser(app, "9876500013", "4821");
    const send = () =>
      authed(app, token)
        .post("/api/notes")
        .set("Idempotency-Key", "11111111-2222-3333-4444-555555555555")
        .send({ title: "Buy milk", body: "2 litres" });

    const first = await send();
    expect(first.status).toBe(201);
    // The record is written just after the response is sent.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await send();
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const list = await authed(app, token).get("/api/notes");
    expect(list.body.notes).toHaveLength(1);
  });
});
