import { createApp } from "../src/app";
import { authed, registerUser } from "./helpers";

const app = createApp();

describe("polls", () => {
  it("creates a poll, votes, changes a vote, and reports counts", async () => {
    const alice = await registerUser(app, "9876570001", "4821", "Alice");
    const bob = await registerUser(app, "9876570002", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const created = await aliceApi.post("/api/polls").send({
      question: "Pizza or tacos for Friday?",
      options: ["Pizza", "Tacos"],
    });
    expect(created.status).toBe(201);
    expect(created.body.poll.counts).toEqual([0, 0]);
    const pollId = created.body.poll.id;

    const vote1 = await bobApi.post(`/api/polls/${pollId}/vote`).send({ optionIndex: 0 });
    expect(vote1.status).toBe(200);
    expect(vote1.body.poll.counts).toEqual([1, 0]);
    expect(vote1.body.poll.totalVotes).toBe(1);

    // Bob changes his mind — should upsert, not add a second vote.
    const vote2 = await bobApi.post(`/api/polls/${pollId}/vote`).send({ optionIndex: 1 });
    expect(vote2.status).toBe(200);
    expect(vote2.body.poll.counts).toEqual([0, 1]);
    expect(vote2.body.poll.totalVotes).toBe(1);
    expect(vote2.body.poll.myVote).toBe(1);

    const rejected = await bobApi.post(`/api/polls/${pollId}/vote`).send({ optionIndex: 5 });
    expect(rejected.status).toBe(400);
  });

  it("only lets the creator close a poll, and blocks voting once closed", async () => {
    const alice = await registerUser(app, "9876570011", "4821", "Alice");
    const bob = await registerUser(app, "9876570012", "4821", "Bob");
    const aliceApi = authed(app, alice.token);
    const bobApi = authed(app, bob.token);

    const created = await aliceApi.post("/api/polls").send({
      question: "Movie night pick?",
      options: ["A", "B", "C"],
    });
    const pollId = created.body.poll.id;

    const forbidden = await bobApi.post(`/api/polls/${pollId}/close`);
    expect(forbidden.status).toBe(403);

    const closed = await aliceApi.post(`/api/polls/${pollId}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.poll.closed).toBe(true);

    const voteAfterClose = await bobApi.post(`/api/polls/${pollId}/vote`).send({ optionIndex: 0 });
    expect(voteAfterClose.status).toBe(400);

    const activeList = await aliceApi.get("/api/polls?status=active");
    expect(activeList.body.polls.find((p: { id: string }) => p.id === pollId)).toBeUndefined();

    const closedList = await aliceApi.get("/api/polls?status=closed");
    expect(closedList.body.polls.find((p: { id: string }) => p.id === pollId)).toBeDefined();
  });

  it("rejects polls with fewer than 2 or more than 5 options", async () => {
    const alice = await registerUser(app, "9876570021", "4821", "Alice");
    const api = authed(app, alice.token);

    const tooFew = await api.post("/api/polls").send({ question: "Q?", options: ["Only one"] });
    expect(tooFew.status).toBe(400);

    const tooMany = await api.post("/api/polls").send({
      question: "Q?",
      options: ["1", "2", "3", "4", "5", "6"],
    });
    expect(tooMany.status).toBe(400);
  });

  it("blocks the feature when the polls flag is off", async () => {
    const admin = await registerUser(app, "8130483894", "4821", "Admin");
    const alice = await registerUser(app, "9876570031", "4821", "Alice");
    const adminApi = authed(app, admin.token);
    const api = authed(app, alice.token);

    const off = await adminApi.patch("/api/admin/features").send({ polls: false });
    expect(off.status).toBe(200);

    const blocked = await api.get("/api/polls");
    expect(blocked.status).toBe(403);

    const on = await adminApi.patch("/api/admin/features").send({ polls: true });
    expect(on.status).toBe(200);

    const allowed = await api.get("/api/polls");
    expect(allowed.status).toBe(200);
  });
});
