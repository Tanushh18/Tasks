import mongoose from "mongoose";
import { env, isProduction } from "./env";
import { logger } from "../utils/logger";

let memoryServer: import("mongodb-memory-server").MongoMemoryServer | undefined;

export async function connectDatabase(): Promise<void> {
  let uri = env.mongoUri;

  if (!uri) {
    if (isProduction) {
      throw new Error("MONGO_URI must be set in production");
    }
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    logger.warn(
      "MONGO_URI not set — using an in-memory MongoDB instance for local development. Data will not persist across restarts."
    );
  }

  await mongoose.connect(uri);
  logger.info(`Connected to MongoDB (${memoryServer ? "in-memory dev instance" : "configured URI"})`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
}
