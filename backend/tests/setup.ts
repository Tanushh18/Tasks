import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/db";

beforeAll(async () => {
  await connectDatabase();
}, 60000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
});
