import request from "supertest";
import type { Express } from "express";

export async function registerUser(app: Express, mobileNumber = "9876500001", mpin = "4821") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ mobileNumber, mpin, confirmMpin: mpin });
  return {
    token: res.body.accessToken as string | undefined,
    refreshToken: res.body.refreshToken as string | undefined,
    userId: res.body.user?.id as string | undefined,
    res,
  };
}

export function authed(app: Express, token: string | undefined) {
  if (!token) throw new Error("authed() called without a token — did registerUser() fail?");
  return {
    get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${token}`),
  };
}
