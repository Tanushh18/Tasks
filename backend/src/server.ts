import { createApp } from "./app";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { seedOlfDataOnBoot } from "./services/olfSeed";
import { backfillLeadOrigins, relabelImportedLeadsToSheets, startLeadCleanupScheduler, startLeadSyncScheduler } from "./services/leadService";

async function main() {
  await connectDatabase();

  const app = createApp();
  // One-off, additive: label existing leads with the list they came from (only the new origin fields are written).
  await backfillLeadOrigins().then((n) => n && logger.info(`Labelled ${n} leads with their source list`)).catch((err) => logger.error("Lead origin backfill failed", { message: err instanceof Error ? err.message : String(err) }));
  await relabelImportedLeadsToSheets().then((n) => n && logger.info(`Relabelled ${n} imported leads with their sheet name`)).catch((err) => logger.error("Lead relabel failed", { message: err instanceof Error ? err.message : String(err) }));
  await seedOlfDataOnBoot(); // never throws
  startLeadSyncScheduler(15);
  startLeadCleanupScheduler(6);
  const server = app.listen(env.port, () => {
    logger.info(`Backend listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start server", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
