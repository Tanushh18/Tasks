import React from "react";
import { Switch, Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: (props: { name: string }) => jest.requireActual("react").createElement(Text, null, `[${props.name}]`) };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => jest.requireActual("react").useEffect(cb, [cb]),
}));
jest.mock("../../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", isAdmin: true } }) }));

const mockSms = { available: true, permission: true };
jest.mock("../../../expenses/smsReader", () => ({
  get smsReaderAvailable() {
    return mockSms.available;
  },
  hasSmsPermission: () => mockSms.permission,
  requestSmsPermission: jest.fn(async () => true),
  readInbox: jest.fn(async () => []),
  peekQueuedSms: jest.fn(() => []),
  removeQueuedSms: jest.fn(),
  onSmsReceived: jest.fn(() => () => undefined),
}));
jest.mock("../../../api/finance", () => ({
  getCategoryMonths: jest.fn(),
  listTransactions: jest.fn(),
  listAccounts: jest.fn(async () => []),
  createAccount: jest.fn(async (i: { name: string }) => ({ id: "acc1", name: i.name })),
  createTransactionsBulk: jest.fn(async (items: unknown[]) => items.map((_, index) => ({ index, status: "created" }))),
  parseSmsWithAi: jest.fn(),
}));

import * as finance from "../../../api/finance";
import { setUpiTrackingEnabled } from "../../../expenses/upiExpenseSync";
import { toMonthRow } from "../../../expenses/upiMonths";
import { UpiExpenseTrackerScreen } from "../UpiExpenseTrackerScreen";

const api = finance as jest.Mocked<typeof finance>;

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map((t) => [t.props.children].flat(Infinity).join("")).join("\n");

async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<UpiExpenseTrackerScreen />);
  });
  return r;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSms.available = true;
  mockSms.permission = true;
  api.getCategoryMonths.mockResolvedValue([]);
  api.listTransactions.mockResolvedValue([]);
  api.createTransactionsBulk.mockClear();
});

describe("UpiExpenseTrackerScreen", () => {
  it("shows the admin badge, Off state and the sender note", async () => {
    const out = texts(await render());
    expect(out).toContain("ADMIN");
    expect(out).toContain("Off");
    expect(out).toContain("Reading only Federal Bank messages (FEDBNK / FedMobile)");
  });

  it("says 'install the latest APK' and disables the switch when the native module is missing", async () => {
    mockSms.available = false;
    const r = await render();
    expect(texts(r)).toContain("Install the latest APK to use this");
    expect(r.root.findByType(Switch).props.disabled).toBe(true);
    // The paste/test box still works without the native module.
    expect(texts(r)).toContain("Test a message");
  });

  it("shows On — watching when enabled with permission", async () => {
    await setUpiTrackingEnabled(true, "u1");
    expect(texts(await render())).toContain("On — watching");
  });

  it("asks for SMS permission when enabled without it", async () => {
    await setUpiTrackingEnabled(true, "u1");
    mockSms.permission = false;
    const out = texts(await render());
    expect(out).toContain("Needs SMS permission");
    expect(out).toContain("Allow SMS access");
  });

  it("lists months with totals and expands to the month's transactions", async () => {
    api.getCategoryMonths.mockResolvedValue([
      { month: "2026-09", cashIn: 0, cashOut: 182, count: 1 },
      { month: "2026-10", cashIn: 50, cashOut: 700, count: 3 },
    ]);
    api.listTransactions.mockResolvedValue([
      { id: "t1", accountId: "a", type: "OUT", amount: 200, category: "UPI", description: "UPI to Facebook Ind", date: "2026-10-04", time: "13:35", notes: "", createdAt: "", updatedAt: "" },
    ]);
    const r = await render();
    const out = texts(r);
    expect(out.indexOf("October 2026")).toBeLessThan(out.indexOf("September 2026"));
    expect(out).toContain("Out ₹700 · In ₹50 · Net -₹650 · 3 entries");
    const row = r.root.findByProps({ accessibilityLabel: "October 2026" });
    await act(async () => {
      row.props.onPress();
    });
    expect(api.listTransactions).toHaveBeenCalledWith({ category: "UPI", from: "2026-10-01", to: "2026-10-31", limit: 200 });
    expect(texts(r)).toContain("UPI to Facebook Ind");
  });

  it("parses a pasted message and saves it without any SMS text", async () => {
    const r = await render();
    const sms = "Debited Rs 200.00 from a/c X9229 on 04Oct26 13:35 via UPI to Facebook Ind. Ref 664394072564.Bal Rs 11940.61. Not you?Call 18004251199 -Federal Bank";
    const inputs = r.root.findAllByType(require("react-native").TextInput);
    await act(async () => {
      inputs[0].props.onChangeText(sms);
    });
    await act(async () => {
      r.root.findAllByProps({ accessibilityLabel: "Check message" }).find((n) => n.props.onPress)!.props.onPress();
    });
    expect(texts(r)).toContain("Paid ₹200 to Facebook Ind");
    expect(texts(r)).toContain("Ref 664394072564");
    await act(async () => {
      r.root.findAllByProps({ accessibilityLabel: "Save it" }).find((n) => n.props.onPress)!.props.onPress();
    });
    expect(api.createTransactionsBulk).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(api.createTransactionsBulk.mock.calls[0][0]);
    expect(payload).toContain("upi-664394072564");
    expect(payload).not.toMatch(/Debited|Not you/);
  });
});

describe("toMonthRow", () => {
  it("computes label and net", () => {
    expect(toMonthRow({ month: "2026-10", cashIn: 50.5, cashOut: 700.25, count: 3 })).toEqual({
      month: "2026-10", label: "October 2026", cashIn: 50.5, cashOut: 700.25, net: -649.75, count: 3,
    });
  });
});
