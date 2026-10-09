import { createApp } from "../src/app";
import { Lead } from "../src/models/Lead";
import { LeadSource } from "../src/models/LeadSource";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("one shared My contacts pool", () => {
  it("three phones adding contacts make one My contacts list, not three", async () => {
    const users = [
      await registerUser(app, "9876592001", "4821", "Phone One"),
      await registerUser(app, "9876592002", "4821", "Phone Two"),
      await registerUser(app, "9876592003", "4821", "Phone Three"),
    ];
    for (const [i, u] of users.entries()) {
      const res = await authed(app, u.token).post("/api/leads/import").send({ contacts: [{ name: `Person ${i}`, phone: `98765920${i}0` }, { name: "Shared", phone: "9876592999" }] });
      expect(res.status).toBe(201);
    }

    expect(await LeadSource.countDocuments({ kind: "manual" })).toBe(1);
    const manual = await LeadSource.findOne({ kind: "manual" });
    const leads = await Lead.find({});
    expect(leads).toHaveLength(4); // three different people + the shared number saved once
    for (const l of leads) {
      expect(l.origin).toBe("My contacts");
      expect(l.sourceIds.map(String)).toEqual([String(manual!._id)]);
    }

    const sheets = (await authed(app, users[2].token).get("/api/leads/sources/list")).body.sources;
    expect(sheets.filter((s: { kind: string }) => s.kind === "manual")).toHaveLength(1);
    const origins = (await authed(app, users[1].token).get("/api/leads/origins")).body.origins;
    expect(origins).toEqual([{ name: "My contacts", count: 4, sent: 0 }]);
  });

  it("lists made earlier per person stay untouched; new contacts join the oldest and the list shows one row", async () => {
    const a = await registerUser(app, "9876593001", "4821", "Old A");
    const b = await registerUser(app, "9876593002", "4821", "Old B");
    const c = await registerUser(app, "9876593003", "4821", "New C");
    const oldA = await LeadSource.create({ ownerId: a.userId, sheetId: "manual", gid: "0", kind: "manual", label: "My contacts", createdAt: new Date("2026-09-01") });
    const oldB = await LeadSource.create({ ownerId: b.userId, sheetId: "manual", gid: "0", kind: "manual", label: "My contacts", createdAt: new Date("2026-09-02") });
    await Lead.create({ ownerId: a.userId, phone: "+919876593111", name: "Before A", sourceIds: [oldA._id], origin: "My contacts", originId: oldA._id });
    await Lead.create({ ownerId: b.userId, phone: "+919876593222", name: "Before B", sourceIds: [oldB._id], origin: "My contacts", originId: oldB._id });

    await authed(app, c.token).post("/api/leads/import").send({ contacts: [{ name: "After C", phone: "9876593333" }] });

    expect(await LeadSource.countDocuments({ kind: "manual" })).toBe(2); // nothing created, nothing removed
    const added = await Lead.findOne({ name: "After C" });
    expect(added!.sourceIds.map(String)).toEqual([String(oldA._id)]);
    expect((await Lead.findOne({ name: "Before B" }))!.sourceIds.map(String)).toEqual([String(oldB._id)]);

    const sheets = (await authed(app, c.token).get("/api/leads/sources/list")).body.sources;
    expect(sheets.filter((s: { kind: string }) => s.kind === "manual")).toHaveLength(1);
    const origins = (await authed(app, c.token).get("/api/leads/origins")).body.origins;
    expect(origins).toEqual([{ name: "My contacts", count: 3, sent: 0 }]);
  });
});
