import { FamilyEvent, type FamilyEventDocument } from "../models/FamilyEvent";
import { ApiError } from "../utils/ApiError";

const EVENT_TYPES = ["birthday", "anniversary", "appointment", "trip", "dinner", "custom"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

function scopedQuery(userId: string) {
  return { $or: [{ createdBy: userId }, { attendees: userId }] };
}

async function getScopedEvent(userId: string, eventId: string): Promise<FamilyEventDocument> {
  const event = await FamilyEvent.findOne({ _id: eventId, ...scopedQuery(userId) });
  if (!event) throw ApiError.notFound("Event not found");
  return event;
}

async function getOwnedEvent(userId: string, eventId: string): Promise<FamilyEventDocument> {
  const event = await FamilyEvent.findById(eventId);
  if (!event) throw ApiError.notFound("Event not found");
  if (String(event.createdBy) !== String(userId)) {
    throw ApiError.forbidden("Only the event's creator can make this change");
  }
  return event;
}

export interface EventInput {
  title: string;
  type?: EventType;
  date: string;
  time?: string | null;
  attendeeIds?: string[];
  reminderEnabled?: boolean;
  notes?: string;
}

export interface ListEventsFilter {
  when?: "upcoming" | "past";
  from?: string;
  to?: string;
}

const POPULATE = [
  { path: "createdBy", select: "name" },
  { path: "attendees", select: "name" },
];

export async function listEvents(userId: string, filter: ListEventsFilter): Promise<FamilyEventDocument[]> {
  const query: Record<string, unknown> = { ...scopedQuery(userId) };

  const today = new Date().toISOString().slice(0, 10);
  if (filter.when === "upcoming") {
    query.date = { ...(query.date as object), $gte: filter.from ?? today };
  } else if (filter.when === "past") {
    query.date = { ...(query.date as object), $lt: filter.to ?? today };
  }
  if (filter.from) query.date = { ...(query.date as object), $gte: filter.from };
  if (filter.to) query.date = { ...(query.date as object), $lte: filter.to };

  const sortOrder = filter.when === "past" ? "-date" : "date";
  return FamilyEvent.find(query).populate(POPULATE).sort(sortOrder);
}

export async function getEvent(userId: string, eventId: string): Promise<FamilyEventDocument> {
  const event = await getScopedEvent(userId, eventId);
  return event.populate(POPULATE);
}

export async function createEvent(userId: string, input: EventInput): Promise<FamilyEventDocument> {
  const attendees = Array.from(new Set([userId, ...(input.attendeeIds ?? [])]));
  const event = await FamilyEvent.create({
    title: input.title,
    type: input.type ?? "custom",
    date: input.date,
    time: input.time ?? null,
    createdBy: userId,
    attendees,
    reminderEnabled: input.reminderEnabled ?? true,
    notes: input.notes ?? "",
  });
  return event.populate(POPULATE);
}

export async function updateEvent(
  userId: string,
  eventId: string,
  input: Partial<EventInput>
): Promise<FamilyEventDocument> {
  const event = await getOwnedEvent(userId, eventId);
  if (input.title !== undefined) event.title = input.title;
  if (input.type !== undefined) event.type = input.type;
  if (input.date !== undefined) event.date = input.date;
  if (input.time !== undefined) event.time = input.time;
  if (input.reminderEnabled !== undefined) event.reminderEnabled = input.reminderEnabled;
  if (input.notes !== undefined) event.notes = input.notes;
  if (input.attendeeIds !== undefined) {
    const attendees = Array.from(new Set([String(event.createdBy), ...input.attendeeIds]));
    event.attendees = attendees as unknown as FamilyEventDocument["attendees"];
  }
  await event.save();
  return event.populate(POPULATE);
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  await getOwnedEvent(userId, eventId);
  await FamilyEvent.deleteOne({ _id: eventId });
}
