import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = jest.requireActual("react");
    R.useEffect(cb, []);
  },
}));
jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: (props: { name: string }) => jest.requireActual("react").createElement(Text, null, `[${props.name}]`) };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});

const mockSummary = jest.fn();
jest.mock("../../../api/leads", () => ({ getSmsSummary: () => mockSummary() }));
jest.mock("../../../api/client", () => ({ getApiErrorMessage: (e: Error) => e.message }));

import { LeadSmsScreen } from "../LeadSmsScreen";
import { SmsHistory } from "../SmsHistory";

const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((c) => typeof c.children?.[0] === "string").map((c) => c.children.join("")).join(" | ");

const summary = {
  state: "sending",
  window: "lunch",
  lastSentAt: "2026-10-10T07:30:00.000Z",
  etaDays: 4,
  sentToday: 21,
  dailyLimit: 90,
  lunch: "13:00–14:00",
  night: "21:00–23:00",
  totals: { total: 1000, sent: 300, delivered: 200, failed: 7, invalid: 3, remaining: 490 },
  sheets: [
    { sheet: "Meta Sheet", auto: true, total: 800, sent: 300, delivered: 200, failed: 7, invalid: 3, remaining: 290, etaDays: 4 },
    { sheet: "OLF Data", auto: false, total: 200, sent: 0, delivered: 0, failed: 0, invalid: 0, remaining: 200, etaDays: null },
  ],
};

describe("SMS status screen", () => {
  it("shows the consolidated numbers, the status and one card per sheet", async () => {
    mockSummary.mockResolvedValue(summary);
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadSmsScreen />);
    });
    const t = text(r);
    expect(t).toContain("Sending now");
    expect(t).toContain("500"); // sent + delivered
    expect(t).toContain("490"); // left
    expect(t).toContain("10"); // failed + bad numbers
    expect(t).toContain("500 of 1,000 leads texted (50%)");
    expect(t).toContain("about 4 days left");
    expect(t).toContain("Today: 21 sent");
    expect(t).toContain("13:00–14:00 and 21:00–23:00");
    expect(t).toContain("Meta Sheet");
    expect(t).toContain("Auto-send on");
    expect(t).toContain("OLF Data");
    expect(t).toContain("Auto-send off");
    expect(t).toContain("Sent 500 of 800");
    expect(t).toContain("Read-only");
  });

  it("explains an empty state and a server error", async () => {
    mockSummary.mockResolvedValue({ ...summary, state: "idle", totals: { ...summary.totals, total: 0 }, sheets: [] });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadSmsScreen />);
    });
    expect(text(r)).toContain("No sheet is sending SMS yet");

    mockSummary.mockRejectedValue(new Error("Server not reachable"));
    await act(async () => {
      r = TestRenderer.create(<LeadSmsScreen />);
    });
    expect(text(r)).toContain("Server not reachable");
  });
});

describe("SMS history on a lead", () => {
  const render = async (lead: React.ComponentProps<typeof SmsHistory>["lead"]) => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<SmsHistory lead={lead} />);
    });
    return text(r);
  };

  it("says when nothing was sent, and shows the status and time when it was", async () => {
    expect(await render({ smsState: "", smsHistory: [] })).toContain("No SMS sent to this lead yet.");
    expect(
      await render({ smsState: "delivered", smsSentAt: "2026-10-10T07:30:00.000Z", smsHistory: [{ at: "2026-10-10T07:30:00.000Z", sheet: "Meta Sheet", status: "sent", deviceName: "Office phone" }] })
    ).toContain("Delivered");
    const failed = await render({ smsState: "failed", smsError: "no signal", smsHistory: [] });
    expect(failed).toContain("Failed");
    expect(failed).toContain("no signal");
  });
});
