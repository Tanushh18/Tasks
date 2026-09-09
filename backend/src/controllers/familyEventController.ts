import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as familyEventService from "../services/familyEventService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializeEvent(event: Awaited<ReturnType<typeof familyEventService.createEvent>>) {
  const attendees = (event.attendees as unknown as PopulatedRef[]) ?? [];
  return {
    id: String(event._id),
    title: event.title,
    type: event.type,
    date: event.date,
    time: event.time,
    createdBy: serializeRef(event.createdBy as unknown as PopulatedRef),
    attendees: attendees.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    reminderEnabled: event.reminderEnabled,
    notes: event.notes,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  const { when, from, to } = req.query as { when?: "upcoming" | "past"; from?: string; to?: string };
  const events = await familyEventService.listEvents(req.userId!, { when, from, to });
  res.json({ events: events.map(serializeEvent) });
});

export const getEvent = asyncHandler(async (req: Request, res: Response) => {
  const event = await familyEventService.getEvent(req.userId!, req.params.id);
  res.json({ event: serializeEvent(event) });
});

export const createEvent = asyncHandler(async (req: Request, res: Response) => {
  const event = await familyEventService.createEvent(req.userId!, req.body);
  res.status(201).json({ event: serializeEvent(event) });
});

export const updateEvent = asyncHandler(async (req: Request, res: Response) => {
  const event = await familyEventService.updateEvent(req.userId!, req.params.id, req.body);
  res.json({ event: serializeEvent(event) });
});

export const deleteEvent = asyncHandler(async (req: Request, res: Response) => {
  await familyEventService.deleteEvent(req.userId!, req.params.id);
  res.status(204).send();
});
