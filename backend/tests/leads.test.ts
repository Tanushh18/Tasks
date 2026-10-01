import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

const CSV = ["name,phone,campaign", "Ravi,9876543210,Construction", "Sita,9123456780,Interior"].join("\n");
const SHEET = "https://docs.google.com/spreadsheets/d/abc123/edit#gid=0";

describe("shared leads", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => CSV }) as any;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("stores sheet leads in the database and shares them with another user", async () => {
    const alice = await registerUser(app, "9876590001", "4821", "Alice");
    const bob = await registerUser(app, "9876590002", "4821", "Bob");
    const stranger = await registerUser(app, "9876590003", "4821", "Stranger");
    const a = authed(app, alice.token);
    const b = authed(app, bob.token);
    const s = authed(app, stranger.token);

    const added = await a.post("/api/leads/sources").send({ url: SHEET });
    expect(added.status).toBe(201);
    expect(added.body.source.isOwner).toBe(true);
    const sourceId = added.body.source.id;

    // Before sharing, Bob sees nothing.
    expect((await b.get("/api/leads")).body.leads).toHaveLength(0);

    const shared = await a.post(`/api/leads/sources/${sourceId}/share`).send({ mobileNumber: "9876590002" });
    expect(shared.status).toBe(200);
    expect(shared.body.source.sharedWith[0].name).toBe("Bob");

    const bobLeads = (await b.get("/api/leads")).body.leads;
    expect(bobLeads).toHaveLength(2);
    expect((await b.get("/api/leads/sources/list")).body.sources[0].isOwner).toBe(false);

    // An edit by Bob is visible to Alice.
    const lead = bobLeads.find((l: any) => l.name === "Ravi");
    const edit = await b.patch(`/api/leads/${lead.id}`).send({ status: "Interested", notes: "Call tomorrow" });
    expect(edit.status).toBe(200);
    const aliceView = (await a.get("/api/leads")).body.leads.find((l: any) => l.id === lead.id);
    expect(aliceView.status).toBe("Interested");
    expect(aliceView.notes).toBe("Call tomorrow");

    // A stranger can neither see nor edit them.
    expect((await s.get("/api/leads")).body.leads).toHaveLength(0);
    expect((await s.patch(`/api/leads/${lead.id}`).send({ status: "x" })).status).toBe(404);

    // Only the owner can delete the sheet or manage sharing.
    expect((await b.delete(`/api/leads/sources/${sourceId}`)).status).toBe(404);
    expect((await b.post(`/api/leads/sources/${sourceId}/share`).send({ mobileNumber: "9876590003" })).status).toBe(404);

    // Bob can leave; then he loses access.
    const left = await b.delete(`/api/leads/sources/${sourceId}/share/${bob.userId}`);
    expect(left.status).toBe(200);
    expect((await b.get("/api/leads")).body.leads).toHaveLength(0);
  });

  it("rejects sharing with an unknown number", async () => {
    const alice = await registerUser(app, "9876590011", "4821", "Alice");
    const a = authed(app, alice.token);
    const added = await a.post("/api/leads/sources").send({ url: SHEET });
    const res = await a.post(`/api/leads/sources/${added.body.source.id}/share`).send({ mobileNumber: "9000000000" });
    expect(res.status).toBe(404);
  });

  it("answers 409 (not a dropped connection) when the same sheet is added twice", async () => {
    const alice = await registerUser(app, "9876590021", "4821", "Alice");
    const a = authed(app, alice.token);
    expect((await a.post("/api/leads/sources").send({ url: SHEET })).status).toBe(201);
    const again = await a.post("/api/leads/sources").send({ url: SHEET });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already added/);
  });

  it("turns unexpected failures into a JSON error instead of crashing", async () => {
    const alice = await registerUser(app, "9876590031", "4821", "Alice");
    const a = authed(app, alice.token);
    const res = await a.patch("/api/leads/not-an-object-id").send({ status: "x" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toBeDefined();
  });

  it("imports phone contacts as leads, skips invalid/duplicate numbers, and shares them", async () => {
    const alice = await registerUser(app, "9876590041", "4821", "Alice");
    const bob = await registerUser(app, "9876590042", "4821", "Bob");
    const a = authed(app, alice.token);
    const b = authed(app, bob.token);

    const res = await a.post("/api/leads/import").send({
      contacts: [
        { name: "Mohan", phone: "+91 98765 11111" },
        { name: "Mohan again", phone: "9876511111" },
        { name: "Landline", phone: "0124-123456" },
        { name: "Geeta", phone: "9123411111" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ added: 2, existing: 1, invalid: 1 });

    const leads = (await a.get("/api/leads")).body.leads;
    expect(leads.map((l: any) => l.name).sort()).toEqual(["Geeta", "Mohan"]);
    expect(leads[0].phone).toMatch(/^\+91\d{10}$/);

    // Importing again adds nothing new.
    const again = await a.post("/api/leads/import").send({ contacts: [{ name: "Mohan", phone: "9876511111" }] });
    expect(again.body).toEqual({ added: 0, existing: 1, invalid: 0 });

    // The "My contacts" list is a shareable source; Bob then sees and edits them.
    const sources = (await a.get("/api/leads/sources/list")).body.sources;
    const mine = sources.find((s: any) => s.kind === "manual");
    expect(mine.label).toBe("My contacts");
    expect((await a.delete(`/api/leads/sources/${mine.id}`)).status).toBe(404);
    expect((await a.post(`/api/leads/sources/${mine.id}/share`).send({ mobileNumber: "9876590042" })).status).toBe(200);
    const bobLeads = (await b.get("/api/leads")).body.leads;
    expect(bobLeads).toHaveLength(2);
    const edit = await b.patch(`/api/leads/${bobLeads[0].id}`).send({ status: "Interested" });
    expect(edit.status).toBe(200);

    // A shared member importing a number that is already tracked doesn't create a duplicate.
    const dup = await b.post("/api/leads/import").send({ contacts: [{ name: "Mohan", phone: "9876511111" }] });
    expect(dup.body.added).toBe(0);
    expect((await b.get("/api/leads")).body.leads).toHaveLength(2);

    // Manual leads survive a sheet sync (which archives leads with no source).
    await a.post("/api/leads/sources").send({ url: SHEET });
    await a.post("/api/leads/sync");
    expect((await a.get("/api/leads")).body.leads.filter((l: any) => l.name === "Geeta")).toHaveLength(1);
  });

  it("rejects an empty import", async () => {
    const alice = await registerUser(app, "9876590051", "4821", "Alice");
    const res = await authed(app, alice.token).post("/api/leads/import").send({ contacts: [] });
    expect(res.status).toBe(400);
  });
});
