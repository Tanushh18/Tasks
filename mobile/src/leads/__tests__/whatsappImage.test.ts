import { Platform } from "react-native";

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(async () => ({ status: 200 })),
  getContentUriAsync: jest.fn(async (uri: string) => uri.replace("file://", "content://fp")),
}));
jest.mock("expo-intent-launcher", () => ({ startActivityAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-image-picker", () => ({}));

import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { shareTemplateImage } from "../whatsapp";

const launch = IntentLauncher.startActivityAsync as jest.Mock;
const share = Sharing.shareAsync as jest.Mock;
const IMAGE = "data:image/png;base64,AAAA";

describe("shareTemplateImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, "OS", "android");
  });
  afterEach(() => jest.restoreAllMocks());

  it("opens the lead's chat with the image attached when WhatsApp accepts it", async () => {
    launch.mockResolvedValue({ resultCode: -1 });
    await shareTemplateImage(IMAGE, "+91 98765-43210");
    expect(launch).toHaveBeenCalledTimes(1);
    const [action, params] = launch.mock.calls[0];
    expect(action).toBe("android.intent.action.SEND");
    expect(params.packageName).toBe("com.whatsapp");
    expect(params.type).toBe("image/png");
    expect(params.extra.jid).toBe("919876543210@s.whatsapp.net");
    expect(params.extra["android.intent.extra.STREAM"]).toMatch(/^content:\/\//);
    expect(share).not.toHaveBeenCalled();
  });

  it("tries WhatsApp Business when WhatsApp is not installed", async () => {
    launch.mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce({ resultCode: -1 });
    await shareTemplateImage(IMAGE, "919876543210");
    expect(launch.mock.calls.map((c) => c[1].packageName)).toEqual(["com.whatsapp", "com.whatsapp.w4b"]);
    expect(share).not.toHaveBeenCalled();
  });

  it("falls back to the share sheet when neither WhatsApp takes it", async () => {
    launch.mockRejectedValue(new Error("not found"));
    await shareTemplateImage(IMAGE, "919876543210");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("uses the share sheet when there is no number or not on Android", async () => {
    await shareTemplateImage(IMAGE);
    jest.replaceProperty(Platform, "OS", "ios");
    await shareTemplateImage(IMAGE, "919876543210");
    expect(launch).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledTimes(2);
  });
});
