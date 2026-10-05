import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError";

const DEFAULT_LIMIT_MB = 512; // MongoDB Atlas free tier (M0)
const CACHE_MS = 30_000;
const TOP_COLLECTIONS = 15;

export type StorageWarning = "ok" | "warn" | "critical";

export interface CollectionStorage {
  name: string;
  count: number;
  dataSize: number;
  storageSize: number;
  indexSize: number;
  totalSize: number;
}

export interface StorageStatus {
  dataSize: number;
  storageSize: number;
  indexSize: number;
  totalSize: number;
  objects: number;
  collections: number;
  limitBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  quotaSource: "env" | "default";
  warning: StorageWarning;
  perCollection: CollectionStorage[];
  generatedAt: string;
}

let cache: { at: number; value: StorageStatus } | null = null;

export function resetStorageCache() {
  cache = null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resolveLimit(): { limitBytes: number; quotaSource: "env" | "default" } {
  const raw = Number(process.env.MONGODB_STORAGE_LIMIT_MB);
  if (process.env.MONGODB_STORAGE_LIMIT_MB && Number.isFinite(raw) && raw > 0) {
    return { limitBytes: Math.round(raw * 1024 * 1024), quotaSource: "env" };
  }
  return { limitBytes: DEFAULT_LIMIT_MB * 1024 * 1024, quotaSource: "default" };
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const db = mongoose.connection.db;
  if (!db) throw new ApiError(503, "db_unavailable", "Database is not connected");

  const stats = await db.command({ dbStats: 1, scale: 1 });
  const dataSize = num(stats.dataSize);
  const storageSize = num(stats.storageSize);
  const indexSize = num(stats.indexSize);
  const totalSize = storageSize + indexSize;

  const list = await db.listCollections({}, { nameOnly: true }).toArray();
  const perCollection = (
    await Promise.all(
      list
        .filter((c) => !c.name.startsWith("system."))
        .map(async (c): Promise<CollectionStorage | null> => {
          try {
            const s = await db.command({ collStats: c.name, scale: 1 });
            const cStorage = num(s.storageSize);
            const cIndex = num(s.totalIndexSize);
            return {
              name: c.name,
              count: num(s.count),
              dataSize: num(s.size),
              storageSize: cStorage,
              indexSize: cIndex,
              totalSize: cStorage + cIndex,
            };
          } catch {
            return null; // tolerate per-collection failures (views, permissions, unsupported)
          }
        })
    )
  ).filter((c): c is CollectionStorage => c !== null);
  perCollection.sort((a, b) => b.totalSize - a.totalSize);

  const { limitBytes, quotaSource } = resolveLimit();
  const usedBytes = totalSize;
  const percentUsed = Math.round((usedBytes / limitBytes) * 1000) / 10;
  const warning: StorageWarning = percentUsed >= 90 ? "critical" : percentUsed >= 70 ? "warn" : "ok";

  const value: StorageStatus = {
    dataSize,
    storageSize,
    indexSize,
    totalSize,
    objects: num(stats.objects),
    collections: num(stats.collections),
    limitBytes,
    usedBytes,
    freeBytes: Math.max(0, limitBytes - usedBytes),
    percentUsed,
    quotaSource,
    warning,
    perCollection: perCollection.slice(0, TOP_COLLECTIONS),
    generatedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), value };
  return value;
}
