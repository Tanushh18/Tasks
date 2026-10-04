import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AppState } from "react-native";

jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: (props: { name: string }) => jest.requireActual("react").createElement(Text, null, `[${props.name}]`) };
});
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@notifee/react-native", () => ({
  __esModule: true,
  default: { createChannel: jest.fn(), createTriggerNotification: jest.fn(), cancelNotification: jest.fn() },
  AndroidImportance: { HIGH: 4 },
  AndroidVisibility: { PRIVATE: 0 },
  TriggerType: { TIMESTAMP: 0 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2 },
}));
jest.mock("expo-contacts/legacy", () => ({ requestPermissionsAsync: jest.fn(), getPermissionsAsync: jest.fn() }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
jest.mock("../../features/FeatureFlagsContext", () => ({ useFeatureFlags: () => ({ flags: { leads: true } }) }));
jest.mock("../callOverlay", () => ({
  canDrawOverlays: () => false,
  onOverlayEvent: () => () => undefined,
  takeQueuedOutcomes: () => [],
}));
jest.mock("../contactAutoSync", () => ({
  LEAD_TAG: "lead",
  dismissSuggestions: jest.fn(),
  findContactSuggestions: jest.fn(async () => []),
  uploadTaggedContacts: jest.fn(),
}));

const mockSaveOutcome = jest.fn(async () => undefined);
jest.mock("../callFollowUp", () => {
  const actual = jest.requireActual("../callFollowUp");
  const call = { leadId: "l1", name: "Ramesh", phone: "+919876511111", status: "", notes: "", startedAt: 0, reminders: 0, nextAt: 0 };
  return {
    ...actual,
    getPendingCalls: jest.fn(async () => [call]),
    dueCall: (list: unknown[]) => list[0] ?? null,
    cancelNotification: jest.fn(async () => undefined),
    resolveCall: jest.fn(),
    snoozeCall: jest.fn(),
    saveCallOutcome: (...a: unknown[]) => mockSaveOutcome(...(a as [])),
  };
});

const mockMeta = jest.fn();
jest.mock("../../api/leads", () => ({
  DEFAULT_STATUS_OPTIONS: ["New", "Called — no answer", "Interested", "Site visit planned", "Follow-up", "Quotation sent", "Not interested", "Converted"],
  getLeadMeta: () => mockMeta(),
  updateLead: jest.fn(),
}));

import { CallFollowUpHost } from "../LeadPopups";

const labels = (r: TestRenderer.ReactTestRenderer): string[] => [
  ...new Set(
    r.root.findAll((n) => n.props.accessibilityState?.selected !== undefined && typeof n.props.accessibilityLabel === "string").map((n) => n.props.accessibilityLabel as string)
  ),
];

async function openPopup() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<CallFollowUpHost />);
  });
  await act(async () => {
    await new Promise((res) => setTimeout(res, 20));
  });
  return r;
}

describe("after-call popup", () => {
  beforeEach(() => {
    // The popup only appears while the app is in the foreground.
    (AppState as unknown as { currentState: string }).currentState = "active";
    jest.clearAllMocks();
    mockMeta.mockResolvedValue({ statusSuggestions: ["New", "Called — no answer", "Interested", "Site visit planned", "Follow-up", "Quotation sent", "Not interested", "Converted"], notInterestedTtlDays: 30 });
  });

  it("shows every lead stage at once, with no More… button", async () => {
    const r = await openPopup();
    expect(labels(r)).toEqual([
      "Interested",
      "Called — no answer",
      "Not interested",
      "Site visit planned",
      "Follow-up",
      "Quotation sent",
      "Converted",
    ]);
    expect(r.root.findAll((n) => n.props.label === "More…")).toHaveLength(0);
    await act(async () => r.unmount());
  });

  it("picks up stages the server has added, and falls back to the built-in list if it can't be reached", async () => {
    mockMeta.mockResolvedValue({ statusSuggestions: ["New", "Interested", "Hot lead"] });
    let r = await openPopup();
    expect(labels(r)).toEqual(["Interested", "Called — no answer", "Not interested", "Hot lead"]);
    await act(async () => r.unmount());

    mockMeta.mockRejectedValue(new Error("offline"));
    r = await openPopup();
    expect(labels(r)).toContain("Converted");
    await act(async () => r.unmount());
  });

  it("saves the chosen stage with the note", async () => {
    const r = await openPopup();
    await act(async () => r.root.findAll((n) => n.props.accessibilityLabel === "Quotation sent" && typeof n.props.onPress === "function")[0].props.onPress());
    await act(async () => r.root.findAll((n) => n.props.label === "Save" && typeof n.props.onPress === "function").at(-1)!.props.onPress());
    expect(mockSaveOutcome).toHaveBeenCalledWith(expect.objectContaining({ leadId: "l1" }), "Quotation sent", "");
    await act(async () => r.unmount());
  });
});
