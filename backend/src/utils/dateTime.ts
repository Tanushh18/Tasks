import { DateTime } from "luxon";
import { ApiError } from "./ApiError";

/** Combines a YYYY-MM-DD date, HH:mm time, and IANA timezone into a UTC-anchored DateTime. */
export function toZonedDateTime(date: string, time: string, timezone: string): DateTime {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!dt.isValid) {
    throw ApiError.badRequest(`Invalid date/time/timezone combination: ${dt.invalidReason}`);
  }
  return dt;
}

export function isValidTimezone(timezone: string): boolean {
  return DateTime.local().setZone(timezone).isValid;
}
