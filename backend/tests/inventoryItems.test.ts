import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";
import { FeatureFlags } from "../src/models/FeatureFlags";

const app = createApp();

describe("inventory items", () => {
  it("creates, reads, and updates an item", async () => {
    const alice = await registerUser(app, "9876580001", "4821", "Alice");
    const api = authed(app, alice.token);

    const created = await api.post("/api/inventory-items").send({
      name: "Refrigerator",
      category: "appliance",
      purchaseDate: "2024-01-15",
      price: 45000,
      serialNumber: "SN-123",
    });
    expect(created.status).toBe(201);
    const id = created.body.item.id;

    const list = await api.get("/api/inventory-items");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const updated = await api.put(`/api/inventory-items/${id}`).send({ price: 42000 });
    expect(updated.status).toBe(200);
    expect(updated.body.item.price).toBe(42000);

    const deleted = await api.delete(`/api/inventory-items/${id}`);
    expect(deleted.status).toBe(204);
  });

  it("surfaces items with warranty expiring within 30 days", async () => {
    const alice = await registerUser(app, "9876580002", "4821", "Alice");
    const api = authed(app, alice.token);

    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    const far = new Date();
    far.setDate(far.getDate() + 200);

    await api.post("/api/inventory-items").send({
      name: "Washing Machine",
      warrantyExpiresAt: soon.toISOString(),
    });
    await api.post("/api/inventory-items").send({
      name: "TV",
      warrantyExpiresAt: far.toISOString(),
    });

    const expiring = await api.get("/api/inventory-items/warranty-expiring");
    expect(expiring.status).toBe(200);
    expect(expiring.body.items).toHaveLength(1);
    expect(expiring.body.items[0].name).toBe("Washing Machine");
  });

  it("is blocked by the householdInventory feature flag", async () => {
    await FeatureFlags.findByIdAndUpdate("global", { householdInventory: false }, { upsert: true });
    const bob = await registerUser(app, "9876580003", "4821", "Bob");
    const api = authed(app, bob.token);

    const res = await api.get("/api/inventory-items");
    expect(res.status).toBe(403);

    await FeatureFlags.findByIdAndUpdate("global", { householdInventory: true }, { upsert: true });
  });
});
