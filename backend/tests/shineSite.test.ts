import request from "supertest";
import { createApp } from "../src/app";
import { clearShineSiteCache } from "../src/services/shineSiteService";
import { authed, registerUser } from "./helpers";

const app = createApp();

beforeEach(() => clearShineSiteCache());

describe("shine site - project status for the website", () => {
  it("public: needs no sign-in, allows any website, and starts with the default projects", async () => {
    const res = await request(app).get("/api/public/shine/site").set("Origin", "https://www.shineoneestate.co.in");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://www.shineoneestate.co.in");
    expect(res.headers["cache-control"]).toContain("max-age=60");
    expect(res.body.updatedAt).toBeNull();
    expect(res.body.projects.map((p: { key: string }) => p.key)).toEqual(["sec 4", "sec 9", "sec 46", "sec 42", "reliance met city"]);
    const s42 = res.body.projects.find((p: { key: string }) => p.key === "sec 42");
    expect(s42).toMatchObject({ name: "Sector 42", status: "Ongoing", progress: 78, eta: "June 2026" });
  });

  it("signed-in update changes what the website shows", async () => {
    const { token } = await registerUser(app);
    const upd = await authed(app, token).put("/api/shine-media/site/sec%2042").send({ progress: 85, stage: "Interior Works", eta: "July 2026" });
    expect(upd.status).toBe(200);
    expect(upd.body.projects.find((p: { key: string }) => p.key === "sec 42")).toMatchObject({ progress: 85, stage: "Interior Works", eta: "July 2026" });

    const pub = await request(app).get("/api/public/shine/site");
    expect(pub.body.projects.find((p: { key: string }) => p.key === "sec 42")).toMatchObject({ progress: 85, stage: "Interior Works" });
    expect(pub.body.updatedAt).not.toBeNull();
    // other projects keep their values
    expect(pub.body.projects.find((p: { key: string }) => p.key === "reliance met city")).toMatchObject({ progress: 8, stage: "Foundation" });
  });

  it("marking a project completed forces 100% and clears the stage", async () => {
    const { token } = await registerUser(app);
    const res = await authed(app, token).put("/api/shine-media/site/reliance%20met%20city").send({ status: "Completed", progress: 40 });
    expect(res.status).toBe(200);
    expect(res.body.projects.find((p: { key: string }) => p.key === "reliance met city")).toMatchObject({ status: "Completed", progress: 100, stage: "" });
  });

  it("rejects bad input, unknown projects and missing sign-in", async () => {
    const { token } = await registerUser(app);
    const a = authed(app, token);
    expect((await a.put("/api/shine-media/site/sec%2042").send({ progress: 140 })).status).toBe(400);
    expect((await a.put("/api/shine-media/site/sec%2042").send({ stage: "Painting" })).status).toBe(400);
    expect((await a.put("/api/shine-media/site/sec%2042").send({ name: "Hacked" })).status).toBe(400);
    expect((await a.put("/api/shine-media/site/sec%2099").send({ progress: 10 })).status).toBe(400);
    expect((await request(app).put("/api/shine-media/site/sec%2042").send({ progress: 10 })).status).toBe(401);
  });
});
