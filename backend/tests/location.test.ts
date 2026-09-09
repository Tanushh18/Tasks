import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("location sharing", () => {
  it("silently ignores a ping when the user has no active share", async () => {
    const { token } = await registerUser(app, "9876546001", "4821", "Alice");
    const api = authed(app, token);

    const ping = await api.post("/api/location/ping").send({ lat: 12.9, lng: 77.6 });
    expect(ping.status).toBe(204);

    const shares = await api.get("/api/location/shares");
    expect(shares.body.sharedWithMe).toEqual([]);
  });

  it("starts sharing, accepts pings, and lists shares in both directions", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser(app, "9876546002", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876546003", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);

    const start = await apiA.post("/api/location/shares").send({ toUserId: userIdB });
    expect(start.status).toBe(204);

    // Calling start again is idempotent (upsert), not a duplicate-key error.
    const startAgain = await apiA.post("/api/location/shares").send({ toUserId: userIdB });
    expect(startAgain.status).toBe(204);

    const ping = await apiA.post("/api/location/ping").send({ lat: 12.9, lng: 77.6, accuracy: 5 });
    expect(ping.status).toBe(204);

    const sharesA = await apiA.get("/api/location/shares");
    expect(sharesA.body.sharingWith).toEqual([{ id: userIdB, name: "Bob", expiresAt: null }]);

    const sharesB = await apiB.get("/api/location/shares");
    expect(sharesB.body.sharedWithMe).toHaveLength(1);
    expect(sharesB.body.sharedWithMe[0].id).toBe(userIdA);
    expect(sharesB.body.sharedWithMe[0].name).toBe("Alice");
    expect(sharesB.body.sharedWithMe[0].lat).toBe(12.9);
    expect(sharesB.body.sharedWithMe[0].lng).toBe(77.6);
  });

  it("shows a sharer with null location until they've pinged", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser(app, "9876546004", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876546005", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);

    await apiA.post("/api/location/shares").send({ toUserId: userIdB });

    const sharesB = await apiB.get("/api/location/shares");
    expect(sharesB.status).toBe(200);
    expect(sharesB.body.sharedWithMe).toEqual([{ id: userIdA, name: "Alice", lat: null, lng: null, updatedAt: null }]);
  });

  it("rejects sharing with yourself and with a non-existent user", async () => {
    const { token, userId } = await registerUser(app, "9876546006", "4821", "Alice");
    const api = authed(app, token);

    const self = await api.post("/api/location/shares").send({ toUserId: userId });
    expect(self.status).toBe(400);

    const missing = await api.post("/api/location/shares").send({ toUserId: "111111111111111111111111" });
    expect(missing.status).toBe(404);
  });

  it("stops sharing", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser(app, "9876546007", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876546008", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);
    void userIdA;

    await apiA.post("/api/location/shares").send({ toUserId: userIdB });
    let sharesA = await apiA.get("/api/location/shares");
    expect(sharesA.body.sharingWith).toHaveLength(1);

    const stop = await apiA.delete(`/api/location/shares/${userIdB}`);
    expect(stop.status).toBe(204);

    sharesA = await apiA.get("/api/location/shares");
    expect(sharesA.body.sharingWith).toHaveLength(0);

    // Once unshared, a ping is quietly ignored again — Bob's stale location isn't cleared but
    // he no longer appears as an active sharer for Alice.
    const sharesB = await apiB.get("/api/location/shares");
    expect(sharesB.body.sharedWithMe).toHaveLength(0);
  });
});
