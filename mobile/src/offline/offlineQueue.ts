import axios from "axios";
import * as Crypto from "expo-crypto";
import * as financeApi from "../api/finance";
import * as tasksApi from "../api/tasks";
import { cancelTaskReminder, scheduleTaskReminder } from "../notifications/notificationService";
import { getStorageScope, requireScopedKey, scopedKey } from "./scope";
import { getJson, removeJson, setJson } from "./storage";

/** Namespaced per user — see offline/scope.ts. Never read or written directly. */
const QUEUE_KEY_BASE = "dt_offline_queue";

/** The pre-namespacing key. Items left here belong to an account we can no longer identify. */
const LEGACY_QUEUE_KEY = "dt_offline_queue";

interface QueuedTaskCreate {
  id: string;
  kind: "task-create";
  input: tasksApi.TaskInput;
  createdAt: string;
}

interface QueuedTaskUpdate {
  id: string;
  kind: "task-update";
  taskId: string;
  input: Partial<tasksApi.TaskInput>;
  createdAt: string;
}

interface QueuedTaskDelete {
  id: string;
  kind: "task-delete";
  taskId: string;
  createdAt: string;
}

interface QueuedTaskComplete {
  id: string;
  kind: "task-complete";
  taskId: string;
  completed: boolean;
  createdAt: string;
}

interface QueuedTransactionCreate {
  id: string;
  kind: "transaction-create";
  input: financeApi.TransactionInput;
  createdAt: string;
}

interface QueuedTransactionUpdate {
  id: string;
  kind: "transaction-update";
  transactionId: string;
  input: Partial<financeApi.TransactionInput>;
  createdAt: string;
}

interface QueuedTransactionDelete {
  id: string;
  kind: "transaction-delete";
  transactionId: string;
  createdAt: string;
}

export type QueuedItem =
  | QueuedTaskCreate
  | QueuedTaskUpdate
  | QueuedTaskDelete
  | QueuedTaskComplete
  | QueuedTransactionCreate
  | QueuedTransactionUpdate
  | QueuedTransactionDelete;

// Note: the older `kind: "task" | "transaction"` names needed a forward-migration while the queue
// lived under one shared key. Per-user keys are new as of this version, so a scoped queue can only
// ever hold current kind names, and anything under the old shared key is discarded outright by
// `discardLegacyQueue` rather than translated.
async function getQueue(): Promise<QueuedItem[]> {
  const key = scopedKey(QUEUE_KEY_BASE);
  if (!key) return [];
  return (await getJson<QueuedItem[]>(key)) ?? [];
}

async function saveQueue(queue: QueuedItem[]): Promise<void> {
  await setJson(requireScopedKey(QUEUE_KEY_BASE), queue);
}

/**
 * Discards any queue left by the version that stored items under a single shared key.
 *
 * Those items cannot be attributed to an account: whoever signs in first after updating is
 * probably — but not certainly — the person who created them, and "probably" is not good enough
 * when the queue can contain financial records. Dropping them loses at most a few unsynced
 * entries; replaying them under the wrong account would corrupt someone else's money data.
 */
export async function discardLegacyQueue(): Promise<void> {
  await removeJson(LEGACY_QUEUE_KEY);
}

function hasTaskId(item: QueuedItem): item is QueuedTaskUpdate | QueuedTaskDelete | QueuedTaskComplete {
  return item.kind === "task-update" || item.kind === "task-delete" || item.kind === "task-complete";
}

function hasTransactionId(item: QueuedItem): item is QueuedTransactionUpdate | QueuedTransactionDelete {
  return item.kind === "transaction-update" || item.kind === "transaction-delete";
}

/** True only for a genuine network failure (no response reached the device) — the one case
 * worth retrying later. Any actual server response (2xx or 4xx/5xx) is a resolved outcome. */
export function isNetworkFailure(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

export async function enqueueTaskCreate(input: Omit<tasksApi.TaskInput, "idempotencyKey">): Promise<string> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  queue.push({ id, kind: "task-create", input: { ...input, idempotencyKey: id }, createdAt: new Date().toISOString() });
  await saveQueue(queue);
  return id;
}

export async function enqueueTaskUpdate(taskId: string, input: Partial<tasksApi.TaskInput>): Promise<void> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  // A later edit of the same task supersedes any earlier queued edit — keep just the latest.
  const filtered = queue.filter((item) => !(item.kind === "task-update" && item.taskId === taskId));
  filtered.push({ id, kind: "task-update", taskId, input, createdAt: new Date().toISOString() });
  await saveQueue(filtered);
}

export async function enqueueTaskDelete(taskId: string): Promise<void> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  // Deleting makes any other queued action on this same task pointless — drop them.
  const filtered = queue.filter((item) => !(hasTaskId(item) && item.taskId === taskId));
  filtered.push({ id, kind: "task-delete", taskId, createdAt: new Date().toISOString() });
  await saveQueue(filtered);
}

export async function enqueueTaskComplete(taskId: string, completed: boolean): Promise<void> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  const filtered = queue.filter((item) => !(item.kind === "task-complete" && item.taskId === taskId));
  filtered.push({ id, kind: "task-complete", taskId, completed, createdAt: new Date().toISOString() });
  await saveQueue(filtered);
}

export async function enqueueTransactionCreate(
  input: Omit<financeApi.TransactionInput, "idempotencyKey">
): Promise<string> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  queue.push({ id, kind: "transaction-create", input: { ...input, idempotencyKey: id }, createdAt: new Date().toISOString() });
  await saveQueue(queue);
  return id;
}

export async function enqueueTransactionUpdate(
  transactionId: string,
  input: Partial<financeApi.TransactionInput>
): Promise<void> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  const filtered = queue.filter((item) => !(item.kind === "transaction-update" && item.transactionId === transactionId));
  filtered.push({ id, kind: "transaction-update", transactionId, input, createdAt: new Date().toISOString() });
  await saveQueue(filtered);
}

export async function enqueueTransactionDelete(transactionId: string): Promise<void> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  const filtered = queue.filter((item) => !(hasTransactionId(item) && item.transactionId === transactionId));
  filtered.push({ id, kind: "transaction-delete", transactionId, createdAt: new Date().toISOString() });
  await saveQueue(filtered);
}

export async function getPendingCount(): Promise<number> {
  return (await getQueue()).length;
}

export async function listPending(): Promise<QueuedItem[]> {
  return getQueue();
}

async function syncItem(item: QueuedItem): Promise<void> {
  switch (item.kind) {
    case "task-create": {
      const task = await tasksApi.createTask(item.input);
      // The reminder couldn't be scheduled while offline (no synced task to attach it to yet) —
      // schedule it now that the task exists server-side.
      const notificationId = await scheduleTaskReminder(task);
      if (notificationId) await tasksApi.setTaskNotificationId(task.id, notificationId);
      return;
    }
    case "task-update": {
      const task = await tasksApi.updateTask(item.taskId, item.input);
      const notificationId = await scheduleTaskReminder(task);
      await tasksApi.setTaskNotificationId(task.id, notificationId);
      return;
    }
    case "task-delete":
      await tasksApi.deleteTask(item.taskId);
      return;
    case "task-complete": {
      const task = await tasksApi.setTaskCompleted(item.taskId, item.completed);
      if (item.completed) {
        await cancelTaskReminder(task.reminder.localNotificationId);
        await tasksApi.setTaskNotificationId(task.id, null);
      }
      return;
    }
    case "transaction-create":
      await financeApi.createTransaction(item.input);
      return;
    case "transaction-update":
      await financeApi.updateTransaction(item.transactionId, item.input);
      return;
    case "transaction-delete":
      await financeApi.deleteTransaction(item.transactionId);
      return;
  }
}

/** Attempts to sync every queued item in order. Stops at the first genuine network failure
 * (no point burning through the rest while still offline) but otherwise resolves every item —
 * a server response, success or error, removes that item from the queue either way. */
export async function flushQueue(): Promise<{ synced: number; failed: number; stillOffline: boolean }> {
  // Without a signed-in user there is no queue to attribute these writes to — flushing here is
  // exactly how one account's queued items used to be posted under another account's session.
  if (!getStorageScope()) return { synced: 0, failed: 0, stillOffline: false };

  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, stillOffline: false };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedItem[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await syncItem(item);
      synced++;
    } catch (err) {
      if (isNetworkFailure(err)) {
        // Still offline (or the server is unreachable) — keep this and every later item for next time.
        remaining.push(item, ...queue.slice(i + 1));
        await saveQueue(remaining);
        return { synced, failed, stillOffline: true };
      }
      failed++;
    }
  }

  await saveQueue(remaining);
  return { synced, failed, stillOffline: false };
}
