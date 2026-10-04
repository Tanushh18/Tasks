import request from "supertest";
import { createApp } from "../src/app";
import { Lead } from "../src/models/Lead";
import { LeadSource } from "../src/models/LeadSource";
import { extractPhones, normalizePhone, parseCsv, parseTabs } from "../src/services/leadImport";
import { cleanupNotInterested, syncSource } from "../src/services/leadService";
import { authed, registerUser } from "./helpers";

const app = createApp();
const ADMIN = "8130483894";

// Shapes taken from the real lead sheets: banner rows above the header, two applicants, landlines,
// several numbers in one cell, "IN-Stock" placeholder rows, a free-text remark column.
const TOWER_CSV = [
  ",,,,,,,,",
  "Buyers ,,,,,,,,",
  "Belgravia - Tower 10,,,,,,,,",
  "Central Park II ,,,,,,,,",
  "Status of Buyer,S. No,Apartment No.,Title,Name Ist Appl.,Name IInd Appl.,City,Cell No.   1st Appl,Cell No.  IInd Appl,Landline No.,email - 1,",
  ",1,G A,Mr.,Roshan Lal Jain,,Delhi ,+91-9829377877,,,rahul@lycos.com,",
  ",2,G B,,IN-Stock,,,,,,,",
  "1,3,1 A,Mr.,Puneet Dewan,Simran Dewan ,New Delhi,9810361793,9811655856,01127453421,,",
  "1,4,2 C,Ms.,Divya Burman ,,Delhi,,,0112614138,,File Missing",
  "1,5,3 A,Mr.,Arun Gandotra,,Jammu,,,9810045126,,",
].join("\n");

const MAIN_CSV = [
  "Serial No.,File No.,Name of Buyer,Name of Dealer,Contact No. 1,Contact No. 2,Email ID",
  "1,CP-3/IF/002,Mr. Gaurav Gupta,Axiom Landbase,9873770555,9811257475,g@gmail.com;p@yahoo.com",
  "2,CP-3/IF/024,Mrs. Vijayata Sokhanda,Aayush Regency,9718108484/9911183466,0,v@gmail.com",
  "3,CP-3/IF/030,Roshan Lal Jain (again),X,`09829377877,,",
].join("\n");

const SIMPLE_CSV = ["OWNER NAME,MOBILE", "Balwinder Kumar,9417516921", "No Number Person,", "Nisha Singh,98184 97174"].join("\n");

describe("lead sheet parsing", () => {
  it("normalises Indian mobiles and rejects landlines / junk", () => {
    expect(normalizePhone("+91-98293 77877")).toBe("+919829377877");
    expect(normalizePhone("`09893045118")).toBe("+919893045118");
    expect(normalizePhone("919810361793")).toBe("+919810361793");
    expect(normalizePhone("00919810361793")).toBe("+919810361793");
    expect(normalizePhone("01127453421")).toBeNull();
    expect(normalizePhone("0124-123456")).toBeNull();
    expect(normalizePhone("9999999999")).toBeNull();
    expect(normalizePhone("951123611812")).toBeNull();
    expect(extractPhones("9718108484/9911183466")).toEqual(["+919718108484", "+919911183466"]);
    expect(extractPhones("9810361793 9811655856")).toEqual(["+919810361793", "+919811655856"]);
  });

  it("reads every format, keeps one lead per number across tabs and reports what was dropped", () => {
    const r = parseTabs([
      { tab: "T 10", rows: parseCsv(TOWER_CSV) },
      { tab: "Main Sheet", rows: parseCsv(MAIN_CSV) },
      { tab: "Sheet3", rows: parseCsv(SIMPLE_CSV) },
    ]);
    const byPhone = new Map(r.leads.map((l) => [l.phone, l]));

    const roshan = byPhone.get("+919829377877")!;
    expect(roshan.name).toBe("Roshan Lal Jain");
    expect(roshan.email).toBe("rahul@lycos.com");
    expect(roshan.info).toContain("Belgravia - Tower 10");
    expect(roshan.info).toContain("Apartment No: G A");
    // Seen again in Main Sheet: kept once, with that row's detail appended.
    expect(roshan.info).toContain("CP-3/IF/030");

    const puneet = byPhone.get("+919810361793")!;
    expect(puneet.name).toBe("Puneet Dewan & Simran Dewan");
    expect(puneet.alternatePhones).toEqual(["+919811655856"]);

    // A mobile typed into the landline column still makes a lead.
    expect(byPhone.get("+919810045126")?.name).toBe("Arun Gandotra");

    expect(byPhone.get("+919718108484")?.alternatePhones).toEqual(["+919911183466"]);
    expect(byPhone.get("+919873770555")?.info).toContain("Name of Dealer: Axiom Landbase");
    expect(byPhone.get("+919818497174")?.name).toBe("Nisha Singh");

    expect(r.reports.map((x) => [x.tab, x.valid])).toEqual([
      ["T 10", 3],
      ["Main Sheet", 2],
      ["Sheet3", 2],
    ]);
    expect(r.reports[0].placeholder).toBe(1);
    expect(r.reports[0].noPhone).toBe(1);
    expect(r.reports[1].duplicates).toBe(1);
    expect(r.rejected.find((x) => x.name === "Divya Burman")?.reason).toBe("no_valid_mobile");
    expect(r.rejected.find((x) => x.name === "No Number Person")).toBeDefined();
  });
});

const META_CSV = [
  "Qualified,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,form_name,is_organic,platform,\"are_you_having_a_plot_in_gurgaon_,__farkukhnagar_or_badli\",full_name,phone_number,lead_status,id",
  "l:1,2026-08-31T12:12:17-05:00,,,,,,,f:1,Construction-02,true,,<test lead: dummy data>,<test lead: dummy data for full_name>,p:<test lead: dummy data for phone_number>,Qualified,",
  "l:2,2026-09-05T10:00:38-05:00,ag:1,Banner-01,as:1,Construction,c:1,ShineOne-Property,f:1,Construction-02,false,fb,yes,Jitender Yadav,p:+919968460543,CREATED,",
  "l:2,2026-09-05T20:30:38+05:30,ag:1,Banner-01,as:1,Construction,c:1,ShineOne-Property,f:1,Construction-02,false,fb,yes,Jitender Yadav,p:+919968460543,CREATED,",
].join("\n");

describe("meta lead-ads export", () => {
  it("takes the person's name and number, not the ad name or the p: prefix", () => {
    const r = parseTabs([{ tab: "Sheet1", rows: parseCsv(META_CSV) }]);
    const lead = r.leads.find((l) => l.phone === "+919968460543")!;
    expect(lead.name).toBe("Jitender Yadav");
    expect(lead.category).toBe("Construction");
    expect(lead.plot).toBe("yes");
    expect(r.leads).toHaveLength(1);
  });
});

describe("no-auth bulk import", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("needs the owner to have an account", async () => {
    const res = await request(app).post("/api/leads/bulk-import").send({ csv: SIMPLE_CSV });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/8130483894/);
  });

  it("dry-runs, imports, and re-imports without duplicating", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");

    const dry = await request(app).post("/api/leads/bulk-import").send({ csv: TOWER_CSV, label: "Towers", dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.dryRun).toBe(true);
    expect(dry.body.summary.added).toBe(3);
    expect(await Lead.countDocuments()).toBe(0);

    const first = await request(app).post("/api/leads/bulk-import").send({ csv: TOWER_CSV, label: "Towers" });
    expect(first.status).toBe(201);
    expect(first.body.summary).toMatchObject({ added: 3, updated: 0, noValidMobile: 1, placeholders: 1 });
    expect(first.body.owner.mobileNumber).toBe(ADMIN);
    expect(first.body.source.label).toBe("Towers");

    const again = await request(app).post("/api/leads/bulk-import").send({ csv: TOWER_CSV, label: "Towers" });
    expect(again.body.summary).toMatchObject({ added: 0, updated: 3 });
    expect(await Lead.countDocuments()).toBe(3);
    expect(await LeadSource.countDocuments({ kind: "import" })).toBe(1);

    // Raw text/csv works too, with options in the query string.
    const raw = await request(app)
      .post("/api/leads/bulk-import?label=Owners")
      .set("Content-Type", "text/csv")
      .send(SIMPLE_CSV);
    expect(raw.status).toBe(201);
    expect(raw.body.summary.added).toBe(2);

    // The admin sees them in the app.
    const list = await authed(app, admin.token).get("/api/leads?page=1&limit=10&status=all");
    expect(list.body.total).toBe(5);
  });

  it("does not overwrite what someone typed on an existing lead", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    await a.post("/api/leads/import").send({ contacts: [{ name: "Typed Name", phone: "9829377877" }] });
    const res = await request(app).post("/api/leads/bulk-import").send({ csv: TOWER_CSV });
    expect(res.body.summary.updated).toBe(1);
    const lead = await Lead.findOne({ phone: "+919829377877" }).lean();
    expect(lead?.name).toBe("Typed Name");
    expect(lead?.email).toBe("rahul@lycos.com");
  });

  it("reads every tab of a Google Sheet link", async () => {
    await registerUser(app, ADMIN, "4821", "Admin");
    const html = `{name: "T 10", pageUrl: "https:\\/\\/docs.google.com\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=11"},{name: "Sheet3", pageUrl: "https:\\/\\/docs.google.com\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=22"}`;
    global.fetch = jest.fn(async (url: string) => {
      const body = url.includes("htmlview") ? html : url.includes("gid=11") ? TOWER_CSV : SIMPLE_CSV;
      return { ok: true, status: 200, text: async () => body };
    }) as any;
    const res = await request(app)
      .post("/api/leads/bulk-import")
      .send({ sheetUrl: "https://docs.google.com/spreadsheets/d/abcDEF123/edit?usp=sharing" });
    expect(res.status).toBe(201);
    expect(res.body.tabs.map((t: any) => t.tab)).toEqual(["T 10", "Sheet3"]);
    expect(res.body.summary.added).toBe(5);
  });

  it("rejects an empty request", async () => {
    await registerUser(app, ADMIN, "4821", "Admin");
    const res = await request(app).post("/api/leads/bulk-import").send({});
    expect(res.status).toBe(400);
  });
});

describe("admin-only lead tools", () => {
  it("only the admin can link a sheet or import a CSV in the app", async () => {
    const user = await registerUser(app, "9876591001", "4821", "Normal");
    const u = authed(app, user.token);
    expect((await u.post("/api/leads/sources").send({ url: "https://docs.google.com/spreadsheets/d/x/edit" })).status).toBe(403);
    expect((await u.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV })).status).toBe(403);
    expect((await u.get("/api/leads/meta")).body.isAdmin).toBe(false);
    expect(user.res.body.user.isAdmin).toBe(false);

    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    expect(admin.res.body.user.isAdmin).toBe(true);
    expect((await a.get("/api/leads/meta")).body.isAdmin).toBe(true);
    const imp = await a.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV, fileName: "owners.csv" });
    expect(imp.status).toBe(201);
    expect(imp.body.summary.added).toBe(2);
    expect(imp.body.source.label).toBe("owners.csv");
  });

  it("hides the sheet link and sync errors from people a list is shared with", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const bob = await registerUser(app, "9876591002", "4821", "Bob");
    const a = authed(app, admin.token);
    await a.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV, label: "Owners" });
    const src = (await a.get("/api/leads/sources/list")).body.sources.find((s: any) => s.label === "Owners");
    await LeadSource.updateOne({ _id: src.id }, { url: "https://secret", lastError: "boom" });
    await a.post(`/api/leads/sources/${src.id}/share`).send({ mobileNumber: "9876591002" });
    const seen = (await authed(app, bob.token).get("/api/leads/sources/list")).body.sources[0];
    expect(seen.label).toBe("Owners");
    expect(seen.url).toBeUndefined();
    expect(seen.lastError).toBeUndefined();
    expect((await authed(app, bob.token).get("/api/leads?page=1&status=all")).body.total).toBe(2);
  });
});

describe("lead list by source", () => {
  it("filters to one list, or combines all of them", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    await a.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV, label: "Calling data" });
    await a.post("/api/leads/admin/import").send({ csv: META_CSV, label: "Meta leads" });
    const sources = (await a.get("/api/leads/sources/list")).body.sources;
    const id = (label: string) => sources.find((s: any) => s.label === label).id;
    const total = async (q: string) => (await a.get(`/api/leads?page=1&status=all${q}`)).body;
    expect((await total("")).total).toBe(3);
    expect((await total("&sourceId=all")).total).toBe(3);
    const meta = await total(`&sourceId=${id("Meta leads")}`);
    expect(meta.total).toBe(1);
    expect(meta.totalAll).toBe(1);
    expect((await total(`&sourceId=${id("Calling data")}`)).total).toBe(2);
    expect((await a.get("/api/leads?page=1&sourceId=nope")).status).toBe(400);
  });
});

describe("sheet names", () => {
  it("shows the Meta sheet as 'Meta Sheet' whatever it was added as", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    await LeadSource.create({ ownerId: admin.userId, sheetId: "1Nv1japYjs6HY3_R5lJTDEMW4vPrEOdXbEvJH4aRznZs", gid: "all", label: "Property Leads", url: "x" });
    const list = (await a.get("/api/leads/sources/list")).body.sources;
    expect(list.map((s: any) => s.label)).toContain("Meta Sheet");
  });
});

describe("renaming a list", () => {
  it("lets the owner rename an imported list, and nobody else", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const bob = await registerUser(app, "9876591004", "4821", "Bob");
    const a = authed(app, admin.token);
    await a.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV, label: "Central Park 2" });
    const src = (await a.get("/api/leads/sources/list")).body.sources.find((s: any) => s.label === "Central Park 2");
    expect((await authed(app, bob.token).patch(`/api/leads/sources/${src.id}`).send({ label: "X" })).status).toBe(404);
    expect((await a.patch(`/api/leads/sources/${src.id}`).send({ label: "Calling Data" })).status).toBe(200);
    expect((await a.get("/api/leads/sources/list")).body.sources.map((s: any) => s.label)).toContain("Calling Data");
  });
});

describe("deleting a lead", () => {
  it("is admin only and keeps a sheet from re-adding the lead", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const bob = await registerUser(app, "9876591003", "4821", "Bob");
    const a = authed(app, admin.token);
    await a.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV, label: "Owners" });
    const leads = (await a.get("/api/leads?page=1&status=all")).body.leads;
    const target = leads[0];
    expect((await authed(app, bob.token).delete(`/api/leads/${target.id}`)).status).toBe(403);
    expect((await a.delete(`/api/leads/${target.id}`)).status).toBe(204);
    expect((await a.delete(`/api/leads/${target.id}`)).status).toBe(404);
    expect((await a.delete("/api/leads/nope")).status).toBe(404);
    expect((await a.get("/api/leads?page=1&status=all")).body.total).toBe(1);
    const again = await a.post("/api/leads/admin/import").send({ csv: SIMPLE_CSV, label: "Owners" });
    expect(again.body.summary.skippedDeleted).toBe(1);
    expect((await a.get("/api/leads?page=1&status=all")).body.total).toBe(1);
  });
});

describe("names-only correction", () => {
  it("fixes the name and leaves stage, notes and everything else alone", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    await a.post("/api/leads/admin/import").send({ csv: META_CSV, label: "Meta leads" });
    const lead = (await a.get("/api/leads?page=1&status=all")).body.leads[0];
    await Lead.updateOne({ _id: lead.id }, { name: "Banner-01", status: "Follow-up", notes: "call Monday", category: "Interior" });

    const dry = await request(app).post("/api/leads/bulk-import").send({ csv: META_CSV, namesOnly: true, dryRun: true });
    expect(dry.body.changes).toEqual([{ phone: "+919968460543", from: "Banner-01", to: "Jitender Yadav" }]);
    expect((await Lead.findById(lead.id).lean())?.name).toBe("Banner-01");

    const res = await request(app).post("/api/leads/bulk-import").send({ csv: META_CSV, namesOnly: true });
    expect(res.body.changed).toBe(1);
    const after = await Lead.findById(lead.id).lean();
    expect(after).toMatchObject({ name: "Jitender Yadav", status: "Follow-up", notes: "call Monday", category: "Interior" });
    expect(await Lead.countDocuments()).toBe(1);
  });
});

describe("lead list, edits and cleanup", () => {
  async function seed(count: number) {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const a = authed(app, admin.token);
    const contacts = Array.from({ length: count }, (_, i) => ({ name: `Lead ${i}`, phone: `98100${String(i).padStart(5, "0")}` }));
    await a.post("/api/leads/import").send({ contacts });
    return { a, admin };
  }

  it("pages 10 at a time, newest first, filtered by stage, with stage counts", async () => {
    const { a } = await seed(25);
    const leads = (await a.get("/api/leads")).body.leads; // old clients: everything
    expect(leads).toHaveLength(25);
    await a.patch(`/api/leads/${leads[0].id}`).send({ status: "Interested" });

    const p1 = await a.get("/api/leads?page=1&limit=10&status=New");
    expect(p1.body.leads).toHaveLength(10);
    expect(p1.body.total).toBe(24);
    expect(p1.body.totalPages).toBe(3);
    expect(p1.body.totalAll).toBe(25);
    expect(p1.body.stageCounts).toEqual([
      { stage: "New", count: 24 },
      { stage: "Interested", count: 1 },
    ]);
    expect(p1.body.leads[0].createdAt).toBeDefined();

    const p3 = await a.get("/api/leads?page=3&limit=10&status=New");
    expect(p3.body.leads).toHaveLength(4);
    const interested = await a.get("/api/leads?page=1&status=Interested");
    expect(interested.body.leads.map((l: any) => l.id)).toEqual([leads[0].id]);

    const search = await a.get("/api/leads?page=1&status=all&search=Lead 7");
    expect(search.body.leads.map((l: any) => l.name)).toEqual(["Lead 7"]);
  });

  it("edits name and mobile, records who updated it, and refuses a clash", async () => {
    const { a } = await seed(2);
    const [one, two] = (await a.get("/api/leads")).body.leads;
    const bad = await a.patch(`/api/leads/${one.id}`).send({ phone: "12345" });
    expect(bad.status).toBe(400);
    const clash = await a.patch(`/api/leads/${one.id}`).send({ phone: two.phone });
    expect(clash.status).toBe(409);

    const ok = await a.patch(`/api/leads/${one.id}`).send({ name: "Renamed", phone: "+91 91234 56789" });
    expect(ok.status).toBe(200);
    expect(ok.body.lead).toMatchObject({ name: "Renamed", phone: "+919123456789", updatedByName: "Admin" });
    expect(ok.body.lead.alternatePhones).toContain(one.phone);
    expect(ok.body.lead.updatedAt).toBeDefined();
    expect(ok.body.lead.ownerId).toBeUndefined();
  });

  it("starts the 30-day clock on 'Not interested' and clears it when the stage changes", async () => {
    const { a } = await seed(1);
    const [lead] = (await a.get("/api/leads")).body.leads;
    const ni = await a.patch(`/api/leads/${lead.id}`).send({ status: "Not interested" });
    expect(ni.body.lead.notInterestedAt).toBeTruthy();
    expect(ni.body.lead.statusUpdatedAt).toBeTruthy();
    const back = await a.patch(`/api/leads/${lead.id}`).send({ status: "Follow-up" });
    expect(back.body.lead.notInterestedAt).toBeNull();
  });

  it("deletes leads 30 days after 'Not interested' and keeps a sheet from re-adding them", async () => {
    const admin = await registerUser(app, ADMIN, "4821", "Admin");
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => SIMPLE_CSV }) as any;
    try {
      const a = authed(app, admin.token);
      const added = await a.post("/api/leads/sources").send({ url: "https://docs.google.com/spreadsheets/d/sheetX/edit#gid=0" });
      expect(added.status).toBe(201);
      const day = 24 * 60 * 60 * 1000;
      await Lead.updateOne({ phone: "+919417516921" }, { status: "Not interested", notInterestedAt: new Date(Date.now() - 31 * day) });
      await Lead.updateOne({ phone: "+919818497174" }, { status: "Not interested", notInterestedAt: new Date(Date.now() - 29 * day) });

      expect(await cleanupNotInterested()).toBe(1);
      expect(await Lead.exists({ phone: "+919417516921" })).toBeNull();
      expect(await Lead.exists({ phone: "+919818497174" })).not.toBeNull();

      const source = await LeadSource.findById(added.body.source.id).lean();
      await syncSource(source, String(source!.ownerId), true);
      expect(await Lead.exists({ phone: "+919417516921" })).toBeNull();
    } finally {
      global.fetch = realFetch;
    }
  });

  it("gives leads already marked 'Not interested' a fresh 30 days instead of deleting them at once", async () => {
    const { a } = await seed(1);
    const [lead] = (await a.get("/api/leads")).body.leads;
    await Lead.updateOne({ _id: lead.id }, { status: "Not intrested", notInterestedAt: null });
    expect(await cleanupNotInterested()).toBe(0);
    const fresh = await Lead.findById(lead.id).lean();
    expect(fresh?.notInterestedAt).toBeTruthy();
  });

  it("tells the app which contact numbers are already leads", async () => {
    const { a } = await seed(1);
    const res = await a.post("/api/leads/lookup").send({ phones: ["+91 98100 00000", "9123456789", "junk"] });
    expect(res.body.existing).toEqual(["+919810000000"]);
  });
});
