import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";
import { FeatureFlags } from "../src/models/FeatureFlags";

const app = createApp();

describe("vault documents", () => {
  it("creates, reads, and updates a document", async () => {
    const alice = await registerUser(app, "9876570001", "4821", "Alice");
    const api = authed(app, alice.token);

    const created = await api.post("/api/vault-documents").send({
      title: "Car Insurance",
      category: "insurance",
      fileData: "data:image/jpeg;base64,AAAA",
      notes: "Renews yearly",
    });
    expect(created.status).toBe(201);
    expect(created.body.document.title).toBe("Car Insurance");
    const id = created.body.document.id;

    const list = await api.get("/api/vault-documents");
    expect(list.status).toBe(200);
    expect(list.body.documents).toHaveLength(1);

    const updated = await api.put(`/api/vault-documents/${id}`).send({ notes: "Renews in March" });
    expect(updated.status).toBe(200);
    expect(updated.body.document.notes).toBe("Renews in March");

    const deleted = await api.delete(`/api/vault-documents/${id}`);
    expect(deleted.status).toBe(204);

    const empty = await api.get("/api/vault-documents");
    expect(empty.body.documents).toHaveLength(0);
  });

  it("is blocked by the documentVault feature flag", async () => {
    await FeatureFlags.findByIdAndUpdate("global", { documentVault: false }, { upsert: true });
    const bob = await registerUser(app, "9876570002", "4821", "Bob");
    const api = authed(app, bob.token);

    const res = await api.get("/api/vault-documents");
    expect(res.status).toBe(403);

    await FeatureFlags.findByIdAndUpdate("global", { documentVault: true }, { upsert: true });
  });
});
