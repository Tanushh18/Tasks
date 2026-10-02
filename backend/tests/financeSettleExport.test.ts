import { createApp } from "../src/app";
import * as mailService from "../src/services/mailService";
import { authed, registerUser } from "./helpers";

const app = createApp();

async function setup(mobileNumber: string) {
  const { token } = await registerUser(app, mobileNumber, "4821");
  const api = authed(app, token);
  const account = await api.post("/api/finance/accounts").send({ name: "Home", type: "home" });
  const accountId = account.body.account.id as string;
  const add = (type: "IN" | "OUT", amount: number, date: string) =>
    api.post("/api/finance/transactions").send({ accountId, type, amount, category: "Misc", date, time: "10:00" });
  return { api, accountId, add };
}

describe("finance settle", () => {
  it("moves settled entries out of the open list but keeps them viewable", async () => {
    const { api, accountId, add } = await setup("9871100001");
    await add("IN", 1000, "2026-01-05");
    await add("OUT", 300, "2026-01-10");
    await add("OUT", 50, "2026-02-01");

    const settle = await api.post(`/api/finance/accounts/${accountId}/settle`).send({ upTo: "2026-01-31" });
    expect(settle.status).toBe(200);
    expect(settle.body.account.settledUpTo).toBe("2026-01-31");

    const open = await api.get(`/api/finance/transactions?accountId=${accountId}&settled=exclude`);
    expect(open.body.transactions).toHaveLength(1);
    expect(open.body.transactions[0].date).toBe("2026-02-01");

    const settled = await api.get(`/api/finance/transactions?accountId=${accountId}&settled=only`);
    expect(settled.body.transactions).toHaveLength(2);

    const all = await api.get(`/api/finance/transactions?accountId=${accountId}`);
    expect(all.body.transactions).toHaveLength(3);

    const summary = await api.get("/api/finance/summary");
    const row = summary.body.summary.accounts[0];
    expect(row.balance).toBe(650);
    expect(row.settledUpTo).toBe("2026-01-31");
    expect(row.unsettledBalance).toBe(-50);
  });

  it("blocks changes inside the settled period until it is reopened", async () => {
    const { api, accountId, add } = await setup("9871100002");
    const created = await add("OUT", 100, "2026-01-05");
    await api.post(`/api/finance/accounts/${accountId}/settle`).send({ upTo: "2026-01-31" });

    expect((await add("OUT", 10, "2026-01-20")).status).toBe(400);
    const id = created.body.transaction.id;
    expect((await api.put(`/api/finance/transactions/${id}`).send({ amount: 5 })).status).toBe(400);
    expect((await api.delete(`/api/finance/transactions/${id}`)).status).toBe(400);
    expect((await add("OUT", 10, "2026-02-02")).status).toBe(201);

    await api.post(`/api/finance/accounts/${accountId}/settle`).send({ upTo: null });
    expect((await api.delete(`/api/finance/transactions/${id}`)).status).toBe(204);
  });

  it("returns nothing for settled=only when nothing is settled", async () => {
    const { api, accountId, add } = await setup("9871100003");
    await add("IN", 10, "2026-01-05");
    const res = await api.get(`/api/finance/transactions?accountId=${accountId}&settled=only`);
    expect(res.body.transactions).toEqual([]);
  });
});

describe("finance export", () => {
  it("builds an Excel file for the chosen account and period", async () => {
    const { api, accountId, add } = await setup("9871100004");
    await add("IN", 1000, "2026-01-05");
    await add("OUT", 300, "2026-03-10");

    const res = await api
      .post("/api/finance/export")
      .send({ accountIds: [accountId], from: "2026-01-01", to: "2026-01-31" });
    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(1);
    expect(res.body.cashIn).toBe(1000);
    expect(res.body.fileName).toMatch(/\.xlsx$/);
    // .xlsx files are zip archives ("PK")
    expect(Buffer.from(res.body.base64, "base64").subarray(0, 2).toString()).toBe("PK");
  });

  it("rejects another user's account", async () => {
    const a = await setup("9871100005");
    const b = await setup("9871100006");
    const res = await b.api.post("/api/finance/export").send({ accountIds: [a.accountId] });
    expect(res.status).toBe(404);
  });

  it("emails the report when mail is configured", async () => {
    const { api, accountId, add } = await setup("9871100007");
    await add("IN", 500, "2026-01-05");
    const send = jest.spyOn(mailService, "sendMail").mockResolvedValue();

    const res = await api
      .post("/api/finance/export/email")
      .send({ recipients: "family@example.com, other@example.com", accountIds: [accountId] });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0][0];
    expect(call.to).toEqual(["family@example.com", "other@example.com"]);
    expect(call.attachments?.[0].filename).toMatch(/\.xlsx$/);
    send.mockRestore();
  });

  it("rejects a bad email address and explains when mail isn't configured", async () => {
    const { api } = await setup("9871100008");
    expect((await api.post("/api/finance/export/email").send({ recipients: "not-an-email" })).status).toBe(400);
    const res = await api.post("/api/finance/export/email").send({ recipients: "family@example.com" });
    expect(res.status).toBe(503);
    expect(res.body.error?.code ?? res.body.code).toBe("MAIL_NOT_CONFIGURED");
  });
});
