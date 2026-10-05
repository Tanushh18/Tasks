import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("shared documents", () => {
  it("everyone sees every document; only the adder or an admin can delete", async () => {
    const alice = await registerUser(app, "9876590011", "4821", "Alice");
    const bob = await registerUser(app, "9876590012", "4821", "Bob");
    const a = authed(app, alice.token);
    const b = authed(app, bob.token);

    const link = await a.post("/api/shared-documents").send({ title: "Aadhaar", link: "https://drive.google.com/file/d/abc/view" });
    expect(link.status).toBe(201);
    const file = await b.post("/api/shared-documents").send({ title: "PAN", fileData: "data:application/pdf;base64,AAAA", fileName: "pan.pdf" });
    expect(file.status).toBe(201);
    expect(file.body.document.kind).toBe("file");

    expect((await a.get("/api/shared-documents")).body.documents).toHaveLength(2);
    expect((await b.delete(`/api/shared-documents/${link.body.document.id}`)).status).toBe(403);
    expect((await a.delete(`/api/shared-documents/${link.body.document.id}`)).status).toBe(204);
  });

  it("rejects bad input", async () => {
    const u = authed(app, (await registerUser(app, "9876590013", "4821", "Cy")).token);
    expect((await u.post("/api/shared-documents").send({ title: "x" })).status).toBe(400);
    expect((await u.post("/api/shared-documents").send({ title: "x", link: "javascript:alert(1)" })).status).toBe(400);
  });
});
