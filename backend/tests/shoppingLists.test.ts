import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("shopping lists", () => {
  it("creates a list, adds an item, and toggles it checked", async () => {
    const alice = await registerUser(app, "9876580001", "4821", "Alice");
    const bob = await registerUser(app, "9876580002", "4821", "Bob");
    const api = authed(app, alice.token);

    const created = await api.post("/api/shopping-lists").send({
      name: "Grocery",
      sharedWithIds: [bob.userId],
    });
    expect(created.status).toBe(201);
    expect(created.body.list.sharedWith).toHaveLength(1);
    const listId = created.body.list.id;

    const withItem = await api.post(`/api/shopping-lists/${listId}/items`).send({ text: "Milk" });
    expect(withItem.status).toBe(201);
    expect(withItem.body.list.items).toHaveLength(1);
    const itemId = withItem.body.list.items[0].id;
    expect(withItem.body.list.items[0].checked).toBe(false);

    const checked = await api.put(`/api/shopping-lists/${listId}/items/${itemId}`).send({ checked: true });
    expect(checked.status).toBe(200);
    expect(checked.body.list.items[0].checked).toBe(true);
  });

  it("lets a shared user view and add items but not delete the list", async () => {
    const alice = await registerUser(app, "9876580011", "4821", "Alice");
    const bob = await registerUser(app, "9876580012", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const created = await aliceApi.post("/api/shopping-lists").send({
      name: "Home",
      sharedWithIds: [bob.userId],
    });
    const listId = created.body.list.id;

    const bobAdds = await bobApi.post(`/api/shopping-lists/${listId}/items`).send({ text: "Light bulbs" });
    expect(bobAdds.status).toBe(201);

    const bobDeletes = await bobApi.delete(`/api/shopping-lists/${listId}`);
    expect(bobDeletes.status).toBe(403);
  });

  it("removes an item from a list", async () => {
    const alice = await registerUser(app, "9876580021", "4821", "Alice");
    const api = authed(app, alice.token);

    const created = await api.post("/api/shopping-lists").send({ name: "Pharmacy" });
    const listId = created.body.list.id;

    const withItem = await api.post(`/api/shopping-lists/${listId}/items`).send({ text: "Aspirin" });
    const itemId = withItem.body.list.items[0].id;

    const removed = await api.delete(`/api/shopping-lists/${listId}/items/${itemId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.list.items).toHaveLength(0);
  });

  it("blocks the feature when the shoppingLists flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876580031", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);

    const off = await adminApi.patch("/api/admin/features").send({ shoppingLists: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/shopping-lists");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ shoppingLists: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/shopping-lists");
    expect(allowed.status).toBe(200);
  });
});
