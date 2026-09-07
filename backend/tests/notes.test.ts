import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("notes", () => {
  it("creates a text note", async () => {
    const { token, userId } = await registerUser(app, "9876546001", "4821", "Alice");
    const api = authed(app, token);

    const res = await api.post("/api/notes").send({ title: "Groceries", body: "Milk, eggs" });
    expect(res.status).toBe(201);
    expect(res.body.note.title).toBe("Groceries");
    expect(res.body.note.type).toBe("text");
    expect(res.body.note.body).toBe("Milk, eggs");
    expect(res.body.note.ownerId).toEqual({ id: userId, name: "Alice" });
    expect(res.body.note.sharedWith).toEqual([]);
  });

  it("creates a checklist note", async () => {
    const { token } = await registerUser(app, "9876546002", "4821", "Alice");
    const api = authed(app, token);

    const res = await api.post("/api/notes").send({
      title: "Packing",
      type: "checklist",
      items: [{ text: "Passport" }, { text: "Charger", done: true }],
    });
    expect(res.status).toBe(201);
    expect(res.body.note.type).toBe("checklist");
    expect(res.body.note.items).toEqual([
      { text: "Passport", done: false },
      { text: "Charger", done: true },
    ]);
  });

  it("rejects a note with an invalid color", async () => {
    const { token } = await registerUser(app, "9876546003", "4821", "Alice");
    const api = authed(app, token);
    const res = await api.post("/api/notes").send({ title: "Bad", color: "neon" });
    expect(res.status).toBe(400);
  });

  it("shares a note with another user, who can read but not edit or delete it", async () => {
    const { token: tokenA } = await registerUser(app, "9876546004", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876546005", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);

    const created = await apiA.post("/api/notes").send({ title: "Shared note", sharedWith: [userIdB] });
    const noteId = created.body.note.id;

    const listB = await apiB.get("/api/notes");
    expect(listB.body.notes).toHaveLength(1);
    expect(listB.body.notes[0].id).toBe(noteId);

    const updateAttempt = await apiB.put(`/api/notes/${noteId}`).send({ title: "Renamed" });
    expect(updateAttempt.status).toBe(403);

    const deleteAttempt = await apiB.delete(`/api/notes/${noteId}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it("does not show a note to a user it hasn't been shared with", async () => {
    const { token: tokenA } = await registerUser(app, "9876546006", "4821", "Alice");
    const { token: tokenC } = await registerUser(app, "9876546007", "4821", "Carol");
    const apiA = authed(app, tokenA);
    const apiC = authed(app, tokenC);

    await apiA.post("/api/notes").send({ title: "Private note" });
    const listC = await apiC.get("/api/notes");
    expect(listC.body.notes).toHaveLength(0);
  });

  it("lets the owner update and delete their own note", async () => {
    const { token } = await registerUser(app, "9876546008", "4821", "Alice");
    const api = authed(app, token);
    const created = await api.post("/api/notes").send({ title: "Note", body: "Original" });
    const noteId = created.body.note.id;

    const updated = await api.put(`/api/notes/${noteId}`).send({ body: "Updated", pinned: true });
    expect(updated.status).toBe(200);
    expect(updated.body.note.body).toBe("Updated");
    expect(updated.body.note.pinned).toBe(true);

    const deleted = await api.delete(`/api/notes/${noteId}`);
    expect(deleted.status).toBe(204);

    const getRes = await api.get(`/api/notes/${noteId}`);
    expect(getRes.status).toBe(404);
  });
});
