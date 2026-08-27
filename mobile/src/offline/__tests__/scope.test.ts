let mockStore: Record<string, unknown> = {};

jest.mock("../storage", () => ({
  getJson: jest.fn(async (key: string) => (key in mockStore ? mockStore[key] : null)),
  setJson: jest.fn(async (key: string, value: unknown) => {
    mockStore[key] = value;
  }),
  removeJson: jest.fn(async (key: string) => {
    delete mockStore[key];
  }),
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => `id-${++mockUuidCounter}`),
}));

jest.mock("../../notifications/notificationService", () => ({
  scheduleTaskReminder: jest.fn().mockResolvedValue(null),
  cancelTaskReminder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../api/tasks", () => ({
  createTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  setTaskCompleted: jest.fn(),
  setTaskNotificationId: jest.fn(),
}));
jest.mock("../../api/finance", () => ({
  createTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));

import * as financeApi from "../../api/finance";
import * as tasksApi from "../../api/tasks";
import {
  discardLegacyQueue,
  enqueueTaskCreate,
  enqueueTransactionCreate,
  flushQueue,
  getPendingCount,
} from "../offlineQueue";
import { requireScopedKey, scopedKey, setStorageScope } from "../scope";

const mockTasksApi = tasksApi as jest.Mocked<typeof tasksApi>;
const mockFinanceApi = financeApi as jest.Mocked<typeof financeApi>;

const TASK_INPUT = { title: "Buy milk", date: "2026-08-20", time: "18:00" };
const TXN_INPUT = { accountId: "acc-1", type: "OUT" as const, amount: 500, date: "2026-08-20", time: "18:00" };

beforeEach(() => {
  mockStore = {};
  mockUuidCounter = 0;
  jest.clearAllMocks();
  setStorageScope(null);
});

describe("storage scope", () => {
  it("namespaces keys per user and yields nothing when signed out", () => {
    setStorageScope("user-a");
    expect(scopedKey("dt_offline_queue")).toBe("dt_offline_queue:user-a");

    setStorageScope("user-b");
    expect(scopedKey("dt_offline_queue")).toBe("dt_offline_queue:user-b");

    setStorageScope(null);
    expect(scopedKey("dt_offline_queue")).toBeNull();
  });

  it("refuses writes while signed out rather than silently dropping them", () => {
    setStorageScope(null);
    expect(() => requireScopedKey("dt_offline_queue")).toThrow(/signed out/i);
  });
});

describe("offline queue — account isolation", () => {
  it("keeps each account's queue separate", async () => {
    setStorageScope("user-a");
    await enqueueTaskCreate(TASK_INPUT);
    expect(await getPendingCount()).toBe(1);

    setStorageScope("user-b");
    expect(await getPendingCount()).toBe(0);

    setStorageScope("user-a");
    expect(await getPendingCount()).toBe(1);
  });

  it("never posts one account's queued transaction under another account's session", async () => {
    // User A queues an expense while offline, then signs out.
    setStorageScope("user-a");
    await enqueueTransactionCreate(TXN_INPUT);
    setStorageScope(null);

    // User B signs in on the same device and the queue flushes on app start.
    setStorageScope("user-b");
    mockFinanceApi.createTransaction.mockResolvedValue({} as never);
    const result = await flushQueue();

    expect(mockFinanceApi.createTransaction).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);

    // A's item is still waiting for A, not lost.
    setStorageScope("user-a");
    expect(await getPendingCount()).toBe(1);
  });

  it("does not flush at all while signed out", async () => {
    setStorageScope("user-a");
    await enqueueTaskCreate(TASK_INPUT);

    setStorageScope(null);
    const result = await flushQueue();

    expect(mockTasksApi.createTask).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0, stillOffline: false });
  });

  it("flushes the signed-in account's own queue normally", async () => {
    setStorageScope("user-a");
    await enqueueTaskCreate(TASK_INPUT);
    mockTasksApi.createTask.mockResolvedValue({ id: "t1", ...TASK_INPUT } as never);

    const result = await flushQueue();

    expect(mockTasksApi.createTask).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(1);
    expect(await getPendingCount()).toBe(0);
  });

  it("discards the pre-namespacing shared queue instead of replaying it", async () => {
    // Written by the version that used one key for everyone — owner unknowable.
    mockStore["dt_offline_queue"] = [{ id: "old-1", kind: "task-create", input: TASK_INPUT, createdAt: "2026-01-01" }];

    await discardLegacyQueue();

    setStorageScope("user-a");
    mockTasksApi.createTask.mockResolvedValue({ id: "t1" } as never);
    await flushQueue();

    expect(mockTasksApi.createTask).not.toHaveBeenCalled();
    expect(mockStore["dt_offline_queue"]).toBeUndefined();
  });
});
