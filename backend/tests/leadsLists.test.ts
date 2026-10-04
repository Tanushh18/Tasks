import { createApp } from "../src/app";
import { Lead } from "../src/models/Lead";
import { LeadList } from "../src/models/LeadList";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("lists to file leads under", () => {
  it("anyone can create a list; it appears in the filter options right away with 0 leads", async () => {
    const u = await registerUser(app, "9876594001", "4821", "List User");
    const api = authed(app, u.token);

    const made = await api.post("/api/leads/lists").send({ name: "  Referrals  " });
    expect(made.status).toBe(201);
    expect(made.body).toEqual({ name: "Referrals", created: true });

    const origins = (await api.get("/api/leads/origins")).body.origins;
    expect(origins).toEqual([{ name: "Referrals", count: 0 }]);
  });

  it("a name that exists in any spelling isn't created twice", async () => {
    const u = await registerUser(app, "9876594002", "4821", "List User 2");
    const api = authed(app, u.token);
    await api.post("/api/leads/lists").send({ name: "Referrals" });
    const again = await api.post("/api/leads/lists").send({ name: "referrals" });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ name: "Referrals", created: false });
    expect(await LeadList.countDocuments({})).toBe(1);

    // A name some leads already carry (e.g. from a sheet) is reused with its own spelling.
    await Lead.create({ ownerId: u.userId, phone: "+919876594777", name: "X", origin: "Calling Data" });
    const known = await api.post("/api/leads/lists").send({ name: "calling data" });
    expect(known.body).toEqual({ name: "Calling Data", created: false });
  });

  it("rejects an empty name", async () => {
    const u = await registerUser(app, "9876594003", "4821", "List User 3");
    expect((await authed(app, u.token).post("/api/leads/lists").send({ name: "   " })).status).toBe(400);
  });

  it("a new lead is filed under the list that was chosen, and counts show up in the filter", async () => {
    const u = await registerUser(app, "9876594004", "4821", "List User 4");
    const api = authed(app, u.token);
    const res = await api.post("/api/leads/import").send({ contacts: [{ name: "Anil", phone: "9876594111" }], list: "Calling Data" });
    expect(res.status).toBe(201);
    expect(res.body.added).toBe(1);
    const lead = await Lead.findOne({ phone: "+919876594111" });
    expect(lead!.origin).toBe("Calling Data");

    const filtered = await api.get("/api/leads?status=all&origin=Calling%20Data");
    expect(filtered.body.leads.map((l: { name: string }) => l.name)).toEqual(["Anil"]);
    const origins = (await api.get("/api/leads/origins")).body.origins;
    expect(origins).toContainEqual({ name: "Calling Data", count: 1 });
  });

  it("with no list chosen a lead still goes to My contacts, and a typed new name creates the list", async () => {
    const u = await registerUser(app, "9876594005", "4821", "List User 5");
    const api = authed(app, u.token);
    await api.post("/api/leads/import").send({ contacts: [{ name: "Default", phone: "9876594222" }] });
    expect((await Lead.findOne({ phone: "+919876594222" }))!.origin).toBe("My contacts");

    await api.post("/api/leads/import").send({ contacts: [{ name: "Fresh", phone: "9876594333" }], list: "Walk-ins" });
    expect((await Lead.findOne({ phone: "+919876594333" }))!.origin).toBe("Walk-ins");
    expect(await LeadList.findOne({ key: "walk-ins" })).toBeTruthy();
  });

  it("a number that is already a lead is left in its current list", async () => {
    const u = await registerUser(app, "9876594006", "4821", "List User 6");
    const api = authed(app, u.token);
    await api.post("/api/leads/import").send({ contacts: [{ name: "Dup", phone: "9876594444" }], list: "Meta Sheet" });
    const again = await api.post("/api/leads/import").send({ contacts: [{ name: "Dup", phone: "9876594444" }], list: "Calling Data" });
    expect(again.body).toMatchObject({ added: 0, existing: 1 });
    expect((await Lead.findOne({ phone: "+919876594444" }))!.origin).toBe("Meta Sheet");
  });

  it("renaming a list name also renames the remembered name (and merges into an existing one)", async () => {
    const u = await registerUser(app, "9876594007", "4821", "List User 7");
    const api = authed(app, u.token);
    await api.post("/api/leads/lists").send({ name: "Old Name" });
    await api.post("/api/leads/origins/rename").send({ from: "Old Name", to: "New Name" });
    expect((await api.get("/api/leads/origins")).body.origins).toEqual([{ name: "New Name", count: 0 }]);

    await api.post("/api/leads/lists").send({ name: "Other" });
    await api.post("/api/leads/origins/rename").send({ from: "Other", to: "New Name" });
    expect((await api.get("/api/leads/origins")).body.origins).toEqual([{ name: "New Name", count: 0 }]);
  });

  it("requires sign-in", async () => {
    const request = (await import("supertest")).default;
    expect((await request(app).post("/api/leads/lists").send({ name: "x" })).status).toBe(401);
  });
});
