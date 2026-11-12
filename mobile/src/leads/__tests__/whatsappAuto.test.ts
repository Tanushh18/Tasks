import { dailyTarget, decide, inWindow } from "../whatsappAutoPlan";
import { AUTO_TEMPLATES, pickAutoTemplate, renderAutoTemplate } from "../whatsappAutoTemplates";
import { normalizePhone } from "../whatsappAutoRunner";

jest.mock("../../api/leads", () => ({}));
jest.mock("../whatsappAuto", () => ({}));

describe("whatsapp auto send", () => {
  it("has 25 distinct SHINE ONE ESTATE quotes", () => {
    expect(AUTO_TEMPLATES).toHaveLength(25);
    expect(new Set(AUTO_TEMPLATES.map((t) => t.text)).size).toBe(25);
    for (const t of AUTO_TEMPLATES) expect(t.text.includes("9310994032") || t.text.includes("SHINE ONE ESTATE")).toBe(true);
  });
  it("never repeats the last template", () => {
    for (const t of AUTO_TEMPLATES) for (let i = 0; i < 20; i++) expect(pickAutoTemplate(t.id, AUTO_TEMPLATES).id).not.toBe(t.id);
  });
  it("fills the first name and tidies a missing one", () => {
    expect(renderAutoTemplate("Hi {name}, hello", "Ravi Kumar")).toBe("Hi Ravi, hello");
    expect(renderAutoTemplate("Hi {name}, hello", "")).toBe("Hi, hello");
    expect(renderAutoTemplate("A\n{name}", "Ravi")).toBe("A\nRavi");
  });
  it("targets 12 or 13 a day, fixed per date", () => {
    for (let d = 1; d <= 28; d++) {
      const k = `2026-11-${String(d).padStart(2, "0")}`;
      expect([12, 13]).toContain(dailyTarget(k));
      expect(dailyTarget(k)).toBe(dailyTarget(k));
    }
  });
  it("stops at the daily target and outside the window", () => {
    const noon = new Date(2026, 10, 4, 12, 0);
    const t = dailyTarget("2026-11-04");
    expect(decide(noon, t, null).action).toBe("wait");
    expect(decide(noon, 0, null).action).toBe("send");
    expect(decide(noon, 0, noon.getTime() + 60_000)).toMatchObject({ action: "wait", reason: "gap" });
    expect(inWindow(new Date(2026, 10, 4, 22, 0))).toBe(false);
    expect(decide(new Date(2026, 10, 4, 22, 0), 0, null)).toMatchObject({ reason: "window" });
  });
  it("normalizes phone numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("123")).toBeNull();
  });
});
