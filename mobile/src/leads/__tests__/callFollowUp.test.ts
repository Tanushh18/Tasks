jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockCreateTrigger = jest.fn();
const mockCancel = jest.fn();
jest.mock("@notifee/react-native", () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => "lead-followups"),
    createTriggerNotification: (...a: unknown[]) => mockCreateTrigger(...a),
    cancelNotification: (...a: unknown[]) => mockCancel(...a),
  },
  AndroidImportance: { HIGH: 4 },
  AndroidVisibility: { PRIVATE: 0 },
  TriggerType: { TIMESTAMP: 0 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2 },
}));

const mockUpdate = jest.fn();
jest.mock("../../api/leads", () => ({ updateLead: (...a: unknown[]) => mockUpdate(...a) }));

import {
  ACTION_PREFIX,
  FIRST_DELAY_MS,
  FOLLOWUP_KIND,
  MAX_REMINDERS,
  MIN_CALL_MS,
  REMINDER_GAPS_MS,
  dueCall,
  getPendingCalls,
  handleFollowUpNotificationEvent,
  outsideQuietHours,
  registerCall,
  resolveCall,
  saveCallOutcome,
  snoozeCall,
} from "../callFollowUp";
import { onLeadEvent } from "../leadEvents";

const lead = { id: "l1", name: "Ramesh", phone: "+919876511111", status: "", notes: "Old note" };
// 11:00 local, well outside quiet hours.
const NOON = new Date(2026, 9, 3, 11, 0, 0).getTime();

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOON);
  mockUpdate.mockResolvedValue({ id: "l1" });
});
afterEach(() => jest.useRealTimers());

describe("quiet hours", () => {
  it("moves night-time reminders to 9 am", () => {
    expect(outsideQuietHours(new Date(2026, 9, 3, 22, 30).getTime())).toBe(new Date(2026, 9, 4, 9, 0).getTime());
    expect(outsideQuietHours(new Date(2026, 9, 3, 6, 0).getTime())).toBe(new Date(2026, 9, 3, 9, 0).getTime());
    expect(outsideQuietHours(NOON)).toBe(NOON);
  });
});

describe("pending calls", () => {
  it("asks only after the call has had time to happen, and schedules a backup notification", async () => {
    await registerCall(lead);
    const list = await getPendingCalls();
    expect(list).toHaveLength(1);
    expect(dueCall(list, NOON + 1000)).toBeNull();
    expect(dueCall(list, NOON + MIN_CALL_MS)).toMatchObject({ leadId: "l1" });

    expect(mockCreateTrigger).toHaveBeenCalledTimes(1);
    const [notification, trigger] = mockCreateTrigger.mock.calls[0];
    expect(trigger.timestamp).toBe(NOON + FIRST_DELAY_MS);
    expect(notification.data).toEqual({ kind: FOLLOWUP_KIND, leadId: "l1" });
    expect(notification.android.actions).toHaveLength(3);
  });

  it("closing the popup reminds later on a growing schedule, then gives up", async () => {
    await registerCall(lead);
    for (let i = 0; i < MAX_REMINDERS; i++) {
      await snoozeCall("l1");
      const [call] = await getPendingCalls();
      expect(call.reminders).toBe(i + 1);
      expect(call.nextAt).toBe(NOON + REMINDER_GAPS_MS[i]);
      expect(dueCall([call], NOON + REMINDER_GAPS_MS[i] - 1)).toBeNull();
    }
    await snoozeCall("l1");
    expect(await getPendingCalls()).toEqual([]);
  });

  it("calling the same lead again replaces the old pending call", async () => {
    await registerCall(lead);
    await snoozeCall("l1");
    await registerCall(lead);
    const list = await getPendingCalls();
    expect(list).toHaveLength(1);
    expect(list[0].reminders).toBe(0);
  });

  it("saving the outcome updates the lead, appends the note, stops reminders and tells the list", async () => {
    const changed = jest.fn();
    const off = onLeadEvent("leadsChanged", changed);
    await registerCall(lead);
    const [call] = await getPendingCalls();
    await saveCallOutcome(call, "Interested", "Wants a site visit");
    expect(mockUpdate).toHaveBeenCalledWith("l1", expect.objectContaining({ status: "Interested" }));
    const notes: string = mockUpdate.mock.calls[0][1].notes;
    expect(notes.startsWith("Old note\n")).toBe(true);
    expect(notes).toContain("Wants a site visit");
    expect(await getPendingCalls()).toEqual([]);
    expect(mockCancel).toHaveBeenCalledWith("lead-followup-l1");
    expect(changed).toHaveBeenCalled();
    off();
  });

  it("a stage button on the notification saves without opening the app", async () => {
    await registerCall(lead);
    const handled = await handleFollowUpNotificationEvent({
      type: 2,
      detail: { notification: { data: { kind: FOLLOWUP_KIND, leadId: "l1" } }, pressAction: { id: `${ACTION_PREFIX}Not interested` } },
    } as never);
    expect(handled).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith("l1", { status: "Not interested" });
    expect(await getPendingCalls()).toEqual([]);
  });

  it("an offline notification tap keeps the call pending so the app asks again", async () => {
    await registerCall(lead);
    mockUpdate.mockRejectedValueOnce(new Error("offline"));
    await handleFollowUpNotificationEvent({
      type: 2,
      detail: { notification: { data: { kind: FOLLOWUP_KIND, leadId: "l1" } }, pressAction: { id: `${ACTION_PREFIX}Interested` } },
    } as never);
    expect(await getPendingCalls()).toHaveLength(1);
  });

  it("ignores other apps' notifications", async () => {
    expect(await handleFollowUpNotificationEvent({ type: 2, detail: { notification: { data: { taskId: "t1" } } } } as never)).toBe(false);
  });

  it("resolveCall clears it", async () => {
    await registerCall(lead);
    await resolveCall("l1");
    expect(await getPendingCalls()).toEqual([]);
  });
});
