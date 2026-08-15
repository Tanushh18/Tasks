import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Rate limiting a fast-running automated test suite with production-tuned limits would just test
// the limiter, not the endpoints — so limiters are a no-op under NODE_ENV=test. Behavior is identical
// in dev/production.
const skipInTests = () => env.nodeEnv === "test";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please try again later." } },
  keyGenerator: (req) => `${req.ip}:${req.body?.mobileNumber ?? "unknown"}`,
});

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many registration attempts. Please try again later." } },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});
