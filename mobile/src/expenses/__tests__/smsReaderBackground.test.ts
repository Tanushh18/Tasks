// Jest has no native module: every background helper must return a safe default instead of throwing.
import {
  areNotificationsEnabled,
  backgroundTrackingAvailable,
  isIgnoringBatteryOptimizations,
  isTrackingRunning,
  openAutoStartSettings,
  requestIgnoreBatteryOptimizations,
  startTracking,
  stopTracking,
} from "../smsReader";

describe("smsReader background helpers without the native module", () => {
  it("report unavailable and return safe defaults", () => {
    expect(backgroundTrackingAvailable).toBe(false);
    expect(startTracking()).toBe(false);
    expect(() => stopTracking()).not.toThrow();
    expect(isTrackingRunning()).toBe(false);
    expect(isIgnoringBatteryOptimizations()).toBe(false);
    expect(requestIgnoreBatteryOptimizations()).toBe(false);
    expect(openAutoStartSettings()).toBe(false);
    expect(areNotificationsEnabled()).toBe(true);
  });
});
