import { DateTime } from "luxon";
import type { FilterQuery } from "mongoose";
import { Task, type TaskDocument } from "../models/Task";
import { ApiError } from "../utils/ApiError";
import { toZonedDateTime } from "../utils/dateTime";

interface TaskInput {
  title: string;
  description?: string;
  date: string;
  time: string;
  timezone?: string;
  priority?: "low" | "medium" | "high";
  category?: string;
  reminder?: { enabled?: boolean; alarmEnabled?: boolean };
  recurrence?: {
    type?: "none" | "daily" | "weekly" | "monthly" | "custom";
    interval?: number;
    daysOfWeek?: number[];
    endDate?: string | null;
  };
  notes?: string;
  idempotencyKey?: string;
}

function buildReminder(input: TaskInput) {
  const timezone = input.timezone ?? "Asia/Kolkata";
  const zoned = toZonedDateTime(input.date, input.time, timezone);
  const enabled = input.reminder?.enabled ?? false;
  return {
    enabled,
    alarmEnabled: input.reminder?.alarmEnabled ?? false,
    notifyAt: enabled ? zoned.toJSDate() : null,
    localNotificationId: null,
  };
}

export async function createTask(userId: string, input: TaskInput): Promise<TaskDocument> {
  if (input.idempotencyKey) {
    const existing = await Task.findOne({ userId, idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
  }

  const task = await Task.create({
    userId,
    title: input.title,
    description: input.description ?? "",
    date: input.date,
    time: input.time,
    timezone: input.timezone ?? "Asia/Kolkata",
    priority: input.priority ?? "medium",
    category: input.category ?? "General",
    reminder: buildReminder(input),
    recurrence: input.recurrence ?? { type: "none" },
    notes: input.notes ?? "",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  return task;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: Partial<TaskInput>
): Promise<TaskDocument> {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) throw ApiError.notFound("Task not found");

  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined) task.description = input.description;
  if (input.date !== undefined) task.date = input.date;
  if (input.time !== undefined) task.time = input.time;
  if (input.timezone !== undefined) task.timezone = input.timezone;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.category !== undefined) task.category = input.category;
  if (input.notes !== undefined) task.notes = input.notes;
  if (input.recurrence !== undefined) {
    const current = task.recurrence;
    task.recurrence = {
      type: input.recurrence.type ?? current.type ?? "none",
      interval: input.recurrence.interval ?? current.interval ?? 1,
      daysOfWeek: input.recurrence.daysOfWeek ?? current.daysOfWeek,
      endDate: input.recurrence.endDate
        ? new Date(input.recurrence.endDate)
        : input.recurrence.endDate === null
          ? null
          : current.endDate,
    };
  }

  if (input.reminder !== undefined || input.date !== undefined || input.time !== undefined) {
    const zoned = toZonedDateTime(task.date, task.time, task.timezone);
    const enabled = input.reminder?.enabled ?? task.reminder.enabled;
    task.reminder = {
      enabled,
      alarmEnabled: input.reminder?.alarmEnabled ?? task.reminder.alarmEnabled,
      notifyAt: enabled ? zoned.toJSDate() : null,
      localNotificationId: task.reminder.localNotificationId,
    };
  }

  await task.save();
  return task;
}

export async function setTaskLocalNotificationId(
  userId: string,
  taskId: string,
  localNotificationId: string | null
): Promise<void> {
  await Task.updateOne({ _id: taskId, userId }, { "reminder.localNotificationId": localNotificationId });
}

export async function completeTask(userId: string, taskId: string, completed: boolean): Promise<TaskDocument> {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) throw ApiError.notFound("Task not found");
  task.completed = completed;
  task.completedAt = completed ? new Date() : null;
  await task.save();
  return task;
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const result = await Task.deleteOne({ _id: taskId, userId });
  if (result.deletedCount === 0) throw ApiError.notFound("Task not found");
}

export async function getTask(userId: string, taskId: string): Promise<TaskDocument> {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) throw ApiError.notFound("Task not found");
  return task;
}

interface ListFilters {
  status: "all" | "pending" | "completed" | "overdue";
  date?: string;
  from?: string;
  to?: string;
  category?: string;
  priority?: "low" | "medium" | "high";
  search?: string;
  sort: "date_asc" | "date_desc" | "priority" | "created_desc";
}

export function isOverdue(task: Pick<TaskDocument, "date" | "time" | "timezone" | "completed">): boolean {
  if (task.completed) return false;
  const zoned = DateTime.fromISO(`${task.date}T${task.time}`, { zone: task.timezone });
  return zoned.isValid && zoned.toUTC().toMillis() < Date.now();
}

export async function listTasks(userId: string, filters: ListFilters): Promise<TaskDocument[]> {
  const query: FilterQuery<TaskDocument> = { userId };

  if (filters.status === "pending") query.completed = false;
  if (filters.status === "completed") query.completed = true;
  if (filters.date) query.date = filters.date;
  if (filters.from || filters.to) {
    query.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  if (filters.category) query.category = filters.category;
  if (filters.priority) query.priority = filters.priority;
  if (filters.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: "i" } },
      { description: { $regex: filters.search, $options: "i" } },
      { notes: { $regex: filters.search, $options: "i" } },
      { category: { $regex: filters.search, $options: "i" } },
    ];
  }

  const sortMap: Record<ListFilters["sort"], Record<string, 1 | -1>> = {
    date_asc: { date: 1, time: 1 },
    date_desc: { date: -1, time: -1 },
    priority: { priority: -1, date: 1 },
    created_desc: { createdAt: -1 },
  };

  let tasks = await Task.find(query).sort(sortMap[filters.sort]);

  if (filters.status === "overdue") {
    tasks = tasks.filter((task) => isOverdue(task));
  }

  return tasks;
}

export async function getTaskCounts(userId: string) {
  const today = DateTime.now().toISODate() ?? "";
  const allPending = await Task.find({ userId, completed: false });
  const overdueCount = allPending.filter((task) => isOverdue(task)).length;
  const [completedCount, totalCount, dueTodayCount] = await Promise.all([
    Task.countDocuments({ userId, completed: true }),
    Task.countDocuments({ userId }),
    Task.countDocuments({ userId, date: today }),
  ]);

  return {
    pending: allPending.length,
    completed: completedCount,
    overdue: overdueCount,
    total: totalCount,
    dueToday: dueTodayCount,
  };
}

export async function getUpcomingReminders(userId: string, limit = 10): Promise<TaskDocument[]> {
  return Task.find({
    userId,
    completed: false,
    "reminder.enabled": true,
    "reminder.notifyAt": { $gte: new Date() },
  })
    .sort({ "reminder.notifyAt": 1 })
    .limit(limit);
}
