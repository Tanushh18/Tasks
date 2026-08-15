import axios from "axios";
import * as Crypto from "expo-crypto";
import * as financeApi from "../api/finance";
import * as tasksApi from "../api/tasks";
import { scheduleTaskReminder } from "../notifications/notificationService";
import { getJson, setJson } from "./storage";

const QUEUE_KEY = "dt_offline_queue";

interface QueuedTaskCreate {
  id: string;
  kind: "task";
  input: tasksApi.TaskInput;
  createdAt: string;
}

interface QueuedTransactionCreate {
  id: string;
  kind: "transaction";
  input: financeApi.TransactionInput;
  createdAt: string;
}

export type QueuedItem = QueuedTaskCreate | QueuedTransactionCreate;

async function getQueue(): Promise<QueuedItem[]> {
  return (await getJson<QueuedItem[]>(QUEUE_KEY)) ?? [];
}

async function saveQueue(queue: QueuedItem[]): Promise<void> {
  await setJson(QUEUE_KEY, queue);
}

/** True only for a genuine network failure (no response reached the device) — the one case
 * worth retrying later. Any actual server response (2xx or 4xx/5xx) is a resolved outcome. */
export function isNetworkFailure(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

export async function enqueueTaskCreate(input: Omit<tasksApi.TaskInput, "idempotencyKey">): Promise<string> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  queue.push({ id, kind: "task", input: { ...input, idempotencyKey: id }, createdAt: new Date().toISOString() });
  await saveQueue(queue);
  return id;
}

export async function enqueueTransactionCreate(
  input: Omit<financeApi.TransactionInput, "idempotencyKey">
): Promise<string> {
  const id = Crypto.randomUUID();
  const queue = await getQueue();
  queue.push({ id, kind: "transaction", input: { ...input, idempotencyKey: id }, createdAt: new Date().toISOString() });
  await saveQueue(queue);
  return id;
}

export async function getPendingCount(): Promise<number> {
  return (await getQueue()).length;
}

export async function listPending(): Promise<QueuedItem[]> {
  return getQueue();
}

/** Attempts to sync every queued item in order. Stops at the first genuine network failure
 * (no point burning through the rest while still offline) but otherwise resolves every item —
 * a server response, success or error, removes that item from the queue either way. */
export async function flushQueue(): Promise<{ synced: number; failed: number; stillOffline: boolean }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, stillOffline: false };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedItem[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      if (item.kind === "task") {
        const task = await tasksApi.createTask(item.input);
        // The reminder couldn't be scheduled while offline (no synced task to attach it to
        // yet) — schedule it now that the task exists server-side.
        const notificationId = await scheduleTaskReminder(task);
        if (notificationId) await tasksApi.setTaskNotificationId(task.id, notificationId);
      } else {
        await financeApi.createTransaction(item.input);
      }
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
