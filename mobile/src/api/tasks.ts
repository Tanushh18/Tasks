import { apiClient } from "./client";
import type { Task, TaskCounts } from "../types/models";

export interface TaskInput {
  title: string;
  description?: string;
  date: string;
  time: string;
  timezone?: string;
  priority?: Task["priority"];
  category?: string;
  reminder?: { enabled: boolean; alarmEnabled?: boolean };
  recurrence?: Partial<Task["recurrence"]>;
  notes?: string;
  idempotencyKey?: string;
}

export interface TaskFilters {
  status?: "all" | "pending" | "completed" | "overdue";
  date?: string;
  from?: string;
  to?: string;
  category?: string;
  priority?: Task["priority"];
  search?: string;
  sort?: "date_asc" | "date_desc" | "priority" | "created_desc";
}

export async function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
  const { data } = await apiClient.get<{ tasks: Task[] }>("/tasks", { params: filters });
  return data.tasks;
}

export async function getTask(id: string): Promise<Task> {
  const { data } = await apiClient.get<{ task: Task }>(`/tasks/${id}`);
  return data.task;
}

export async function getTaskCounts(): Promise<TaskCounts> {
  const { data } = await apiClient.get<{ counts: TaskCounts }>("/tasks/counts");
  return data.counts;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const { data } = await apiClient.post<{ task: Task }>("/tasks", input);
  return data.task;
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Task> {
  const { data } = await apiClient.put<{ task: Task }>(`/tasks/${id}`, input);
  return data.task;
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<Task> {
  const { data } = await apiClient.patch<{ task: Task }>(`/tasks/${id}/complete`, { completed });
  return data.task;
}

export async function setTaskNotificationId(id: string, localNotificationId: string | null): Promise<void> {
  await apiClient.patch(`/tasks/${id}/notification`, { localNotificationId });
}

export async function deleteTask(id: string): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}

export async function getUpcomingReminders(): Promise<Task[]> {
  const { data } = await apiClient.get<{ reminders: Task[] }>("/reminders/upcoming");
  return data.reminders;
}
