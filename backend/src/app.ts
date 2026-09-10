import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter } from "./middleware/rateLimiter";
import activityFeedRoutes from "./routes/activityFeedRoutes";
import adminRoutes from "./routes/adminRoutes";
import assistantRoutes from "./routes/assistantRoutes";
import authRoutes from "./routes/authRoutes";
import chatRoutes from "./routes/chatRoutes";
import contactRoutes from "./routes/contactRoutes";
import featureRoutes from "./routes/featureRoutes";
import financeRoutes from "./routes/financeRoutes";
import emergencyInfoRoutes from "./routes/emergencyInfoRoutes";
import familyEventRoutes from "./routes/familyEventRoutes";
import groupExpenseRoutes from "./routes/groupExpenseRoutes";
import inventoryItemRoutes from "./routes/inventoryItemRoutes";
import familyGoalRoutes from "./routes/familyGoalRoutes";
import locationRoutes from "./routes/locationRoutes";
import noteRoutes from "./routes/noteRoutes";
import ocrRoutes from "./routes/ocrRoutes";
import recurringPaymentRoutes from "./routes/recurringPaymentRoutes";
import pollRoutes from "./routes/pollRoutes";
import reminderRoutes from "./routes/reminderRoutes";
import searchRoutes from "./routes/searchRoutes";
import shoppingListRoutes from "./routes/shoppingListRoutes";
import taskRoutes from "./routes/taskRoutes";
import userRoutes from "./routes/userRoutes";
import vaultDocumentRoutes from "./routes/vaultDocumentRoutes";
import weeklySummaryRoutes from "./routes/weeklySummaryRoutes";

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
  app.use("/api/contacts", contactRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/ocr", ocrRoutes);
  app.use("/api/location", locationRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/features", featureRoutes);
  app.use("/api/notes", noteRoutes);
  app.use("/api/group-expenses", groupExpenseRoutes);
  app.use("/api/vault-documents", vaultDocumentRoutes);
  app.use("/api/inventory-items", inventoryItemRoutes);
  app.use("/api/emergency-info", emergencyInfoRoutes);
  app.use("/api/family-events", familyEventRoutes);
  app.use("/api/shopping-lists", shoppingListRoutes);
  app.use("/api/recurring-payments", recurringPaymentRoutes);
  app.use("/api/family-goals", familyGoalRoutes);
  app.use("/api/polls", pollRoutes);
  app.use("/api/weekly-summary", weeklySummaryRoutes);
  app.use("/api/activity-feed", activityFeedRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
