import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { authed, registerUser } from "./helpers";

const app = createApp();

let mobileCounter = 9876520000;

async function client() {
  mobileCounter += 1;
  const { token } = await registerUser(app, String(mobileCounter), "4821");
  return authed(app, token);
}

type Api = Awaited<ReturnType<typeof client>>;

async function say(api: Api, message: string) {
  const res = await api.post("/api/assistant/message").send({ message });
  expect(res.status).toBe(200);
  return res.body as {
    reply: string;
    speech: string;
    interactionId: string;
    pendingAction: { callId: string; name: string; arguments: Record<string, unknown> } | null;
  };
}

/**
 * Every test here runs with the AI key deliberately blanked. That is the point of the rule
 * engine: the commands people actually use must work with no model, no quota and no network.
 */
describe("assistant rule engine (no AI key configured)", () => {
  let realKey: string;

  beforeAll(() => {
    realKey = env.geminiApiKey;
    env.geminiApiKey = "";
  });

  afterAll(() => {
    env.geminiApiKey = realKey;
  });

  describe("tasks", () => {
    it("creates a task from a natural command", async () => {
      const api = await client();
      const result = await say(api, "remind me to call mom tomorrow at 5pm");

      expect(result.reply).toContain("Call mom");
      expect(result.pendingAction).toBeNull();

      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks).toHaveLength(1);
      expect(tasks.body.tasks[0].title).toBe("Call mom");
      expect(tasks.body.tasks[0].time).toBe("17:00");
      expect(tasks.body.tasks[0].reminder.enabled).toBe(true);
    });

    it("creates a recurring task", async () => {
      const api = await client();
      await say(api, "add task take medicine every day at 8am");

      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks[0].title).toBe("Take medicine");
      expect(tasks.body.tasks[0].time).toBe("08:00");
      expect(tasks.body.tasks[0].recurrence.type).toBe("daily");
    });

    it("asks for a title rather than creating an empty task", async () => {
      const api = await client();
      const result = await say(api, "add a task tomorrow at 5pm");

      expect(result.reply).toMatch(/call this task/i);
      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks).toHaveLength(0);
    });

    it("lists pending tasks", async () => {
      const api = await client();
      await say(api, "remind me to buy milk tomorrow at 6pm");
      await say(api, "remind me to pay rent tomorrow at 7pm");

      const result = await say(api, "what's pending?");
      expect(result.reply).toContain("Buy milk");
      expect(result.reply).toContain("Pay rent");
    });

    it("reports an empty list instead of failing", async () => {
      const api = await client();
      const result = await say(api, "show my tasks");
      expect(result.reply).toMatch(/no pending tasks/i);
    });

    it("completes a task named by a fragment of its title", async () => {
      const api = await client();
      await say(api, "remind me to buy milk from the store tomorrow at 6pm");

      const result = await say(api, "mark buy milk as done");
      expect(result.reply).toMatch(/done/i);

      const tasks = await api.get("/api/tasks?status=completed");
      expect(tasks.body.tasks).toHaveLength(1);
      expect(tasks.body.tasks[0].completed).toBe(true);
    });

    it("reopens a completed task", async () => {
      const api = await client();
      await say(api, "remind me to buy milk tomorrow at 6pm");
      await say(api, "mark buy milk as done");

      await say(api, "mark buy milk as not done");
      const tasks = await api.get("/api/tasks?status=pending");
      expect(tasks.body.tasks).toHaveLength(1);
    });

    it("deletes a task", async () => {
      const api = await client();
      await say(api, "remind me to go to the gym tomorrow at 6pm");

      const result = await say(api, "delete gym");
      expect(result.reply).toMatch(/deleted/i);

      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks).toHaveLength(0);
    });

    it("reschedules a task", async () => {
      const api = await client();
      await say(api, "remind me to standup tomorrow at 6pm");

      const result = await say(api, "move standup to 9am");
      expect(result.reply).toMatch(/9 AM/);

      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks[0].time).toBe("09:00");
    });

    it("asks which task when the reference matches more than one", async () => {
      const api = await client();
      await say(api, "remind me to call mom tomorrow at 5pm");
      await say(api, "remind me to call dad tomorrow at 6pm");

      const result = await say(api, "delete call");
      expect(result.reply).toMatch(/more than one/i);

      // Nothing may be deleted while the choice is still open.
      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks).toHaveLength(2);
    });

    it("says so when no task matches", async () => {
      const api = await client();
      await say(api, "remind me to buy milk tomorrow at 6pm");

      const result = await say(api, "mark laundry as done");
      expect(result.reply).toMatch(/couldn't find/i);
    });
  });

  describe("finance", () => {
    it("asks for an account before recording a transaction", async () => {
      const api = await client();
      const result = await say(api, "spent 500 on groceries");
      expect(result.reply).toMatch(/account/i);
      expect(result.pendingAction).toBeNull();
    });

    it("creates an account, then confirms and saves a transaction", async () => {
      const api = await client();
      const created = await say(api, "create account Home");
      expect(created.reply).toContain("Home");

      // Financial mutations are confirmed by default, so this comes back pending.
      const proposed = await say(api, "spent 500 on groceries");
      expect(proposed.pendingAction).not.toBeNull();
      expect(proposed.pendingAction!.name).toBe("createTransaction");
      expect(proposed.pendingAction!.arguments.amount).toBe(500);
      expect(proposed.pendingAction!.arguments.category).toBe("Groceries");
      expect(proposed.pendingAction!.arguments.type).toBe("OUT");

      const confirmed = await api.post("/api/assistant/confirm").send({
        interactionId: proposed.interactionId,
        callId: proposed.pendingAction!.callId,
        name: proposed.pendingAction!.name,
        arguments: proposed.pendingAction!.arguments,
        confirmed: true,
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.reply).toMatch(/500/);

      const transactions = await api.get("/api/finance/transactions");
      expect(transactions.body.transactions).toHaveLength(1);
      expect(transactions.body.transactions[0].amount).toBe(500);
    });

    it("saves nothing when the user declines", async () => {
      const api = await client();
      await say(api, "create account Home");
      const proposed = await say(api, "spent 500 on groceries");

      const declined = await api.post("/api/assistant/confirm").send({
        interactionId: proposed.interactionId,
        callId: proposed.pendingAction!.callId,
        name: proposed.pendingAction!.name,
        arguments: proposed.pendingAction!.arguments,
        confirmed: false,
      });
      expect(declined.status).toBe(200);

      const transactions = await api.get("/api/finance/transactions");
      expect(transactions.body.transactions).toHaveLength(0);
    });

    it("records income separately from spending", async () => {
      const api = await client();
      await say(api, "create account Home");
      const proposed = await say(api, "received 50000 salary");
      expect(proposed.pendingAction!.arguments.type).toBe("IN");
      expect(proposed.pendingAction!.arguments.amount).toBe(50000);
    });

    it("asks which account when several exist", async () => {
      const api = await client();
      await say(api, "create account Home");
      await say(api, "create account Office");

      const result = await say(api, "spent 500 on groceries");
      expect(result.reply).toMatch(/which account/i);
      expect(result.pendingAction).toBeNull();
    });

    it("uses the account named in the command", async () => {
      const api = await client();
      await say(api, "create account Home");
      await say(api, "create account Office");

      const result = await say(api, "spent 500 on stationery from Office");
      expect(result.pendingAction).not.toBeNull();
      expect(result.pendingAction!.arguments.category).toBe("Stationery");
    });

    it("answers a spending question without recording anything", async () => {
      const api = await client();
      await say(api, "create account Home");

      const result = await say(api, "how much did I spend this month?");
      expect(result.pendingAction).toBeNull();
      expect(result.reply).toMatch(/this month/i);

      const transactions = await api.get("/api/finance/transactions");
      expect(transactions.body.transactions).toHaveLength(0);
    });

    it("lists accounts", async () => {
      const api = await client();
      await say(api, "create account Home");
      const result = await say(api, "show my accounts");
      expect(result.reply).toContain("Home");
    });
  });

  describe("language handling", () => {
    it("handles a Hinglish task command and replies in Hinglish", async () => {
      const api = await client();
      const result = await say(api, "kal shaam 6 baje doodh lana yaad dilana");

      expect(result.reply).toMatch(/add kar diya/i);
      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks).toHaveLength(1);
      expect(tasks.body.tasks[0].time).toBe("18:00");
    });

    it("handles a Devanagari command and replies in Hindi", async () => {
      const api = await client();
      const result = await say(api, "कल शाम 6 बजे दूध लाना याद दिलाना");

      expect(result.reply).toMatch(/जोड़ दिया/);
      const tasks = await api.get("/api/tasks");
      expect(tasks.body.tasks).toHaveLength(1);
      expect(tasks.body.tasks[0].time).toBe("18:00");
    });
  });

  describe("conversational edges", () => {
    it("greets without calling the model", async () => {
      const api = await client();
      const result = await say(api, "hi");
      expect(result.reply).toMatch(/tasks/i);
    });

    it("answers a help request", async () => {
      const api = await client();
      const result = await say(api, "what can you do?");
      expect(result.reply).toMatch(/add tasks/i);
    });

    it("declines an out-of-scope question locally", async () => {
      const api = await client();
      const result = await say(api, "what's the weather tomorrow?");
      expect(result.reply).toMatch(/only help with/i);
    });

    it("still reports 503 when nothing matches and no key is configured", async () => {
      const api = await client();
      const res = await api
        .post("/api/assistant/message")
        .send({ message: "hmm about that thing we discussed earlier" });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
    });
  });
});
