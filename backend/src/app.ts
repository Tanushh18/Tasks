import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter } from "./middleware/rateLimiter";
import assistantRoutes from "./routes/assistantRoutes";
import authRoutes from "./routes/authRoutes";
import financeRoutes from "./routes/financeRoutes";
import reminderRoutes from "./routes/reminderRoutes";
import searchRoutes from "./routes/searchRoutes";
import taskRoutes from "./routes/taskRoutes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.nodeEnv === "production") {
    // Behind a reverse proxy/load balancer (Render, Railway, nginx, etc.) Express sees the proxy's
    // IP on every request unless told to trust the X-Forwarded-For header — without this, IP-based
    // rate limiting (login/register) effectively rate-limits nothing, since every request looks
    // like it comes from the same proxy IP.
    app.set("trust proxy", 1);
  }
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",") }));
  app.use(express.json({ limit: "1mb" }));
  if (env.nodeEnv !== "test") {
    app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  }
  app.use(apiRateLimiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/reminders", reminderRoutes);
  app.use("/api/finance", financeRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/search", searchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
