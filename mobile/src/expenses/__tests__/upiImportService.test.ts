import { Platform } from "react-native";

const mockNotifee = {
  getNotificationSettings: jest.fn(),
  requestPermission: jest.fn(),
  createChannel: jest.fn(async () => "upi-import"),
  displayNotification: jest.fn(async () => "id"),
  cancelNotification: jest.fn(async () => undefined),
  stopForegroundService: jest.fn(async () => undefined),
  registerForegroundService: jest.fn(),
};
jest.mock("@notifee/react-native", () => ({
  __esModule: true,
  default: mockNotifee,
  AndroidImportance: { LOW: 2 },
  AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
}));

import { registerUpiImportForegroundService, startImportService } from "../upiImportService";

const setPlatform = (os: string) => Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform("android");
  mockNotifee.getNotificationSettings.mockResolvedValue({ authorizationStatus: 1 });
  mockNotifee.requestPermission.mockResolvedValue({ authorizationStatus: 1 });
  mockNotifee.displayNotification.mockResolvedValue("id");
});

describe("import foreground service", () => {
  it("starts an ongoing low-importance foreground notification, updates it, and ends with a Done message", async () => {
    const h = await startImportService({ scanned: 0, saved: 0 });
    expect(h).not.toBeNull();
    const first = (mockNotifee.displayNotification.mock.calls as unknown as Array<[any]>)[0][0];
    expect(first).toMatchObject({ title: "Importing bank messages…", body: "0 scanned, 0 saved", android: { asForegroundService: true, ongoing: true, importance: 2 } });
    expect(first.android).not.toHaveProperty("foregroundServiceTypes"); // the manifest's declaration is used
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(Date.now() + 5000);
    h!.update({ scanned: 200, saved: 150 });
    h!.update({ scanned: 201, saved: 151 }); // throttled
    now.mockRestore();
    await Promise.resolve();
    const bodies = (mockNotifee.displayNotification.mock.calls as unknown as Array<[any]>).map((c) => c[0].body);
    expect(bodies).toEqual(["0 scanned, 0 saved", "200 scanned, 150 saved"]);
    await h!.stop({ saved: 150 });
    expect(mockNotifee.stopForegroundService).toHaveBeenCalledTimes(1);
    expect(mockNotifee.cancelNotification).toHaveBeenCalled();
    const last = (mockNotifee.displayNotification.mock.calls as unknown as Array<[any]>).slice(-1)[0][0];
    expect(last.body).toBe("Done: 150 expenses added");
    await h!.stop({ saved: 1 }); // idempotent
    expect(mockNotifee.stopForegroundService).toHaveBeenCalledTimes(1);
  });

  it("stop without a result leaves no 'Done' notification", async () => {
    const h = await startImportService({ scanned: 0, saved: 0 });
    mockNotifee.displayNotification.mockClear();
    await h!.stop();
    expect(mockNotifee.displayNotification).not.toHaveBeenCalled();
  });

  it("resolves null (never throws) when notification permission is missing or the service can't start", async () => {
    mockNotifee.getNotificationSettings.mockResolvedValue({ authorizationStatus: 0 });
    mockNotifee.requestPermission.mockResolvedValue({ authorizationStatus: 0 });
    expect(await startImportService({ scanned: 0, saved: 0 })).toBeNull();
    mockNotifee.getNotificationSettings.mockResolvedValue({ authorizationStatus: 1 });
    mockNotifee.displayNotification.mockRejectedValue(new Error("ForegroundServiceStartNotAllowedException"));
    expect(await startImportService({ scanned: 0, saved: 0 })).toBeNull();
    mockNotifee.getNotificationSettings.mockRejectedValue(new Error("boom"));
    expect(await startImportService({ scanned: 0, saved: 0 })).toBeNull();
  });

  it("is a no-op off Android", async () => {
    setPlatform("ios");
    expect(await startImportService({ scanned: 0, saved: 0 })).toBeNull();
    expect(mockNotifee.displayNotification).not.toHaveBeenCalled();
  });

  it("registers a service task that runs until the import stops, and shuts down a stray restart", async () => {
    registerUpiImportForegroundService();
    const task = mockNotifee.registerForegroundService.mock.calls[0][0] as () => Promise<void>;
    // stray restart with no import running: resolves immediately and stops the service
    await task();
    expect(mockNotifee.stopForegroundService).toHaveBeenCalledTimes(1);
    // with an import running the task stays pending until stop()
    const h = await startImportService({ scanned: 0, saved: 0 });
    let done = false;
    const running = task().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await h!.stop();
    await running;
    expect(done).toBe(true);
  });
});
