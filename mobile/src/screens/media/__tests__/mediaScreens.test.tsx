import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert, Linking } from "react-native";

const mockNavigate = jest.fn();
let mockParams: object = { projectKey: "sec 4", label: "Sector 4" };
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = jest.requireActual("react");
    R.useEffect(cb, []);
  },
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockParams }),
}));
jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: (props: { name: string }) => jest.requireActual("react").createElement(Text, null, `[${props.name}]`) };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../../../offline/httpCache", () => ({ bypassCacheBriefly: jest.fn() }));
const mockPick = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: (...a: unknown[]) => mockPick(...a),
}));

const photo = { publicId: "ShineOne/sec 4/a", kind: "image", url: "https://x/a.jpg", thumb: "https://x/a-t.jpg", bytes: 1, createdAt: "2026-10-02" };
const clip = { publicId: "ShineOne/sec 4/v", kind: "video", url: "https://x/v.mp4", thumb: "https://x/v.jpg", bytes: 1, createdAt: "2026-10-03" };
const mockList = jest.fn();
const mockUploadMany = jest.fn();
const mockDelete = jest.fn(async () => undefined);
jest.mock("../../../api/shineMedia", () => ({
  listProjects: () => mockList(),
  uploadMany: (...a: unknown[]) => mockUploadMany(...a),
  deleteMedia: (...a: unknown[]) => mockDelete(...(a as [])),
}));

import { MediaProjectScreen } from "../MediaProjectScreen";
import { MediaScreen } from "../MediaScreen";

const textOf = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.children?.[0] === "string").map((n) => n.children.join("")).join(" | ");
const byLabel = (r: TestRenderer.ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.accessibilityLabel === label);

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({
    configured: true,
    projects: [
      { key: "sec 4", label: "Sector 4", items: [clip, photo] },
      { key: "sec 9", label: "Sector 9", items: [] },
    ],
  });
});

async function render(el: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(el);
  });
  return r;
}

describe("Media tab", () => {
  it("lists each project with photo and video counts and opens one", async () => {
    const r = await render(<MediaScreen />);
    const text = textOf(r);
    expect(text).toContain("Sector 4");
    expect(text).toContain("1 photo · 1 video");
    expect(text).toContain("Sector 9");
    expect(text).toContain("0 photos · 0 videos");
    await act(async () => {
      byLabel(r, "Sector 4, 1 photos, 1 videos")[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("MediaProject", { projectKey: "sec 4", label: "Sector 4" });
  });

  it("warns when the server isn't set up yet", async () => {
    mockList.mockResolvedValue({ configured: false, projects: [{ key: "sec 4", label: "Sector 4", items: [] }] });
    const r = await render(<MediaScreen />);
    expect(textOf(r)).toContain("isn't set up on the server yet");
  });

  it("shows an error with retry when the list can't load", async () => {
    mockList.mockRejectedValue(new Error("boom"));
    const r = await render(<MediaScreen />);
    expect(textOf(r)).toMatch(/Try again/);
  });
});

describe("Project photos", () => {
  it("shows the project's photos and videos", async () => {
    const r = await render(<MediaProjectScreen />);
    expect(byLabel(r, "Photo").length).toBeGreaterThan(0);
    expect(byLabel(r, "Video").length).toBeGreaterThan(0);
  });

  it("shows an empty message for a project with nothing yet", async () => {
    mockParams = { projectKey: "sec 9", label: "Sector 9" };
    const r = await render(<MediaProjectScreen />);
    expect(textOf(r)).toContain("Nothing here yet");
    mockParams = { projectKey: "sec 4", label: "Sector 4" };
  });

  it("opens a video in the player", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const r = await render(<MediaProjectScreen />);
    await act(async () => {
      byLabel(r, "Video")[0].props.onPress();
    });
    expect(open).toHaveBeenCalledWith("https://x/v.mp4");
  });

  it("uploads picked photos and videos into the project, then reloads", async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///a.jpg", type: "image", fileName: "a.jpg", mimeType: "image/jpeg" },
        { uri: "file:///b.mp4", type: "video", fileName: "b.mp4", mimeType: "video/mp4" },
      ],
    });
    mockUploadMany.mockResolvedValue({ uploaded: 2, error: null });
    const r = await render(<MediaProjectScreen />);
    const listCalls = mockList.mock.calls.length;
    const button = r.root.findAll((n) => n.props.accessibilityRole === "button" && JSON.stringify(n.props.accessibilityLabel) === '"Add photos or videos"')[0];
    await act(async () => {
      await button.props.onPress();
    });
    expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true }));
    expect(mockUploadMany).toHaveBeenCalledWith(
      "sec 4",
      [
        { uri: "file:///a.jpg", kind: "image", fileName: "a.jpg", mimeType: "image/jpeg" },
        { uri: "file:///b.mp4", kind: "video", fileName: "b.mp4", mimeType: "video/mp4" },
      ],
      expect.any(Function)
    );
    expect(mockList.mock.calls.length).toBeGreaterThan(listCalls);
  });

  it("tells the person when an upload fails", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///big.mp4", type: "video" }] });
    mockUploadMany.mockResolvedValue({ uploaded: 0, error: "File size too large" });
    const r = await render(<MediaProjectScreen />);
    const button = r.root.findAll((n) => n.props.accessibilityRole === "button" && n.props.accessibilityLabel === "Add photos or videos")[0];
    await act(async () => {
      await button.props.onPress();
    });
    expect(alert).toHaveBeenCalledWith("Couldn't add", expect.stringContaining("File size too large"));
  });

  it("deletes a photo after confirming (long press)", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const r = await render(<MediaProjectScreen />);
    await act(async () => {
      byLabel(r, "Photo")[0].props.onLongPress();
    });
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === "Delete")!.onPress!();
    });
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({ publicId: "ShineOne/sec 4/a", kind: "image" }));
  });
});
