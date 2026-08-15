import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as taskService from "../services/taskService";

function serializeTask(task: Awaited<ReturnType<typeof taskService.getTask>>) {
  return {
    id: String(task._id),
    title: task.title,
    description: task.description,
    date: task.date,
    time: task.time,
    timezone: task.timezone,
    priority: task.priority,
    category: task.category,
    completed: task.completed,
    completedAt: task.completedAt,
    reminder: task.reminder,
    recurrence: task.recurrence,
    notes: task.notes,
    overdue: taskService.isOverdue(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.createTask(req.userId!, req.body);
  res.status(201).json({ task: serializeTask(task) });
});

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const tasks = await taskService.listTasks(req.userId!, req.query as never);
  res.json({ tasks: tasks.map(serializeTask) });
});

export const getTaskCounts = asyncHandler(async (req: Request, res: Response) => {
  const counts = await taskService.getTaskCounts(req.userId!);
  res.json({ counts });
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.getTask(req.userId!, req.params.id);
  res.json({ task: serializeTask(task) });
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.updateTask(req.userId!, req.params.id, req.body);
  res.json({ task: serializeTask(task) });
});

export const setTaskLocalNotificationId = asyncHandler(async (req: Request, res: Response) => {
  await taskService.setTaskLocalNotificationId(req.userId!, req.params.id, req.body.localNotificationId ?? null);
  res.status(204).send();
});

export const completeTask = asyncHandler(async (req: Request, res: Response) => {
  const completed = req.body.completed !== false;
  const task = await taskService.completeTask(req.userId!, req.params.id, completed);
  res.json({ task: serializeTask(task) });
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  await taskService.deleteTask(req.userId!, req.params.id);
  res.status(204).send();
});

export const getUpcomingReminders = asyncHandler(async (req: Request, res: Response) => {
  const tasks = await taskService.getUpcomingReminders(req.userId!);
  res.json({ reminders: tasks.map(serializeTask) });
});
