jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///files/" }));

import { shouldInstall, type InstallContext, type OtaManifest } from "../githubOta";

const ctx: InstallContext = { runtimeVersion: "1.0.2", ownVersion: 100, stagedVersion: 0, badVersion: 0 };
const manifest = (over: Partial<OtaManifest> = {}): OtaManifest => ({ version: 200, runtimeVersion: "1.0.2", size: 5, ...over });

describe("shouldInstall", () => {
  it("takes a newer bundle for the same runtime", () => {
    expect(shouldInstall(manifest(), ctx)).toBe(true);
  });
  it("ignores a bundle for another runtime version", () => {
    expect(shouldInstall(manifest({ runtimeVersion: "1.0.3" }), ctx)).toBe(false);
  });
  it("ignores a bundle that is not newer than the running one", () => {
    expect(shouldInstall(manifest({ version: 100 }), ctx)).toBe(false);
    expect(shouldInstall(manifest({ version: 99 }), ctx)).toBe(false);
  });
  it("ignores a bundle that is already downloaded and waiting for a restart", () => {
    expect(shouldInstall(manifest({ version: 200 }), { ...ctx, stagedVersion: 200 })).toBe(false);
  });
  it("skips a version that failed to boot, but takes a newer one", () => {
    expect(shouldInstall(manifest({ version: 200 }), { ...ctx, badVersion: 200 })).toBe(false);
    expect(shouldInstall(manifest({ version: 201 }), { ...ctx, badVersion: 200 })).toBe(true);
  });
  it("does nothing without a runtime version (dev builds)", () => {
    expect(shouldInstall(manifest(), { ...ctx, runtimeVersion: "" })).toBe(false);
  });
  it("rejects an empty or malformed manifest", () => {
    expect(shouldInstall(manifest({ size: 0 }), ctx)).toBe(false);
    expect(shouldInstall(manifest({ version: NaN }), ctx)).toBe(false);
  });
});
