import axios from "axios";
import React from "react";
import { Alert, Linking } from "react-native";
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
jest.mock("expo-contacts/legacy", () => ({ requestPermissionsAsync: jest.fn(), getPermissionsAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", downloadAsync: jest.fn(), writeAsStringAsync: jest.fn(), EncodingType: { Base64: "base64" } }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-image-picker", () => ({ requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })), launchImageLibraryAsync: jest.fn() }));
const mockPicker = jest.requireMock("expo-image-picker") as { launchImageLibraryAsync: jest.Mock };
jest.mock("../../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "me", mobileNumber: "9876500001" } }) }));
jest.mock("../../../leads/contactAutoSync", () => ({
  LEAD_TAG: "lead",
  isAutoSyncEnabled: jest.fn().mockResolvedValue(false),
  setAutoSyncEnabled: jest.fn(),
  syncTaggedContacts: jest.fn().mockResolvedValue(null),
  getAutoSyncStatus: jest.fn().mockResolvedValue({ pending: 0 }),
}));
jest.mock("../../../leads/callFollowUp", () => ({ registerCall: jest.fn(async () => undefined), callStatusOptions: (s: string[]) => s }));
jest.mock("../../../leads/callOverlay", () => ({
  overlaySupported: false,
  getOverlaySetup: jest.fn(async () => ({ supported: false, overlay: false, phoneState: false })),
  requestOverlaySetup: jest.fn(),
  showTestOverlay: jest.fn(),
  startCallWatch: jest.fn(),
  wasOverlaySetupOffered: jest.fn(async () => true),
}));
jest.mock("../../../leads/adminCsvImport", () => ({ runAdminCsvImport: jest.fn() }));
jest.mock("../../../offline/httpCache", () => ({ bypassCacheBriefly: jest.fn() }));
jest.mock("../../../leads/leadStore", () => ({
  getLocalSources: jest.fn(async () => []),
  getLocalOrigins: jest.fn(async () => []),
  renameLocalOrigin: jest.fn(async () => undefined),
  queryLocalLeads: jest.fn(async () => null),
  refreshLeadStoreIfStale: jest.fn(async () => undefined),
  refreshLeadStore: jest.fn(async () => 0),
  localUpdatedAt: jest.fn(async () => null),
  isLocalFresh: jest.fn(async () => false),
}));

const base = {
  phone: "+919876511111",
  plotInFarukhNagar: "",
  plotManual: false,
  category: "",
  status: "",
  requirement: "",
  address: "",
  budget: "",
  notes: "",
  archived: false,
  createdAt: "2026-10-02T10:45:00.000Z",
};
const metaLead = { ...base, id: "l1", name: "Ramesh", origin: "Meta Sheet" };
const callingLead = { ...base, id: "l2", name: "Geeta", origin: "Calling Data", phone: "+919876522222" };
const sentLead = { ...base, id: "l3", name: "Sent Sam", origin: "Meta Sheet", phone: "+919876533333", whatsappSentAt: "2026-10-03T04:30:00.000Z" };

const template = { id: "t1", name: "Welcome", text: "Namaste {name}, thanks for your interest.", imageUrl: "https://img.example/a.jpg", sheets: ["Meta Sheet"] };
const mockApi = {
  listLeadsPage: jest.fn(async () => ({ leads: [metaLead, callingLead, sentLead], page: 1, limit: 10, total: 3, totalPages: 1, totalAll: 3, stageCounts: [{ stage: "New", count: 3 }] })),
  listWhatsAppTemplates: jest.fn(async () => [template]),
  setWhatsAppSent: jest.fn(async () => undefined),
  getAiStatus: jest.fn(async () => ({ connected: false, provider: "Gemini" })),
  improveWhatsAppText: jest.fn(),
  createWhatsAppTemplate: jest.fn(async (b: unknown) => ({ id: "t2", imageUrl: "", ...(b as object) })),
  updateWhatsAppTemplate: jest.fn(async () => template),
  deleteWhatsAppTemplate: jest.fn(async () => undefined),
};
jest.mock("../../../api/leads", () => ({
  getSmsSummary: jest.fn(async () => ({ state: "idle", window: null, lastSentAt: null, etaDays: null, sentToday: 0, dailyLimit: 90, lunch: "13:00–14:00", night: "21:00–23:00", totals: { total: 0, sent: 0, delivered: 0, failed: 0, invalid: 0, remaining: 0 }, sheets: [] })),
  CATEGORY_OPTIONS: [],
  DEFAULT_STATUS_OPTIONS: ["New"],
  PAGE_SIZE: 10,
  isLeadAdmin: () => false,
  isNotInterestedStatus: () => false,
  getLeadMeta: jest.fn(async () => ({ statusSuggestions: ["New"] })),
  listOrigins: jest.fn(async () => [
    { name: "Meta Sheet", count: 2 },
    { name: "Referrals", count: 0 },
  ]),
  sourceLabel: () => "",
  listLeadsPage: (...a: unknown[]) => mockApi.listLeadsPage(...(a as [])),
  listWhatsAppTemplates: () => mockApi.listWhatsAppTemplates(),
  setWhatsAppSent: (...a: unknown[]) => mockApi.setWhatsAppSent(...(a as [])),
  getAiStatus: () => mockApi.getAiStatus(),
  improveWhatsAppText: (...a: unknown[]) => mockApi.improveWhatsAppText(...(a as [])),
  createWhatsAppTemplate: (b: unknown) => mockApi.createWhatsAppTemplate(b),
  updateWhatsAppTemplate: (...a: unknown[]) => mockApi.updateWhatsAppTemplate(...(a as [])),
  deleteWhatsAppTemplate: (...a: unknown[]) => mockApi.deleteWhatsAppTemplate(...(a as [])),
}));

import { fillTemplate, templateForOrigin, whatsappUrl } from "../../../leads/whatsapp";
import { LeadSettingsScreen } from "../LeadSettingsScreen";
import { LeadWhatsAppScreen } from "../LeadWhatsAppScreen";
import { LeadsScreen } from "../LeadsScreen";

const textOf = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.children?.[0] === "string").map((n) => n.children.join("")).join(" | ");
const byLabel = (r: TestRenderer.ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
const byButton = (r: TestRenderer.ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function").at(-1)!;
const field = (r: TestRenderer.ReactTestRenderer, startsWith: string) =>
  r.root.findAll((n) => typeof n.props.label === "string" && n.props.label.startsWith(startsWith) && typeof n.props.onChangeText === "function")[0];

describe("whatsapp helpers", () => {
  it("fills {name} with the lead's name or nothing, and finds a template by sheet ignoring case", () => {
    expect(fillTemplate("Namaste {name}, thanks", "Ramesh")).toBe("Namaste Ramesh, thanks");
    expect(fillTemplate("Namaste {name}, thanks", "")).toBe("Namaste, thanks");
    expect(fillTemplate("Hi {name}!", undefined)).toBe("Hi!");
    expect(templateForOrigin([template], "meta sheet")?.id).toBe("t1");
    expect(templateForOrigin([template], "Calling Data")).toBeUndefined();
    expect(templateForOrigin([template], undefined)).toBeUndefined();
    expect(whatsappUrl("919876511111", "a b&c")).toBe("https://wa.me/919876511111?text=a%20b%26c");
    expect(whatsappUrl("919876511111")).toBe("https://wa.me/919876511111");
  });
});

describe("WhatsApp button on lead cards", () => {
  let open: jest.SpyInstance;
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });
  afterEach(() => {
    open.mockRestore();
    alert.mockRestore();
  });

  const renderLeads = async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadsScreen navigation={{ navigate: jest.fn() }} />);
    });
    return r;
  };

  it("keeps opening the chat directly when the lead's sheet has no template", async () => {
    const r = await renderLeads();
    await act(async () => byLabel(r, "WhatsApp Geeta").props.onPress());
    expect(open).toHaveBeenCalledWith("https://wa.me/919876522222");
    expect(textOf(r)).not.toContain("WhatsApp message");
    await act(async () => r.unmount());
  });

  it("opens an editable preview with the lead's name filled in; Send opens the edited text and marks the lead sent", async () => {
    const r = await renderLeads();
    await act(async () => byLabel(r, "WhatsApp Ramesh").props.onPress());
    expect(open).not.toHaveBeenCalled();
    expect(textOf(r)).toContain("WhatsApp message");
    const message = field(r, "Message");
    expect(message.props.value).toBe("Namaste Ramesh, thanks for your interest.");
    expect(r.root.findAll((n) => n.props.accessibilityLabel === "Template image preview").length).toBeGreaterThan(0);

    await act(async () => message.props.onChangeText("Namaste Ramesh ji, call me back"));
    await act(async () => byButton(r, "Send").props.onPress());
    expect(open).toHaveBeenCalledWith("https://wa.me/919876511111?text=" + encodeURIComponent("Namaste Ramesh ji, call me back"));
    expect(mockApi.setWhatsAppSent).toHaveBeenCalledWith("l1", true, "t1");
    // Honest about what "sent" means, and the image goes as a second step.
    expect(textOf(r)).toContain("we can't see whether WhatsApp delivered it");
    expect(byButton(r, "Send image")).toBeTruthy();
    expect(textOf(r)).toContain("WhatsApp sent ✓");
    await act(async () => r.unmount());
  });

  it("an image-only template has no text box or Send: Send image shares the picture and marks the lead sent", async () => {
    mockApi.listWhatsAppTemplates.mockResolvedValueOnce([{ ...template, text: "" }]);
    (jest.requireMock("expo-file-system/legacy") as { downloadAsync: jest.Mock }).downloadAsync.mockResolvedValueOnce({ status: 200 });
    const r = await renderLeads();
    await act(async () => byLabel(r, "WhatsApp Ramesh").props.onPress());
    expect(field(r, "Message")).toBeUndefined();
    expect(r.root.findAll((n) => n.props.label === "Send" && typeof n.props.onPress === "function")).toHaveLength(0);
    await act(async () => byButton(r, "Send image").props.onPress());
    expect(open).not.toHaveBeenCalled();
    expect(mockApi.setWhatsAppSent).toHaveBeenCalledWith("l1", true, "t1");
    await act(async () => r.unmount());
  });

  it("shows a sent chip on sent leads and lets it be un-marked", async () => {
    const r = await renderLeads();
    expect(textOf(r).match(/WhatsApp sent ✓/g)).toHaveLength(1);
    await act(async () => byLabel(r, "WhatsApp sent. Tap to mark as not sent.").props.onPress());
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === "Mark as not sent")!.onPress!());
    expect(mockApi.setWhatsAppSent).toHaveBeenCalledWith("l3", false);
    expect(textOf(r)).not.toContain("WhatsApp sent ✓");
    await act(async () => r.unmount());
  });
});

describe("WhatsApp templates screen", () => {
  beforeEach(() => jest.clearAllMocks());
  const render = async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadWhatsAppScreen />);
    });
    return r;
  };

  it("lists templates and the sheets they apply to, and says when AI isn't set up", async () => {
    const r = await render();
    const text = textOf(r);
    expect(text).toContain("Welcome");
    expect(text).toContain("Used for: Meta Sheet");
    expect(text).toContain("AI is not set up on the server");
    await act(async () => r.unmount());
  });

  it("shows the server's message when AI isn't configured, and the text can still be typed by hand", async () => {
    mockApi.improveWhatsAppText.mockRejectedValueOnce(
      Object.assign(new axios.AxiosError("x", "ERR", undefined, undefined, { status: 503, data: { error: { code: "AI_NOT_CONFIGURED", message: "AI is not set up on the server" } } } as never), {})
    );
    const r = await render();
    await act(async () => byButton(r, "New template").props.onPress());
    await act(async () => field(r, "Write your rough message").props.onChangeText("hi {name} plot hai"));
    await act(async () => byButton(r, "Improve with AI").props.onPress());
    expect(textOf(r)).toContain("AI is not set up on the server");
    await act(async () => field(r, "Final message").props.onChangeText("Hi {name}, typed by hand"));
    expect(field(r, "Final message").props.value).toBe("Hi {name}, typed by hand");
    await act(async () => r.unmount());
  });

  it("improves the rough text into the editable final message, then saves with the picked sheets", async () => {
    mockApi.improveWhatsAppText.mockResolvedValueOnce("Hi {name}, polished message");
    const r = await render();
    await act(async () => byButton(r, "New template").props.onPress());
    await act(async () => field(r, "Template name").props.onChangeText("Offer"));
    await act(async () => field(r, "Write your rough message").props.onChangeText("hi {name} offer"));
    await act(async () => byButton(r, "Improve with AI").props.onPress());
    expect(mockApi.improveWhatsAppText).toHaveBeenCalledWith("hi {name} offer");
    expect(field(r, "Final message").props.value).toBe("Hi {name}, polished message");

    // Sheets are chips, including lists like Referrals and OLF Data.
    const chips = r.root.findAll((n) => n.props.accessibilityState?.selected !== undefined).map((n) => n.props.accessibilityLabel);
    expect(chips).toEqual(expect.arrayContaining(["OLF Data", "Meta Sheet", "Calling Data", "My contacts", "Referrals"]));
    await act(async () => byLabel(r, "Referrals").props.onPress());
    await act(async () => byLabel(r, "Meta Sheet").props.onPress());
    expect(textOf(r)).toContain('Meta Sheet will move from "Welcome"');

    await act(async () => byButton(r, "Save").props.onPress());
    expect(mockApi.createWhatsAppTemplate).toHaveBeenCalledWith({
      name: "Offer",
      text: "Hi {name}, polished message",
      imageUrl: null,
      sheets: ["Referrals", "Meta Sheet"],
    });
    await act(async () => r.unmount());
  });

  it("caps the image at 2 MB and previews a good one", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const r = await render();
    await act(async () => byButton(r, "New template").props.onPress());

    mockPicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ base64: "A".repeat(3_000_000), mimeType: "image/jpeg" }] });
    await act(async () => byButton(r, "Upload image").props.onPress());
    expect(alert).toHaveBeenLastCalledWith("Can't use that image", "That image is over 2 MB. Pick a smaller one.");
    expect(r.root.findAll((n) => n.props.accessibilityLabel === "Template image preview")).toHaveLength(0);

    mockPicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ base64: "AAAA", mimeType: "image/png" }] });
    await act(async () => byButton(r, "Upload image").props.onPress());
    expect(r.root.findAll((n) => n.props.accessibilityLabel === "Template image preview").length).toBeGreaterThan(0);
    alert.mockRestore();
    await act(async () => r.unmount());
  });

  it("edits and deletes an existing template", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const r = await render();
    await act(async () => byLabel(r, "Edit template Welcome").props.onPress());
    expect(field(r, "Final message").props.value).toBe(template.text);
    await act(async () => field(r, "Template name").props.onChangeText("Welcome 2"));
    await act(async () => byButton(r, "Save").props.onPress());
    expect(mockApi.updateWhatsAppTemplate).toHaveBeenCalledWith("t1", expect.objectContaining({ name: "Welcome 2", sheets: ["Meta Sheet"], imageUrl: template.imageUrl }));

    await act(async () => byLabel(r, "Edit template Welcome").props.onPress());
    await act(async () => byButton(r, "Delete template").props.onPress());
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === "Delete")!.onPress!());
    expect(mockApi.deleteWhatsAppTemplate).toHaveBeenCalledWith("t1");
    alert.mockRestore();
    await act(async () => r.unmount());
  });

  it("settings shows the templates entry and the AI model status (never a key field)", async () => {
    const navigate = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadSettingsScreen navigation={{ navigate }} />);
    });
    expect(textOf(r)).toContain("WhatsApp templates");
    expect(textOf(r)).toContain("Connect AI model");
    expect(textOf(r)).toContain("Not set up on the server");
    mockApi.getAiStatus.mockResolvedValueOnce({ connected: true, provider: "Gemini" });
    await act(async () => r.unmount());
    await act(async () => {
      r = TestRenderer.create(<LeadSettingsScreen navigation={{ navigate }} />);
    });
    expect(textOf(r)).toContain("Connected: Improve with AI is on");
    await act(async () => r.root.findAll((n) => n.props.accessibilityLabel === "WhatsApp templates" && typeof n.props.onPress === "function")[0].props.onPress());
    expect(navigate).toHaveBeenCalledWith("LeadWhatsApp");
    await act(async () => r.unmount());
  });
});
