import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { Lead } from "../src/models/Lead";
import { WhatsAppTemplate } from "../src/models/WhatsAppTemplate";
import { authed, registerUser } from "./helpers";

jest.mock("../src/services/geminiService", () => ({
  ...jest.requireActual("../src/services/geminiService"),
  generateText: jest.fn(),
}));
import { generateText } from "../src/services/geminiService";

const app = createApp();
// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("WhatsApp templates API", () => {
  it("requires sign-in", async () => {
    const request = (await import("supertest")).default;
    expect((await request(app).get("/api/leads/whatsapp-templates")).status).toBe(401);
  });

  it("creates, lists, edits and deletes a template shared by every user", async () => {
    const u1 = await registerUser(app, "9876500301", "4821", "One");
    const u2 = await registerUser(app, "9876500302", "4821", "Two");
    const a = authed(app, u1.token);
    const made = await a.post("/api/leads/whatsapp-templates").send({ name: "Hello", text: "Hi {name}, thanks!", imageUrl: PNG, sheets: ["Meta Sheet", "meta sheet", "OLF Data"] });
    expect(made.status).toBe(201);
    expect(made.body.template).toMatchObject({ name: "Hello", text: "Hi {name}, thanks!", sheets: ["Meta Sheet", "OLF Data"] });
    expect(made.body.template.imageUrl).toBe(PNG); // no Cloudinary in tests: stored inline

    const list = (await authed(app, u2.token).get("/api/leads/whatsapp-templates")).body.templates;
    expect(list).toHaveLength(1);

    const id = made.body.template.id;
    const edited = await authed(app, u2.token).patch(`/api/leads/whatsapp-templates/${id}`).send({ text: "Namaste {name}", imageUrl: null });
    expect(edited.status).toBe(200);
    expect(edited.body.template).toMatchObject({ text: "Namaste {name}", imageUrl: "", name: "Hello" });

    expect((await a.delete(`/api/leads/whatsapp-templates/${id}`)).status).toBe(204);
    expect((await a.delete(`/api/leads/whatsapp-templates/${id}`)).status).toBe(404);
    expect(await WhatsAppTemplate.countDocuments({})).toBe(0);
  });

  it("validates input", async () => {
    const u = await registerUser(app, "9876500303", "4821", "V");
    const a = authed(app, u.token);
    expect((await a.post("/api/leads/whatsapp-templates").send({ name: "", text: "x" })).status).toBe(400);
    expect((await a.post("/api/leads/whatsapp-templates").send({ name: "n", text: "" })).status).toBe(400);
    expect((await a.post("/api/leads/whatsapp-templates").send({ name: "n", text: "x", imageUrl: "data:text/html;base64,AAAA" })).status).toBe(400);
    const big = `data:image/png;base64,${"A".repeat(3_000_000)}`;
    const tooBig = await a.post("/api/leads/whatsapp-templates").send({ name: "n", text: "x", imageUrl: big });
    expect(tooBig.status).toBe(400);
    expect(JSON.stringify(tooBig.body)).toMatch(/too large/);
    expect((await a.patch("/api/leads/whatsapp-templates/nope").send({ text: "x" })).status).toBe(400);
    expect((await a.patch("/api/leads/whatsapp-templates/aaaaaaaaaaaaaaaaaaaaaaaa").send({ text: "x" })).status).toBe(404);
  });

  it("a sheet uses at most one template: attaching moves it", async () => {
    const u = await registerUser(app, "9876500304", "4821", "M");
    const a = authed(app, u.token);
    const t1 = (await a.post("/api/leads/whatsapp-templates").send({ name: "A", text: "a", sheets: ["Meta Sheet", "Calling Data"] })).body.template;
    const t2 = (await a.post("/api/leads/whatsapp-templates").send({ name: "B", text: "b", sheets: ["calling data"] })).body.template;
    let list = (await a.get("/api/leads/whatsapp-templates")).body.templates;
    expect(list.find((t: any) => t.id === t1.id).sheets).toEqual(["Meta Sheet"]);
    expect(list.find((t: any) => t.id === t2.id).sheets).toEqual(["calling data"]);

    await a.patch(`/api/leads/whatsapp-templates/${t1.id}`).send({ sheets: ["Meta Sheet", "calling data"] });
    list = (await a.get("/api/leads/whatsapp-templates")).body.templates;
    expect(list.find((t: any) => t.id === t2.id).sheets).toEqual([]);
  });

  describe("AI improver and status", () => {
    const realKey = env.geminiApiKey;
    afterEach(() => {
      env.geminiApiKey = realKey;
      (generateText as jest.Mock).mockReset();
    });

    it("503 with a clear message when no AI key is configured; status says not set up", async () => {
      env.geminiApiKey = "";
      const u = await registerUser(app, "9876500305", "4821", "AI0");
      const a = authed(app, u.token);
      const res = await a.post("/api/leads/whatsapp-templates/improve").send({ text: "hi {name} plot available" });
      expect(res.status).toBe(503);
      expect(res.body.error.message).toBe("AI is not set up on the server");
      expect((await a.get("/api/leads/whatsapp-templates/status")).body).toMatchObject({ connected: false });
    });

    it("returns the rewritten text and keeps {name}", async () => {
      env.geminiApiKey = "test-key";
      (generateText as jest.Mock).mockResolvedValueOnce('"Namaste, plot ke baare mein baat karni thi."');
      const u = await registerUser(app, "9876500306", "4821", "AI1");
      const a = authed(app, u.token);
      const res = await a.post("/api/leads/whatsapp-templates/improve").send({ text: "hi {name} plot hai" });
      expect(res.status).toBe(200);
      expect(res.body.text).toBe("Hi {name},\nNamaste, plot ke baare mein baat karni thi.");
      expect((generateText as jest.Mock).mock.calls[0][0].prompt).toContain("hi {name} plot hai");
      expect((await a.get("/api/leads/whatsapp-templates/status")).body).toMatchObject({ connected: true });
      expect((await a.post("/api/leads/whatsapp-templates/improve").send({ text: "  " })).status).toBe(400);
    });
  });
});

describe("WhatsApp sent tracking and ordering", () => {
  const mk = async (ownerId: string, n: number, extra: Record<string, unknown> = {}) =>
    Lead.create({ ownerId, phone: `+91987650${String(4000 + n)}`, name: `L${n}`, origin: "Meta Sheet", createdAt: new Date(2026, 0, n), ...extra });

  it("PATCH marks a lead sent / not sent", async () => {
    const u = await registerUser(app, "9876500401", "4821", "S");
    const a = authed(app, u.token);
    const lead = await mk(u.userId!, 1);
    const sent = await a.patch(`/api/leads/${lead._id}`).send({ whatsappSent: true });
    expect(sent.status).toBe(200);
    expect(sent.body.lead.whatsappSentAt).toBeTruthy();
    const undone = await a.patch(`/api/leads/${lead._id}`).send({ whatsappSent: false });
    expect(undone.body.lead.whatsappSentAt).toBeNull();
    expect((await a.patch(`/api/leads/${lead._id}`).send({ whatsappSent: "yes" })).status).toBe(400);
  });

  it("unsent leads come first and sent ones go last, across pages, with stage filter and search intact", async () => {
    const u = await registerUser(app, "9876500402", "4821", "O");
    const a = authed(app, u.token);
    // newest first by createdAt: L6..L1. L6 and L3 are sent.
    for (let n = 1; n <= 6; n++) await mk(u.userId!, n, n === 6 || n === 3 ? { whatsappSentAt: new Date() } : {});
    await mk(u.userId!, 7, { origin: "Calling Data" });

    const names = async (q: string) => (await a.get(`/api/leads?${q}`)).body.leads.map((l: any) => l.name);
    expect(await names("page=1&limit=100&status=all&origin=Meta%20Sheet")).toEqual(["L5", "L4", "L2", "L1", "L6", "L3"]);
    // pages straddling the unsent/sent boundary
    expect(await names("page=1&limit=3&status=all&origin=Meta%20Sheet")).toEqual(["L5", "L4", "L2"]);
    expect(await names("page=2&limit=3&status=all&origin=Meta%20Sheet")).toEqual(["L1", "L6", "L3"]);
    expect(await names("page=2&limit=2&status=all&origin=Meta%20Sheet")).toEqual(["L2", "L1"]);
    expect(await names("page=3&limit=2&status=all&origin=Meta%20Sheet")).toEqual(["L6", "L3"]);
    const p = (await a.get("/api/leads?page=1&limit=3&status=all&origin=Meta%20Sheet")).body;
    expect(p.total).toBe(6);
    expect(p.totalPages).toBe(2);

    // stage filter and search still apply
    await Lead.updateMany({ name: { $in: ["L6", "L5"] } }, { status: "Interested" });
    expect(await names("page=1&limit=10&status=Interested&origin=Meta%20Sheet")).toEqual(["L6", "L5"]);
    // a sent lead that has a stage is not pushed to the end; sent leads without one still are
    expect(await names("page=1&limit=100&status=all&origin=Meta%20Sheet")).toEqual(["L6", "L5", "L4", "L2", "L1", "L3"]);
    expect(await names("page=1&limit=10&status=all&origin=Meta%20Sheet&search=L3")).toEqual(["L3"]);

    // history: each Send is logged, un-marking removes the latest entry
    const l3 = await Lead.findOne({ name: "L3" });
    await a.patch(`/api/leads/${l3!._id}`).send({ whatsappSent: true });
    let hist = (await a.get("/api/leads?origin=Meta%20Sheet")).body.leads.find((l: any) => l.name === "L3").whatsappHistory;
    expect(hist).toHaveLength(1);
    expect(hist[0].byName).toBe("O");
    await a.patch(`/api/leads/${l3!._id}`).send({ whatsappSent: false });
    hist = (await a.get("/api/leads?origin=Meta%20Sheet")).body.leads.find((l: any) => l.name === "L3").whatsappHistory;
    expect(hist).toHaveLength(0);
    expect(await names("page=1&limit=100&status=all&origin=Meta%20Sheet")).toEqual(["L6", "L5", "L4", "L3", "L2", "L1"]);
  });
});
