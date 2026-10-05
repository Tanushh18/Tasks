import React from "react";
import { AppState } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockAuth = { user: { id: "u1", isAdmin: true } as { id: string; isAdmin: boolean } | null, isAuthenticated: true };
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => mockAuth }));

const mockNative = { running: false, startTracking: jest.fn(() => true), stopTracking: jest.fn() };
jest.mock("../smsReader", () => ({
  smsReaderAvailable: true,
  backgroundTrackingAvailable: true,
  hasSmsPermission: () => true,
  requestSmsPermission: jest.fn(async () => true),
  readInbox: jest.fn(async () => []),
  peekQueuedSms: jest.fn(() => []),
  removeQueuedSms: jest.fn(),
  onSmsReceived: jest.fn(() => () => undefined),
  isTrackingRunning: () => mockNative.running,
  startTracking: () => mockNative.startTracking(),
  stopTracking: () => mockNative.stopTracking(),
}));
jest.mock("../../api/finance", () => ({
  listAccounts: jest.fn(async () => []),
  createAccount: jest.fn(),
  createTransactionsBulk: jest.fn(async () => []),
  parseSmsWithAi: jest.fn(),
}));

import { setUpiTrackingEnabled } from "../upiExpenseSync";
import { useUpiExpenseSync } from "../useUpiExpenseSync";

function Probe() {
  useUpiExpenseSync();
  return null;
}
const mounted: TestRenderer.ReactTestRenderer[] = [];
async function mount() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Probe />);
  });
  mounted.push(r);
  return r;
}

afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
});

let handler: ((s: string) => void) | undefined;
beforeEach(async () => {
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: string) => void) => {
    handler = cb;
    return { remove: jest.fn() };
  }) as never);
  await AsyncStorage.clear();
  mockAuth.user = { id: "u1", isAdmin: true };
  mockAuth.isAuthenticated = true;
  mockNative.running = false;
  mockNative.startTracking.mockClear();
  mockNative.stopTracking.mockClear();
});

describe("useUpiExpenseSync background service", () => {
  it("does not start the service while tracking is OFF", async () => {
    await mount();
    expect(mockNative.startTracking).not.toHaveBeenCalled();
  });

  it("starts the service when tracking is ON (admin) and re-ensures it on foreground", async () => {
    await setUpiTrackingEnabled(true, "u1");
    await mount();
    expect(mockNative.startTracking).toHaveBeenCalled();
    mockNative.startTracking.mockClear();
    mockNative.running = true;
    await act(async () => handler?.("active"));
    expect(mockNative.startTracking).not.toHaveBeenCalled();
    mockNative.running = false;
    await act(async () => handler?.("active"));
    expect(mockNative.startTracking).toHaveBeenCalled();
  });

  it("never starts it for a non-admin and stops it", async () => {
    await setUpiTrackingEnabled(true, "u1");
    mockAuth.user = { id: "u2", isAdmin: false };
    await mount();
    expect(mockNative.startTracking).not.toHaveBeenCalled();
    expect(mockNative.stopTracking).toHaveBeenCalled();
  });

  it("stops the service when the user signs out", async () => {
    await setUpiTrackingEnabled(true, "u1");
    const r = await mount();
    expect(mockNative.startTracking).toHaveBeenCalled();
    mockAuth.user = null;
    mockAuth.isAuthenticated = false;
    await act(async () => {
      r.update(<Probe />);
    });
    expect(mockNative.stopTracking).toHaveBeenCalled();
  });
});
