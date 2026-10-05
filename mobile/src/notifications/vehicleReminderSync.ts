import AsyncStorage from "@react-native-async-storage/async-storage";
import * as vehicleDocumentsApi from "../api/vehicleDocuments";
import type { VehicleDocument } from "../api/vehicleDocuments";
import * as vehiclesApi from "../api/vehicles";
import {
  cancelNotificationById,
  cancelVehicleDocumentReminder,
  listPendingVehicleReminders,
  scheduleVehicleDocumentReminder,
  vehicleDocumentNotificationId,
} from "./notificationService";

/**
 * Vehicles and their documents are a shared pool, so every device schedules the local expiry
 * reminder for EVERY visible document that has a reminder on and a future expiry — not only the
 * ones this user created.
 *
 * Idempotent: a document's reminder uses a deterministic notification id, and we remember which
 * expiry we already scheduled for (docId -> expiresAt) so that re-syncing does not re-fire a
 * reminder that already went off or push a pending one back.
 */
const STORE_KEY = "vehicleReminders.scheduled.v1";

const TYPE_LABELS: Record<string, string> = {
  pollution: "Pollution",
  insurance: "Insurance",
  registration: "Registration",
  service: "Service",
  warranty: "Warranty",
  other: "Other",
};

export function vehicleDocLabel(doc: Pick<VehicleDocument, "type" | "customLabel">, vehicleName?: string): string {
  const base = doc.type === "other" && doc.customLabel ? doc.customLabel : TYPE_LABELS[doc.type] ?? "Document";
  return vehicleName ? `${base} (${vehicleName})` : base;
}

type Scheduled = Record<string, string>;

async function loadScheduled(): Promise<Scheduled> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Scheduled) : {};
  } catch {
    return {};
  }
}

async function saveScheduled(map: Scheduled): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    // Best effort; worst case the next sync reschedules.
  }
}

/** The expiry a reminder should be scheduled for, or null if none should exist. */
function desiredExpiry(doc: Pick<VehicleDocument, "reminderEnabled" | "expiresAt">): string | null {
  if (!doc.reminderEnabled || !doc.expiresAt) return null;
  const t = new Date(doc.expiresAt).getTime();
  return Number.isNaN(t) || t <= Date.now() ? null : doc.expiresAt;
}

/** Reconciles reminders against a full set of visible documents. */
export async function reconcileVehicleReminders(
  docs: { doc: VehicleDocument; vehicleName?: string }[],
  options: { cancelMissing: boolean } = { cancelMissing: true }
): Promise<void> {
  const scheduled = await loadScheduled();
  const next: Scheduled = options.cancelMissing ? {} : { ...scheduled };
  const wanted = new Set<string>();
  const pending = await listPendingVehicleReminders();
  // Reminders left by older builds under random ids: reschedule them under the deterministic id.
  const legacy = new Set(
    pending.filter((p) => p.notificationId !== vehicleDocumentNotificationId(p.docId)).map((p) => p.docId)
  );

  for (const { doc, vehicleName } of docs) {
    const expiry = desiredExpiry(doc);
    if (!expiry) {
      delete next[doc.id];
      if (!options.cancelMissing) await cancelVehicleDocumentReminder(doc.id);
      continue;
    }
    wanted.add(doc.id);
    if (scheduled[doc.id] === expiry && !legacy.has(doc.id)) {
      next[doc.id] = expiry;
      continue;
    }
    try {
      await scheduleVehicleDocumentReminder({
        id: doc.id,
        label: vehicleDocLabel(doc, vehicleName),
        expiresAt: expiry,
        reminderEnabled: true,
      });
      next[doc.id] = expiry;
    } catch {
      // Leave it unrecorded so the next sync retries.
    }
  }

  if (options.cancelMissing) {
    // Cancel reminders for documents we no longer see (deleted, reminder off, expiry cleared/past)
    // and any legacy random-id duplicates of ones we just rescheduled.
    for (const { notificationId, docId } of pending) {
      if (!wanted.has(docId) || notificationId !== vehicleDocumentNotificationId(docId)) {
        await cancelNotificationById(notificationId);
      }
    }
  }
  await saveScheduled(next);
}

/** Re-syncs a single document after the user saved it (always reschedules). */
export async function applyDocumentReminder(doc: VehicleDocument, vehicleName?: string): Promise<void> {
  const scheduled = await loadScheduled();
  delete scheduled[doc.id];
  await saveScheduled(scheduled);
  await reconcileVehicleReminders([{ doc, vehicleName }], { cancelMissing: false });
}

/** Forgets and cancels the reminder for a deleted document. */
export async function removeDocumentReminder(docId: string): Promise<void> {
  await cancelVehicleDocumentReminder(docId);
  const scheduled = await loadScheduled();
  if (scheduled[docId] !== undefined) {
    delete scheduled[docId];
    await saveScheduled(scheduled);
  }
}

let inFlight: Promise<void> | null = null;

/**
 * Fetches every vehicle's documents and (re)schedules / cancels reminders to match. Safe to call
 * often (on list load, detail load, app foreground); concurrent calls share one run. If any fetch
 * fails nothing is cancelled, so a flaky network can't wipe reminders.
 */
export function syncVehicleReminders(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const vehicles = await vehiclesApi.listVehicles();
      const perVehicle = await Promise.all(
        vehicles.map(async (v) => {
          const docs = await vehicleDocumentsApi.listVehicleDocuments(v.id);
          return docs.map((doc) => ({ doc, vehicleName: v.name }));
        })
      );
      await reconcileVehicleReminders(perVehicle.flat());
    } catch {
      // Offline or API error: keep whatever is already scheduled.
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
