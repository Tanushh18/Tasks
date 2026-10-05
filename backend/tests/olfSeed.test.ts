import { createApp } from "../src/app";
import { Lead } from "../src/models/Lead";
import { LeadList } from "../src/models/LeadList";
import { LeadSource } from "../src/models/LeadSource";
import { syncSource } from "../src/services/leadService";
import { loadOlfRows, seedOlfData, seedOlfDataOnBoot } from "../src/services/olfSeed";
import { authed, registerUser } from "./helpers";

const app = createApp();
const ADMIN = "8130483894";

describe("OLF Data seed", () => {
  const rows = loadOlfRows();

  it("ships only valid, unique phone numbers", () => {
    expect(rows.length).toBe(302);
    expect(rows.every((r) => /^\+91[6-9]\d{9}$/.test(r.phone))).toBe(true);
    expect(new Set(rows.map((r) => r.phone)).size).toBe(rows.length);
    expect(rows.some((r) => ["2885", "4777", "5939", "6121", "6209"].includes(r.name))).toBe(false);
    expect(rows.filter((r) => r.name.startsWith("Admission")).length).toBe(4);
  });

  it("skips quietly when there is no admin, and retries once one exists", async () => {
    await registerUser(app, "9876500101", "4821", "Normal");
    expect(await seedOlfData()).toMatchObject({ ran: false, reason: "no-admin" });
    expect(await Lead.countDocuments({ origin: "OLF Data" })).toBe(0);
    expect(await LeadList.countDocuments({})).toBe(0);

    await registerUser(app, ADMIN, "4821", "Admin");
    const r = await seedOlfData();
    expect(r).toMatchObject({ ran: true, added: rows.length, invalid: 0 });
  });

  it("seeds into the oldest admin, with no sheet/import LeadSource, and is idempotent", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const r1 = await seedOlfData();
    expect(r1.added).toBe(rows.length);
    expect(await Lead.countDocuments({ origin: "OLF Data" })).toBe(rows.length);
    const one = await Lead.findOne({ origin: "OLF Data" }).lean();
    expect(String(one!.ownerId)).toBe(admin.userId);
    expect(await LeadSource.countDocuments({ kind: { $in: ["sheet", "import"] } })).toBe(0);
    const list = await LeadList.findOne({ key: "olf data" }).lean();
    expect(list!.seededAt).toBeTruthy();

    // A user deletes a contact; a later boot must not bring it back.
    const gone = await Lead.findOneAndDelete({ origin: "OLF Data" });
    expect(await seedOlfData()).toMatchObject({ ran: false, reason: "already-seeded" });
    await seedOlfDataOnBoot();
    expect(await Lead.countDocuments({ origin: "OLF Data" })).toBe(rows.length - 1);
    expect(await Lead.exists({ phone: gone!.phone })).toBeNull();
  });

  it("does not seed on top of leads that already carry the name", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    await Lead.create({ ownerId: admin.userId, phone: "+919876500777", name: "Mine", origin: "olf data" });
    expect(await seedOlfData()).toMatchObject({ ran: false, reason: "has-leads" });
    expect(await Lead.countDocuments({})).toBe(1);
  });

  it("stores a second number as an alternate phone, and skips invalid ones", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const { addManualLeads } = await import("../src/services/leadService");
    const res = await addManualLeads(admin.userId!, [
      { name: "A", phone: "9876500201", alternatePhones: ["9876500202", "123"] },
      { name: "Bad", phone: "4777" },
    ], "OLF Data");
    expect(res).toMatchObject({ added: 1, invalid: 1 });
    const lead = await Lead.findOne({ phone: "+919876500201" }).lean();
    expect(lead!.alternatePhones).toEqual(["+919876500202"]);
  });

  it("shows up in listOrigins with its count", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    await seedOlfData();
    const origins = (await authed(app, admin.token).get("/api/leads/origins")).body.origins;
    expect(origins).toContainEqual({ name: "OLF Data", count: rows.length });
  });

  it("admin endpoint: forbidden for others, returns counts, and does not duplicate", async () => {
    const normal = await registerUser(app, "9876500102", "4821", "Normal");
    expect((await authed(app, normal.token).post("/api/leads/admin/seed-olf")).status).toBe(403);

    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    const first = await a.post("/api/leads/admin/seed-olf");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ list: "OLF Data", added: rows.length, existing: 0, invalid: 0, total: rows.length });
    const second = await a.post("/api/leads/admin/seed-olf");
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ added: 0, existing: rows.length });
    expect(await Lead.countDocuments({ origin: "OLF Data" })).toBe(rows.length);
  });

  describe("sheet syncing never touches them", () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it("a sync run (even one whose sheet no longer lists these numbers) leaves OLF leads active and unlinked", async () => {
      const admin = await registerUser(app, ADMIN, "4821", "Admin");
      const a = authed(app, admin.token);
      await seedOlfData();
      global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => "OWNER NAME,MOBILE\nKaran,9876543210" })) as any;
      const added = await a.post("/api/leads/sources").send({ url: "https://docs.google.com/spreadsheets/d/olfSheet/edit#gid=0", label: "Meta Sheet" });
      expect(added.status).toBe(201);
      const source = await LeadSource.findById(added.body.source.id).lean();
      await syncSource(source, String(source!.ownerId), true);
      await a.post("/api/leads/sync");

      const olf = await Lead.find({ origin: "OLF Data" }).lean();
      expect(olf.length).toBe(rows.length);
      expect(olf.every((l) => l.archived === false && !l.sourceIds.map(String).includes(String(source!._id)))).toBe(true);
      // The sync scheduler only reads connected sheet sources: OLF has none of its own.
      expect(await LeadSource.countDocuments({ kind: { $nin: ["manual", "import"] }, enabled: true })).toBe(1);
    });
  });
});
