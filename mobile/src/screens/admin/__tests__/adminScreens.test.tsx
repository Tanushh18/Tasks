import React from "react";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: (props: { name: string }) => jest.requireActual("react").createElement(Text, null, `[${props.name}]`) };
});
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => jest.requireActual("react").useEffect(cb, [cb]),
}));
jest.mock("../../../api/admin", () => ({
  getStorageStatus: jest.fn(),
}));

import * as adminApi from "../../../api/admin";
import { AdminBadge } from "../../../components/AdminBadge";
import { DatabaseStorageScreen, formatBytes } from "../DatabaseStorageScreen";

const MB = 1024 * 1024;

function texts(root: TestRenderer.ReactTestRenderer): string {
  return root.root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat(Infinity).join(""))
    .join("\n");
}

describe("AdminBadge", () => {
  it("renders the ADMIN pill", () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<AdminBadge />);
    });
    expect(texts(r)).toContain("ADMIN");
    expect(texts(r)).toContain("[shield-checkmark]");
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(5 * MB)).toBe("5.0 MB");
    expect(formatBytes(512 * MB)).toBe("512 MB");
    expect(formatBytes(1536 * MB)).toBe("1.5 GB");
  });
});

describe("DatabaseStorageScreen", () => {
  it("shows usage, left, per-collection rows and the assumed-limit note", async () => {
    (adminApi.getStorageStatus as jest.Mock).mockResolvedValue({
      dataSize: 10 * MB,
      storageSize: 20 * MB,
      indexSize: 5 * MB,
      totalSize: 25 * MB,
      objects: 1234,
      collections: 3,
      limitBytes: 512 * MB,
      usedBytes: 25 * MB,
      freeBytes: 487 * MB,
      percentUsed: 4.9,
      quotaSource: "default",
      warning: "ok",
      perCollection: [{ name: "leads", count: 900, dataSize: 8 * MB, storageSize: 15 * MB, indexSize: MB, totalSize: 16 * MB }],
      generatedAt: new Date().toISOString(),
    });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<DatabaseStorageScreen />);
    });
    const out = texts(r);
    expect(out).toContain("ADMIN");
    expect(out).toContain("25.0 MB of 512 MB used");
    expect(out).toContain("4.9% used");
    expect(out).toContain("487 MB left");
    expect(out).toContain("leads");
    expect(out).toContain("MONGODB_STORAGE_LIMIT_MB");
    expect(out).toContain("assumed");
  });
});
