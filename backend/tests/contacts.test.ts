import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("contacts", () => {
  it("creates a contact and returns it with the owner resolved", async () => {
    const { token, userId } = await registerUser(app, "9876544001", "4821", "Alice");
    const api = authed(app, token);

    const res = await api.post("/api/contacts").send({ name: "Plumber", number: "555-0100", description: "Fixes leaks" });
    expect(res.status).toBe(201);
    expect(res.body.contact.name).toBe("Plumber");
    expect(res.body.contact.addedBy).toEqual({ id: userId, name: "Alice" });
    expect(res.body.contact.sharedWith).toEqual([]);
  });

  it("rejects a contact with an empty name", async () => {
    const { token } = await registerUser(app, "9876544002", "4821", "Alice");
    const api = authed(app, token);
    const res = await api.post("/api/contacts").send({ name: "", number: "555-0100" });
    expect(res.status).toBe(400);
  });

  it("shares a contact with another user, who can read but not edit it", async () => {
    const { token: tokenA } = await registerUser(app, "9876544003", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876544004", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);

    const created = await apiA
      .post("/api/contacts")
      .send({ name: "Electrician", number: "555-0200", sharedWith: [userIdB] });
    const contactId = created.body.contact.id;

    const listB = await apiB.get("/api/contacts");
    expect(listB.body.contacts).toHaveLength(1);
    expect(listB.body.contacts[0].id).toBe(contactId);

    const updateAttempt = await apiB.put(`/api/contacts/${contactId}`).send({ name: "Renamed" });
    expect(updateAttempt.status).toBe(403);

    const deleteAttempt = await apiB.delete(`/api/contacts/${contactId}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it("does not show a contact to a user it hasn't been shared with", async () => {
    const { token: tokenA } = await registerUser(app, "9876544005", "4821", "Alice");
    const { token: tokenC } = await registerUser(app, "9876544006", "4821", "Carol");
    const apiA = authed(app, tokenA);
    const apiC = authed(app, tokenC);

    await apiA.post("/api/contacts").send({ name: "Locksmith", number: "555-0300" });
    const listC = await apiC.get("/api/contacts");
    expect(listC.body.contacts).toHaveLength(0);
  });

  it("lets the owner update and delete their own contact", async () => {
    const { token } = await registerUser(app, "9876544007", "4821", "Alice");
    const api = authed(app, token);
    const created = await api.post("/api/contacts").send({ name: "Painter", number: "555-0400" });
    const contactId = created.body.contact.id;

    const updated = await api.put(`/api/contacts/${contactId}`).send({ name: "Painter Co" });
    expect(updated.status).toBe(200);
    expect(updated.body.contact.name).toBe("Painter Co");

    const deleted = await api.delete(`/api/contacts/${contactId}`);
    expect(deleted.status).toBe(204);

    const getRes = await api.get(`/api/contacts/${contactId}`);
    expect(getRes.status).toBe(404);
  });
});
