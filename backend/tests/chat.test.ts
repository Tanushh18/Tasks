import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("chat", () => {
  it("sends and receives messages between two users", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser(app, "9876547001", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876547002", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);

    const send = await apiA.post(`/api/chat/messages/${userIdB}`).send({ text: "Hello Bob" });
    expect(send.status).toBe(201);
    expect(send.body.message.text).toBe("Hello Bob");
    expect(send.body.message.fromUserId).toBe(userIdA);
    expect(send.body.message.toUserId).toBe(userIdB);

    const thread = await apiB.get(`/api/chat/messages/${userIdA}`);
    expect(thread.status).toBe(200);
    expect(thread.body.messages).toHaveLength(1);
    expect(thread.body.messages[0].text).toBe("Hello Bob");
  });

  it("rejects messaging yourself and a non-existent user", async () => {
    const { token, userId } = await registerUser(app, "9876547003", "4821", "Alice");
    const api = authed(app, token);

    const self = await api.post(`/api/chat/messages/${userId}`).send({ text: "hi" });
    expect(self.status).toBe(400);

    const missing = await api.post("/api/chat/messages/111111111111111111111111").send({ text: "hi" });
    expect(missing.status).toBe(404);
  });

  it("marks messages as read when the recipient fetches the thread, and tracks unread counts in conversations", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser(app, "9876547004", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876547005", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);

    await apiA.post(`/api/chat/messages/${userIdB}`).send({ text: "one" });
    await apiA.post(`/api/chat/messages/${userIdB}`).send({ text: "two" });

    const convosBefore = await apiB.get("/api/chat/conversations");
    expect(convosBefore.body.conversations).toHaveLength(1);
    expect(convosBefore.body.conversations[0].userId).toBe(userIdA);
    expect(convosBefore.body.conversations[0].unreadCount).toBe(2);
    expect(convosBefore.body.conversations[0].lastMessage).toBe("two");

    // Fetching the thread marks incoming messages as read.
    await apiB.get(`/api/chat/messages/${userIdA}`);

    const convosAfter = await apiB.get("/api/chat/conversations");
    expect(convosAfter.body.conversations[0].unreadCount).toBe(0);
  });

  it("filters messages by the after query param", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser(app, "9876547006", "4821", "Alice");
    const { token: tokenB, userId: userIdB } = await registerUser(app, "9876547007", "4821", "Bob");
    const apiA = authed(app, tokenA);
    const apiB = authed(app, tokenB);
    void userIdA;

    const first = await apiA.post(`/api/chat/messages/${userIdB}`).send({ text: "first" });
    const cutoff = new Date(new Date(first.body.message.createdAt).getTime() + 1).toISOString();
    await apiA.post(`/api/chat/messages/${userIdB}`).send({ text: "second" });

    const filtered = await apiB.get(`/api/chat/messages/${userIdA}`).query({ after: cutoff });
    expect(filtered.body.messages).toHaveLength(1);
    expect(filtered.body.messages[0].text).toBe("second");
  });
});
