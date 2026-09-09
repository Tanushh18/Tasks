import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";
import { FeatureFlags } from "../src/models/FeatureFlags";

const app = createApp();

describe("emergency info", () => {
  it("returns an empty record before anything is saved, then upserts on PUT", async () => {
    const alice = await registerUser(app, "9876590001", "4821", "Alice");
    const api = authed(app, alice.token);

    const empty = await api.get("/api/emergency-info");
    expect(empty.status).toBe(200);
    expect(empty.body.info.emergencyContacts).toHaveLength(0);

    const updated = await api.put("/api/emergency-info").send({
      emergencyContacts: [{ name: "Bob", phone: "555-1234", relation: "Brother" }],
      medicalNotes: "Allergic to penicillin",
      homeInfo: "Gate code 4821",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.info.emergencyContacts).toHaveLength(1);
    expect(updated.body.info.medicalNotes).toBe("Allergic to penicillin");

    // A second PUT should update the same record (upsert), not create a second one.
    const secondUpdate = await api.put("/api/emergency-info").send({ medicalNotes: "No known allergies" });
    expect(secondUpdate.status).toBe(200);
    expect(secondUpdate.body.info.medicalNotes).toBe("No known allergies");
    expect(secondUpdate.body.info.emergencyContacts).toHaveLength(1);
  });

  it("is visible to any registered family member, not just the owner", async () => {
    const alice = await registerUser(app, "9876590002", "4821", "Alice");
    const bob = await registerUser(app, "9876590003", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    await aliceApi.put("/api/emergency-info").send({ homeInfo: "Spare key under the mat" });

    const seenByBob = await bobApi.get(`/api/emergency-info/${alice.userId}`);
    expect(seenByBob.status).toBe(200);
    expect(seenByBob.body.info.homeInfo).toBe("Spare key under the mat");
  });

  it("is blocked by the emergencyInfo feature flag", async () => {
    await FeatureFlags.findByIdAndUpdate("global", { emergencyInfo: false }, { upsert: true });
    const carol = await registerUser(app, "9876590004", "4821", "Carol");
    const api = authed(app, carol.token);

    const res = await api.get("/api/emergency-info");
    expect(res.status).toBe(403);

    await FeatureFlags.findByIdAndUpdate("global", { emergencyInfo: true }, { upsert: true });
  });
});
