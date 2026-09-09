import { apiClient } from "./client";

export interface EventPerson {
  id: string;
  name: string;
}

export type FamilyEventType = "birthday" | "anniversary" | "appointment" | "trip" | "dinner" | "custom";

export interface FamilyEvent {
  id: string;
  title: string;
  type: FamilyEventType;
  date: string;
  time: string | null;
  createdBy: EventPerson | null;
  attendees: EventPerson[];
  reminderEnabled: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyEventInput {
  title: string;
  type?: FamilyEventType;
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

export async function listEvents(filter: ListEventsFilter = {}): Promise<FamilyEvent[]> {
  const { data } = await apiClient.get<{ events: FamilyEvent[] }>("/family-events", { params: filter });
  return data.events;
}

export async function getEvent(eventId: string): Promise<FamilyEvent> {
  const { data } = await apiClient.get<{ event: FamilyEvent }>(`/family-events/${eventId}`);
  return data.event;
}

export async function createEvent(input: FamilyEventInput): Promise<FamilyEvent> {
  const { data } = await apiClient.post<{ event: FamilyEvent }>("/family-events", input);
  return data.event;
}

export async function updateEvent(eventId: string, input: Partial<FamilyEventInput>): Promise<FamilyEvent> {
  const { data } = await apiClient.put<{ event: FamilyEvent }>(`/family-events/${eventId}`, input);
  return data.event;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await apiClient.delete(`/family-events/${eventId}`);
}
