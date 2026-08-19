import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/db";

beforeAll(async () => {
  await connectDatabase();

  // Second line of defence behind the NODE_ENV=test check in src/config/db.ts. `afterEach` below
  // truncates every collection, so if this suite is ever pointed at a real host it would destroy
  // live data — fail loudly instead.
  const host = mongoose.connection.host ?? "";
  const isLocal = host === "127.0.0.1" || host === "localhost" || host.startsWith("127.");
  if (!isLocal) {
    throw new Error(
      `Refusing to run tests against a non-local database (host: ${host}). Tests truncate every collection.`
    );
  }
}, 60000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
});
