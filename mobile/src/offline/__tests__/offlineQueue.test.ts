let mockStore: Record<string, unknown> = {};

jest.mock("../storage", () => ({
  getJson: jest.fn(async (key: string) => (key in mockStore ? mockStore[key] : null)),
  setJson: jest.fn(async (key: string, value: unknown) => {
    mockStore[key] = value;
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

// The mock objects must be built inline in the factory, not referenced from an outer `const` —
// jest.mock() calls are hoisted above other top-level statements, so a factory that just returns
// a closed-over variable would run before that variable is assigned. Importing the module
// afterwards gives back the same (now-mocked) object for configuring/asserting on in tests.
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

import * as tasksApi from "../../api/tasks";
import * as financeApi from "../../api/finance";

const mockTasksApi = tasksApi as jest.Mocked<typeof tasksApi>;
const mockFinanceApi = financeApi as jest.Mocked<typeof financeApi>;

import {
  enqueueTaskComplete,
  enqueueTaskCreate,
  enqueueTaskDelete,
  enqueueTaskUpdate,
  enqueueTransactionCreate,
  enqueueTransactionDelete,
  enqueueTransactionUpdate,
  flushQueue,
  getPendingCount,
  isNetworkFailure,
  listPending,
} from "../offlineQueue";

beforeEach(() => {
  mockStore = {};
  mockUuidCounter = 0;
  jest.clearAllMocks();
});

describe("offline queue: enqueue + dedupe", () => {
  it("queues a task create with an idempotency key", async () => {
    await enqueueTaskCreate({ title: "Pay bill", date: "2026-08-19", time: "20:00" });
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "task-create" });
    expect((pending[0] as { input: { idempotencyKey?: string } }).input.idempotencyKey).toBeTruthy();
  });

  it("collapses repeated offline edits of the same task into the latest one", async () => {
    await enqueueTaskUpdate("task-1", { title: "First edit" });
    await enqueueTaskUpdate("task-1", { title: "Second edit" });
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "task-update", taskId: "task-1", input: { title: "Second edit" } });
  });

  it("deleting a task drops any other queued action on that same task", async () => {
    await enqueueTaskUpdate("task-1", { title: "Edited" });
    await enqueueTaskComplete("task-1", true);
    await enqueueTaskDelete("task-1");
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "task-delete", taskId: "task-1" });
  });

  it("normalizes legacy queue items saved before update/delete support existed", async () => {
    mockStore["dt_offline_queue"] = [{ id: "old-1", kind: "task", input: { title: "Old" }, createdAt: "2026-01-01" }];
    expect(await getPendingCount()).toBe(1);
    const pending = await listPending();
    expect(pending[0].kind).toBe("task-create");
  });
});

describe("offline queue: flush dispatches to the right API call", () => {
  it("syncs a queued task update via tasksApi.updateTask", async () => {
    mockTasksApi.updateTask.mockResolvedValue({
      id: "task-1",
      reminder: { enabled: false, notifyAt: null, alarmEnabled: false, localNotificationId: null },
    } as never);
    await enqueueTaskUpdate("task-1", { title: "Edited offline" });

    const result = await flushQueue();

    expect(result).toEqual({ synced: 1, failed: 0, stillOffline: false });
    expect(mockTasksApi.updateTask).toHaveBeenCalledWith("task-1", { title: "Edited offline" });
    expect(await getPendingCount()).toBe(0);
  });

  it("syncs a queued transaction delete via financeApi.deleteTransaction", async () => {
    mockFinanceApi.deleteTransaction.mockResolvedValue(undefined);
    await enqueueTransactionDelete("txn-1");

    const result = await flushQueue();

    expect(result).toEqual({ synced: 1, failed: 0, stillOffline: false });
    expect(mockFinanceApi.deleteTransaction).toHaveBeenCalledWith("txn-1");
  });

  it("stops at the first genuine network failure and keeps the rest queued for later", async () => {
    mockTasksApi.deleteTask.mockRejectedValue({ isAxiosError: true, response: undefined });
    mockFinanceApi.createTransaction.mockResolvedValue({ id: "txn-2" } as never);

    await enqueueTaskDelete("task-1");
    await enqueueTransactionCreate({ accountId: "acct-1", type: "OUT", amount: 100, date: "2026-08-19", time: "10:00" });

    const result = await flushQueue();

    expect(result.stillOffline).toBe(true);
    expect(mockFinanceApi.createTransaction).not.toHaveBeenCalled();
    expect(await getPendingCount()).toBe(2);
  });

  it("treats a real server error (not a network failure) as resolved and drops it from the queue", async () => {
    mockTasksApi.deleteTask.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    await enqueueTaskDelete("task-1");

    const result = await flushQueue();

    expect(result).toEqual({ synced: 0, failed: 1, stillOffline: false });
    expect(await getPendingCount()).toBe(0);
  });
});

describe("isNetworkFailure", () => {
  it("is true only when no response reached the device", () => {
    expect(isNetworkFailure({ isAxiosError: true, response: undefined })).toBe(true);
    expect(isNetworkFailure({ isAxiosError: true, response: { status: 500 } })).toBe(false);
    expect(isNetworkFailure(new Error("not axios"))).toBe(false);
  });
});
