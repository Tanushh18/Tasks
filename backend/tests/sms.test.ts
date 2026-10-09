import request from "supertest";
import { DateTime } from "luxon";
import { createApp } from "../src/app";
import { Lead } from "../src/models/Lead";
import { SmsDevice } from "../src/models/SmsDevice";
import { SmsSend } from "../src/models/SmsSend";
import { SmsSheet } from "../src/models/SmsSheet";
import { claimNext, currentWindow, effective, fillTemplate, getStoredSettings, reportResult, ZONE } from "../src/services/smsService";
import { Types } from "mongoose";

const app = createApp();
const DEVICE = { Authorization: "Bearer test123", "X-Device-Id": "phone-1", "X-Device-Name": "Test phone" };
const CONSOLE = { "X-Console-Key": "console-test" };
const owner = new Types.ObjectId();

/** A given IST clock time on a Monday (a day that is switched on). */
const ist = (hhmm: string, day = "2030-01-07") => DateTime.fromISO(`${day}T${hhmm}:00`, { zone: ZONE }).toJSDate();

let n = 0;
async function addLeads(sheet: string, count: number, extra: Record<string, unknown> = {}) {
  for (let i = 0; i < count; i++) {
    n += 1;
    await Lead.create({ ownerId: owner, phone: `+9198${String(10000000 + n)}`, name: `Lead ${n}`, origin: sheet, createdAt: new Date(2030, 0, 1, 0, 0, n), ...extra });
  }
}
async function switchOn(sheet = "Meta Sheet", text = "Hi {name}, thanks for your interest") {
  await SmsSheet.create({ sheet, text, auto: true });
}
/** Lets the random gap pass so the next claim is allowed. */
const skipGap = () => SmsDevice.updateMany({}, { nextAllowedAt: null });
const hello = { deviceId: "phone-1", name: "Test phone" };

describe("fillTemplate", () => {
  it("fills {name} and tidies spacing", () => {
    expect(fillTemplate("Hi {name}, thanks", "Ravi")).toBe("Hi Ravi, thanks");
    expect(fillTemplate("Hi {name}, thanks", "")).toBe("Hi, thanks");
    expect(fillTemplate("Hi {NAME}!", " Ravi ")).toBe("Hi Ravi!");
  });
});

describe("sending windows", () => {
  it("opens at lunch and at night (IST) and nowhere else", () => {
    const s = effective({ mode: "auto", paused: false } as any);
    expect(currentWindow(s, DateTime.fromJSDate(ist("13:00")).setZone(ZONE))).toBe("lunch");
    expect(currentWindow(s, DateTime.fromJSDate(ist("13:59")).setZone(ZONE))).toBe("lunch");
    expect(currentWindow(s, DateTime.fromJSDate(ist("14:00")).setZone(ZONE))).toBeNull();
    expect(currentWindow(s, DateTime.fromJSDate(ist("12:59")).setZone(ZONE))).toBeNull();
    expect(currentWindow(s, DateTime.fromJSDate(ist("21:00")).setZone(ZONE))).toBe("night");
    expect(currentWindow(s, DateTime.fromJSDate(ist("22:59")).setZone(ZONE))).toBe("night");
    expect(currentWindow(s, DateTime.fromJSDate(ist("23:00")).setZone(ZONE))).toBeNull();
    expect(currentWindow(s, DateTime.fromJSDate(ist("03:00")).setZone(ZONE))).toBeNull();
  });

  it("respects switched-off days", () => {
    const s = { ...effective({ mode: "auto", paused: false } as any), days: [0] }; // Sunday only
    expect(currentWindow(s, DateTime.fromJSDate(ist("13:30")).setZone(ZONE))).toBeNull(); // a Monday
    expect(currentWindow(s, DateTime.fromJSDate(ist("13:30", "2030-01-06")).setZone(ZONE))).toBe("lunch"); // a Sunday
  });
});

describe("auto-send engine", () => {
  it("sends nothing while the sheet is not switched on, or the sheet has no message", async () => {
    await addLeads("Meta Sheet", 3);
    expect(await claimNext(hello, ist("13:30"))).toBeNull();
    await SmsSheet.create({ sheet: "Meta Sheet", text: "", auto: true });
    expect(await claimNext(hello, ist("13:30"))).toBeNull();
  });

  it("sends nothing outside the windows", async () => {
    await addLeads("Meta Sheet", 3);
    await switchOn();
    expect(await claimNext(hello, ist("10:00"))).toBeNull();
    expect(await claimNext(hello, ist("16:00"))).toBeNull();
    expect(await claimNext(hello, ist("23:30"))).toBeNull();
  });

  it("hands out the oldest lead first, with the message filled in", async () => {
    await addLeads("Meta Sheet", 3);
    await switchOn();
    const m = await claimNext(hello, ist("13:30"));
    expect(m).toMatchObject({ phoneNumber: "+919810000001", message: "Hi Lead 1, thanks for your interest" });
    await skipGap();
    const m2 = await claimNext(hello, ist("13:31"));
    expect(m2?.message).toBe("Hi Lead 2, thanks for your interest");
  });

  it("keeps a random gap between two messages from the same phone", async () => {
    await addLeads("Meta Sheet", 3);
    await switchOn();
    expect(await claimNext(hello, ist("13:30"))).not.toBeNull();
    expect(await claimNext(hello, ist("13:30"))).toBeNull(); // same instant: too soon
    const dev = await SmsDevice.findOne({ deviceId: "phone-1" });
    const gap = dev!.nextAllowedAt!.getTime() - ist("13:30").getTime();
    expect(gap).toBeGreaterThanOrEqual(8000);
    expect(gap).toBeLessThanOrEqual(14000);
    expect(await claimNext(hello, new Date(ist("13:30").getTime() + 15000))).not.toBeNull();
  });

  it("stops at the lunch quota of 30, then carries on at night", async () => {
    await addLeads("Meta Sheet", 100);
    await switchOn();
    let lunch = 0;
    for (let i = 0; i < 40; i++) {
      await skipGap();
      if (await claimNext(hello, ist("13:30"))) lunch++;
    }
    expect(lunch).toBe(30);
    // the hour is full (30), so night must wait for the hour to pass: 21:00 is 7 hours later
    let night = 0;
    for (let i = 0; i < 80; i++) {
      await skipGap();
      if (await claimNext(hello, ist("21:30"))) night++;
    }
    // the hourly limit (30) caps the night run at 30 for that clock hour
    expect(night).toBe(30);
  });

  it("never exceeds 90 a day over lunch and night", async () => {
    await addLeads("Meta Sheet", 200);
    await switchOn();
    let total = 0;
    const slots = ["13:05", "13:35", "21:05", "21:35", "22:05", "22:35", "22:50"];
    for (const t of slots) {
      for (let i = 0; i < 40; i++) {
        await skipGap();
        if (await claimNext(hello, ist(t))) total++;
      }
    }
    expect(total).toBe(90);
  });

  it("skips Not interested, archived and invalid numbers, and finishes cleanly", async () => {
    await addLeads("Meta Sheet", 1, { status: "Not interested" });
    await addLeads("Meta Sheet", 1, { archived: true });
    await Lead.create({ ownerId: owner, phone: "12345", name: "Bad", origin: "Meta Sheet", createdAt: new Date(2030, 0, 1) });
    await addLeads("Meta Sheet", 1);
    await switchOn();
    const m = await claimNext(hello, ist("13:30"));
    expect(m?.phoneNumber).toBe("+919810000004");
    expect((await Lead.findOne({ phone: "12345" }))!.smsState).toBe("invalid");
    await skipGap();
    expect(await claimNext(hello, ist("13:31"))).toBeNull(); // nothing left
  });

  it("serves two switched-on sheets in turn", async () => {
    await addLeads("Meta Sheet", 3);
    await addLeads("OLF Data", 3);
    await switchOn("Meta Sheet");
    await switchOn("OLF Data", "Hello {name} from OLF");
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await skipGap();
      const m = await claimNext(hello, ist("13:30"));
      seen.push(m!.message.includes("OLF") ? "olf" : "meta");
    }
    expect(seen.filter((s) => s === "olf")).toHaveLength(2);
    expect(seen.filter((s) => s === "meta")).toHaveLength(2);
  });

  it("onlyNew texts just leads that arrive after the switch-on", async () => {
    await addLeads("Meta Sheet", 2);
    const res = await request(app).put("/api/sms-console/sheets").set(CONSOLE).send({ sheet: "Meta Sheet", text: "Hi {name}", auto: true, onlyNew: true });
    expect(res.status).toBe(200);
    expect(await claimNext(hello, ist("13:30"))).toBeNull();
    await Lead.create({ ownerId: owner, phone: "+919899999999", name: "Fresh", origin: "Meta Sheet", createdAt: new Date(Date.now() + 1000) });
    await skipGap();
    expect((await claimNext(hello, ist("13:31")))?.phoneNumber).toBe("+919899999999");
  });

  it("does not send for a phone that is disabled, not ready, or set to GGN Home only", async () => {
    await addLeads("Meta Sheet", 5);
    await switchOn();
    await SmsDevice.create({ deviceId: "phone-1", enabled: false });
    expect(await claimNext(hello, ist("13:30"))).toBeNull();
    await SmsDevice.updateOne({ deviceId: "phone-1" }, { enabled: true, role: "ggnhome" });
    expect(await claimNext(hello, ist("13:30"))).toBeNull();
    await SmsDevice.updateOne({ deviceId: "phone-1" }, { role: "shine" });
    expect(await claimNext(hello, ist("13:30"))).not.toBeNull();
    await skipGap();
    expect(await claimNext({ ...hello, ready: false }, ist("13:31"))).toBeNull();
  });

  it("honours Pause and a custom limit, and clamps custom values to the hard caps", async () => {
    await addLeads("Meta Sheet", 50);
    await switchOn();
    await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ paused: true });
    expect(await claimNext(hello, ist("13:30"))).toBeNull();
    await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ paused: false, mode: "custom", dailyLimit: 5, hourlyLimit: 5, lunchQuota: 5 });
    let sent = 0;
    for (let i = 0; i < 20; i++) {
      await skipGap();
      if (await claimNext(hello, ist("13:30"))) sent++;
    }
    expect(sent).toBe(5);
    await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ dailyLimit: 9999, hourlyLimit: 9999 });
    const e = effective(await getStoredSettings());
    expect(e.dailyLimit).toBe(200);
    expect(e.hourlyLimit).toBe(60);
  });

  it("lets the console change the sending times in auto mode too, and rejects impossible ones", async () => {
    expect((await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ lunchStart: "12:30", lunchEnd: "13:30", nightStart: "20:00", nightEnd: "22:00" })).status).toBe(200);
    const e = effective(await getStoredSettings());
    expect(e).toMatchObject({ mode: "auto", dailyLimit: 90, lunchStart: "12:30", nightEnd: "22:00" });
    expect(currentWindow(e, DateTime.fromJSDate(ist("12:45")).setZone(ZONE))).toBe("lunch");
    expect(currentWindow(e, DateTime.fromJSDate(ist("13:45")).setZone(ZONE))).toBeNull();
    expect(currentWindow(e, DateTime.fromJSDate(ist("20:10")).setZone(ZONE))).toBe("night");
    expect((await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ lunchStart: "15:00", lunchEnd: "14:00" })).status).toBe(400);
    expect((await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ lunchEnd: "21:30" })).status).toBe(400);
  });

  it("auto mode ignores any stored custom values", async () => {
    await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ mode: "custom", dailyLimit: 5 });
    await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ mode: "auto" });
    expect(effective(await getStoredSettings()).dailyLimit).toBe(90);
  });
});

describe("results", () => {
  it("marks a lead sent, wipes the text and does not double count", async () => {
    await addLeads("Meta Sheet", 1);
    await switchOn();
    const m = (await claimNext(hello, ist("13:30")))!;
    await reportResult(m.id, "phone-1", "sent");
    await reportResult(m.id, "phone-1", "sent");
    const lead = (await Lead.findOne({}))!;
    expect(lead.smsState).toBe("sent");
    expect(lead.smsHistory).toHaveLength(1);
    expect((await SmsSend.findById(m.id))!.message).toBe("");
    expect((await SmsDevice.findOne({ deviceId: "phone-1" }))!.sentTotal).toBe(1);
  });

  it("retries a failed lead and gives up after 3 tries", async () => {
    await addLeads("Meta Sheet", 2);
    await switchOn();
    for (let i = 1; i <= 3; i++) {
      await skipGap();
      const m = (await claimNext(hello, ist(`13:${10 + i}`)))!;
      expect(m.phoneNumber).toBe("+919810000001"); // the same lead is retried first
      await reportResult(m.id, "phone-1", "failed", "no signal");
    }
    expect((await Lead.findOne({ phone: "+919810000001" }))!.smsState).toBe("failed");
    await skipGap();
    expect((await claimNext(hello, ist("13:20")))!.phoneNumber).toBe("+919810000002"); // moved on
  });

  it("puts a lead back in the pool when its phone goes silent", async () => {
    await addLeads("Meta Sheet", 1);
    await switchOn();
    expect(await claimNext(hello, ist("13:30"))).not.toBeNull();
    await skipGap();
    expect(await claimNext(hello, ist("13:30:30".slice(0, 5)))).toBeNull(); // still being sent
    await skipGap();
    expect(await claimNext(hello, ist("13:34"))).not.toBeNull(); // claim is stale after 2 minutes
  });
});

describe("app summary (read-only)", () => {
  it("adds up sent / delivered / failed / left across sheets and says what is happening", async () => {
    const { appSummary } = await import("../src/services/smsService");
    await addLeads("Meta Sheet", 4, { smsState: "sent", smsSentAt: new Date() });
    await addLeads("Meta Sheet", 2, { smsState: "delivered", smsSentAt: new Date() });
    await addLeads("Meta Sheet", 1, { smsState: "failed" });
    await addLeads("Meta Sheet", 3);
    await addLeads("OLF Data", 5); // never switched on, never texted: not listed
    await switchOn();
    const s = await appSummary(ist("13:30"));
    expect(s.totals).toMatchObject({ total: 10, sent: 6, delivered: 2, failed: 1, remaining: 3 });
    expect(s.sheets.map((x) => x.sheet)).toEqual(["Meta Sheet"]);
    expect(s.state).toBe("sending");
    expect((await appSummary(ist("16:00"))).state).toBe("waiting");
    await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ paused: true });
    expect((await appSummary(ist("13:30"))).state).toBe("paused");
  });

  it("is idle when nothing is left to send", async () => {
    const { appSummary } = await import("../src/services/smsService");
    await addLeads("Meta Sheet", 2, { smsState: "sent", smsSentAt: new Date() });
    await switchOn();
    expect((await appSummary(ist("13:30"))).state).toBe("idle");
  });
});

describe("HTTP API", () => {
  it("rejects phones and the console without the right key", async () => {
    expect((await request(app).get("/api/sms-gateway/next").set("X-Device-Id", "x")).status).toBe(401);
    expect((await request(app).get("/api/sms-gateway/next").set({ Authorization: "Bearer nope", "X-Device-Id": "x" })).status).toBe(401);
    expect((await request(app).get("/api/sms-console/overview")).status).toBe(401);
    expect((await request(app).get("/api/sms-console/overview").set({ "X-Console-Key": "wrong" })).status).toBe(401);
  });

  it("registers the phone on its first poll and answers 204 when there is nothing to send", async () => {
    const res = await request(app).get("/api/sms-gateway/next").set(DEVICE);
    expect(res.status).toBe(204);
    const list = await request(app).get("/api/sms-console/overview").set(CONSOLE);
    expect(list.body.devices).toHaveLength(1);
    expect(list.body.devices[0]).toMatchObject({ deviceId: "phone-1", name: "Test phone", role: "both", online: true });
  });

  it("requires a device id", async () => {
    expect((await request(app).get("/api/sms-gateway/next").set({ Authorization: "Bearer test123" })).status).toBe(400);
  });

  it("lets the console assign a role and disable a phone", async () => {
    await request(app).get("/api/sms-gateway/next").set(DEVICE);
    expect((await request(app).patch("/api/sms-console/devices/phone-1").set(CONSOLE).send({ role: "ggnhome", name: "Office phone" })).status).toBe(200);
    expect((await request(app).patch("/api/sms-console/devices/phone-1").set(CONSOLE).send({ role: "weird" })).status).toBe(400);
    const d = (await request(app).get("/api/sms-console/overview").set(CONSOLE)).body.devices[0];
    expect(d).toMatchObject({ role: "ggnhome", name: "Office phone" });
    expect((await request(app).patch("/api/sms-console/devices/nope").set(CONSOLE).send({ enabled: false })).status).toBe(404);
  });

  it("won't switch a sheet on without a message, and reports progress and the estimated days", async () => {
    await addLeads("Meta Sheet", 180);
    expect((await request(app).put("/api/sms-console/sheets").set(CONSOLE).send({ sheet: "Meta Sheet", auto: true })).status).toBe(400);
    expect((await request(app).put("/api/sms-console/sheets").set(CONSOLE).send({ sheet: "Meta Sheet", text: "Hi {name}", auto: true })).status).toBe(200);
    await request(app).get("/api/sms-gateway/next").set(DEVICE); // one phone, 90 a day
    const sheet = (await request(app).get("/api/sms-console/overview").set(CONSOLE)).body.sheets[0];
    expect(sheet).toMatchObject({ sheet: "Meta Sheet", auto: true, total: 180, sent: 0, remaining: 180, etaDays: 2 });
  });

  it("sends a console test message at once, in any window, and logs it", async () => {
    const q = await request(app).post("/api/sms-console/test").set(CONSOLE).send({ phoneNumber: "9810012345", message: "ping" });
    expect(q.status).toBe(200);
    const got = await request(app).get("/api/sms-gateway/next").set(DEVICE);
    expect(got.body).toMatchObject({ phoneNumber: "+919810012345", message: "ping" });
    expect((await request(app).post(`/api/sms-gateway/${got.body.id}/result`).set(DEVICE).send({ status: "sent" })).status).toBe(200);
    const log = (await request(app).get("/api/sms-console/log").set(CONSOLE)).body.rows;
    expect(log[0]).toMatchObject({ kind: "test", status: "sent" });
    expect((await request(app).post("/api/sms-console/test").set(CONSOLE).send({ phoneNumber: "123" })).status).toBe(400);
  });

  it("validates settings input", async () => {
    expect((await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ lunchStart: "25:00" })).status).toBe(400);
    expect((await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ days: [9] })).status).toBe(400);
    expect((await request(app).put("/api/sms-console/settings").set(CONSOLE).send({ dailyLimit: -1 })).status).toBe(400);
  });
});
