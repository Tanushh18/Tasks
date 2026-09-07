jest.mock("../src/services/ocrService", () => ({
  extractContactFromImage: jest.fn(async () => ({ name: "Jane Doe", number: "555-1234" })),
  extractReceiptFromImage: jest.fn(async () => ({
    amount: 42.5,
    merchant: "Corner Store",
    date: "2026-01-01",
    category: "Groceries",
  })),
}));

import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();
const TINY_BASE64 = Buffer.from("fake-image-bytes").toString("base64");

describe("ocr", () => {
  it("requires auth", async () => {
    const res = await require("supertest")(app)
      .post("/api/ocr/scan")
      .send({ image: TINY_BASE64, target: "contact" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid target", async () => {
    const { token } = await registerUser(app, "9876548001", "4821", "Alice");
    const api = authed(app, token);
    const res = await api.post("/api/ocr/scan").send({ image: TINY_BASE64, target: "invoice" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing image", async () => {
    const { token } = await registerUser(app, "9876548002", "4821", "Alice");
    const api = authed(app, token);
    const res = await api.post("/api/ocr/scan").send({ target: "contact" });
    expect(res.status).toBe(400);
  });

  it("scans a contact image via the (mocked) OCR service", async () => {
    const { token } = await registerUser(app, "9876548003", "4821", "Alice");
    const api = authed(app, token);
    const res = await api.post("/api/ocr/scan").send({ image: TINY_BASE64, target: "contact" });
    expect(res.status).toBe(200);
    expect(res.body.contact).toEqual({ name: "Jane Doe", number: "555-1234" });
  });

  it("scans a receipt image via the (mocked) OCR service", async () => {
    const { token } = await registerUser(app, "9876548004", "4821", "Alice");
    const api = authed(app, token);
    const res = await api.post("/api/ocr/scan").send({ image: TINY_BASE64, target: "receipt" });
    expect(res.status).toBe(200);
    expect(res.body.receipt).toEqual({
      amount: 42.5,
      merchant: "Corner Store",
      date: "2026-01-01",
      category: "Groceries",
    });
  });
});
