import AsyncStorage from "@react-native-async-storage/async-storage";

const mockSchedule = jest.fn();
const mockCancelDoc = jest.fn();
const mockCancelId = jest.fn();
const mockPending = jest.fn();
jest.mock("../notificationService", () => ({
  scheduleVehicleDocumentReminder: (...a: unknown[]) => mockSchedule(...a),
  cancelVehicleDocumentReminder: (...a: unknown[]) => mockCancelDoc(...a),
  cancelNotificationById: (...a: unknown[]) => mockCancelId(...a),
  listPendingVehicleReminders: (...a: unknown[]) => mockPending(...a),
  vehicleDocumentNotificationId: (id: string) => `vehicle-doc-${id}`,
}));

const mockListVehicles = jest.fn();
const mockListDocs = jest.fn();
jest.mock("../../api/vehicles", () => ({ listVehicles: (...a: unknown[]) => mockListVehicles(...a) }));
jest.mock("../../api/vehicleDocuments", () => ({ listVehicleDocuments: (...a: unknown[]) => mockListDocs(...a) }));

import { applyDocumentReminder, removeDocumentReminder, syncVehicleReminders } from "../vehicleReminderSync";

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  vehicleId: "v1",
  type: "pollution",
  customLabel: null,
  expiresAt: future,
  reminderEnabled: true,
  fileData: null,
  fileName: null,
  notes: "",
  ownerId: "someone-else",
  createdAt: "",
  updatedAt: "",
  ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockPending.mockResolvedValue([]);
  mockSchedule.mockResolvedValue("id");
  mockListVehicles.mockResolvedValue([{ id: "v1", name: "Kiger Car" }]);
});

describe("syncVehicleReminders", () => {
  it("schedules reminders for every visible document, including other users'", async () => {
    mockListDocs.mockResolvedValue([doc("a"), doc("b", { ownerId: "me" })]);
    await syncVehicleReminders();
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a", label: "Pollution (Kiger Car)", expiresAt: future })
    );
  });

  it("skips documents with the reminder off, no expiry, or an expiry in the past", async () => {
    mockListDocs.mockResolvedValue([
      doc("off", { reminderEnabled: false }),
      doc("none", { expiresAt: null }),
      doc("old", { expiresAt: past }),
    ]);
    await syncVehicleReminders();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("is idempotent: a second sync does not reschedule unchanged documents", async () => {
    mockListDocs.mockResolvedValue([doc("a")]);
    await syncVehicleReminders();
    await syncVehicleReminders();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("reschedules when the expiry changes", async () => {
    mockListDocs.mockResolvedValue([doc("a")]);
    await syncVehicleReminders();
    const later = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    mockListDocs.mockResolvedValue([doc("a", { expiresAt: later })]);
    await syncVehicleReminders();
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it("cancels pending reminders for deleted or no-longer-reminding documents", async () => {
    mockListDocs.mockResolvedValue([doc("a"), doc("b")]);
    await syncVehicleReminders();
    mockPending.mockResolvedValue([
      { notificationId: "vehicle-doc-a", docId: "a" },
      { notificationId: "vehicle-doc-b", docId: "b" },
      { notificationId: "vehicle-doc-gone", docId: "gone" },
    ]);
    mockListDocs.mockResolvedValue([doc("a"), doc("b", { reminderEnabled: false })]);
    await syncVehicleReminders();
    expect(mockCancelId).toHaveBeenCalledWith("vehicle-doc-b");
    expect(mockCancelId).toHaveBeenCalledWith("vehicle-doc-gone");
    expect(mockCancelId).not.toHaveBeenCalledWith("vehicle-doc-a");
  });

  it("migrates a legacy random-id reminder to the deterministic id", async () => {
    mockListDocs.mockResolvedValue([doc("a")]);
    await syncVehicleReminders();
    mockPending.mockResolvedValue([{ notificationId: "random-123", docId: "a" }]);
    await syncVehicleReminders();
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(mockCancelId).toHaveBeenCalledWith("random-123");
  });

  it("cancels nothing when fetching fails", async () => {
    mockListDocs.mockRejectedValue(new Error("offline"));
    await syncVehicleReminders();
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancelId).not.toHaveBeenCalled();
  });
});

describe("single-document helpers", () => {
  it("applyDocumentReminder always reschedules, and cancels when the reminder is turned off", async () => {
    await applyDocumentReminder(doc("a") as never);
    await applyDocumentReminder(doc("a") as never);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    await applyDocumentReminder(doc("a", { reminderEnabled: false }) as never);
    expect(mockCancelDoc).toHaveBeenCalledWith("a");
  });

  it("removeDocumentReminder cancels the document's reminder", async () => {
    await removeDocumentReminder("a");
    expect(mockCancelDoc).toHaveBeenCalledWith("a");
  });
});
