import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

async function client() {
  const { token } = await registerUser(app, "9876511111", "4821");
  return authed(app, token);
}

describe("tasks", () => {
  it("creates a task and returns it with a computed overdue flag", async () => {
    const api = await client();
    const res = await api.post("/api/tasks").send({ title: "Pay electricity bill", date: "2099-01-01", time: "20:00" });
    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe("Pay electricity bill");
    expect(res.body.task.overdue).toBe(false);
  });

  it("rejects a task with an empty title", async () => {
    const api = await client();
    const res = await api.post("/api/tasks").send({ title: "", date: "2099-01-01", time: "20:00" });
    expect(res.status).toBe(400);
  });

  it("computes a reminder notifyAt when reminder is enabled", async () => {
    const api = await client();
    const res = await api
      .post("/api/tasks")
      .send({ title: "Call mom", date: "2099-01-01", time: "09:00", reminder: { enabled: true } });
    expect(res.status).toBe(201);
    expect(res.body.task.reminder.enabled).toBe(true);
    expect(res.body.task.reminder.notifyAt).toBeTruthy();
  });

  it("marks a task complete and uncomplete", async () => {
    const api = await client();
    const created = await api.post("/api/tasks").send({ title: "Groceries", date: "2099-01-01", time: "09:00" });
    const taskId = created.body.task.id;

    const completed = await api.patch(`/api/tasks/${taskId}/complete`).send({ completed: true });
    expect(completed.body.task.completed).toBe(true);

    const uncompleted = await api.patch(`/api/tasks/${taskId}/complete`).send({ completed: false });
    expect(uncompleted.body.task.completed).toBe(false);
  });

  it("flags a past incomplete task as overdue", async () => {
    const api = await client();
    const created = await api.post("/api/tasks").send({ title: "Old task", date: "2000-01-01", time: "09:00" });
    const res = await api.get(`/api/tasks/${created.body.task.id}`);
    expect(res.body.task.overdue).toBe(true);
  });

  it("filters tasks by status", async () => {
    const api = await client();
    await api.post("/api/tasks").send({ title: "Pending one", date: "2099-01-01", time: "09:00" });
    const done = await api.post("/api/tasks").send({ title: "Done one", date: "2099-01-01", time: "09:00" });
    await api.patch(`/api/tasks/${done.body.task.id}/complete`).send({ completed: true });

    const pending = await api.get("/api/tasks").query({ status: "pending" });
    expect(pending.body.tasks.every((t: { completed: boolean }) => !t.completed)).toBe(true);

    const completed = await api.get("/api/tasks").query({ status: "completed" });
    expect(completed.body.tasks.every((t: { completed: boolean }) => t.completed)).toBe(true);
  });

  it("searches tasks by title", async () => {
    const api = await client();
    await api.post("/api/tasks").send({ title: "Pay electricity bill", date: "2099-01-01", time: "09:00" });
    await api.post("/api/tasks").send({ title: "Buy groceries", date: "2099-01-01", time: "09:00" });

    const res = await api.get("/api/tasks").query({ search: "electricity" });
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Pay electricity bill");
  });

  it("deletes a task", async () => {
    const api = await client();
    const created = await api.post("/api/tasks").send({ title: "Temp", date: "2099-01-01", time: "09:00" });
    const del = await api.delete(`/api/tasks/${created.body.task.id}`);
    expect(del.status).toBe(204);

    const getRes = await api.get(`/api/tasks/${created.body.task.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns accurate task counts", async () => {
    const api = await client();
    await api.post("/api/tasks").send({ title: "A", date: "2099-01-01", time: "09:00" });
    const b = await api.post("/api/tasks").send({ title: "B", date: "2099-01-01", time: "09:00" });
    await api.patch(`/api/tasks/${b.body.task.id}/complete`).send({ completed: true });

    const res = await api.get("/api/tasks/counts");
    expect(res.body.counts.pending).toBe(1);
    expect(res.body.counts.completed).toBe(1);
    expect(res.body.counts.total).toBe(2);
  });

  it("does not create a duplicate task when the same idempotency key is replayed", async () => {
    const api = await client();
    const payload = { title: "Offline-created task", date: "2099-01-01", time: "09:00", idempotencyKey: "client-key-1" };
    const first = await api.post("/api/tasks").send(payload);
    const second = await api.post("/api/tasks").send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.task.id).toBe(first.body.task.id);

    const list = await api.get("/api/tasks").query({ search: "Offline-created" });
    expect(list.body.tasks).toHaveLength(1);
  });

  it("isolates tasks between two different users", async () => {
    const apiA = await client();
    const { token: tokenB } = await registerUser(app, "9876522222", "4821");
    const apiB = authed(app, tokenB);

    await apiA.post("/api/tasks").send({ title: "User A task", date: "2099-01-01", time: "09:00" });
    const listB = await apiB.get("/api/tasks");
    expect(listB.body.tasks).toHaveLength(0);
  });
});
