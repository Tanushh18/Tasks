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
jest.mock("expo-contacts/legacy", () => ({ requestPermissionsAsync: jest.fn(), getPermissionsAsync: jest.fn() }));
let mockUser: { id: string; isAdmin?: boolean; mobileNumber?: string } = { id: "me", mobileNumber: "9876500001" };
jest.mock("../../../auth/AuthContext", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("../../../leads/contactAutoSync", () => ({
  LEAD_TAG: "lead",
  isAutoSyncEnabled: jest.fn().mockResolvedValue(false),
  setAutoSyncEnabled: jest.fn(),
  syncTaggedContacts: jest.fn().mockResolvedValue(null),
  getAutoSyncStatus: jest.fn().mockResolvedValue({ pending: 0 }),
}));
const mockRegisterCall = jest.fn(async () => undefined);
jest.mock("../../../leads/callFollowUp", () => ({ registerCall: (...a: unknown[]) => mockRegisterCall(...(a as [])) }));
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
}));

const lead = {
  id: "l1",
  name: "Ramesh",
  phone: "+919876511111",
  plotInFarukhNagar: "A-12",
  plotManual: false,
  category: "Construction",
  status: "Interested",
  requirement: "3BHK",
  address: "",
  budget: "50L",
  notes: "Call after 6",
  archived: false,
  createdAt: "2026-10-02T10:45:00.000Z",
  updatedAt: "2026-10-03T04:30:00.000Z",
  updatedByName: "Tanush",
  origin: "Meta Sheet",
};
const bare = { ...lead, id: "l2", name: "Geeta", status: "", plotInFarukhNagar: "", category: "", requirement: "", budget: "", notes: "", updatedByName: "" };
const mockListPage = jest.fn(async (opts: { page: number; status: string }) => ({
  leads: opts.page === 1 ? [lead, bare] : [{ ...bare, id: "l3", name: "Page Two" }],
  page: opts.page,
  limit: 10,
  total: 12,
  totalPages: 2,
  totalAll: 14,
  stageCounts: [
    { stage: "New", count: 12 },
    { stage: "Interested", count: 2 },
  ],
}));
const mockUpdateLead = jest.fn(async () => lead);
jest.mock("../../../api/leads", () => ({
  CATEGORY_OPTIONS: ["Construction", "Interior", "Sale / Purchase"],
  DEFAULT_STATUS_OPTIONS: ["New", "Interested", "Converted"],
  listLeadsPage: (opts: { page: number; status: string }) => mockListPage(opts),
  isLeadAdmin: (u: { isAdmin?: boolean } | null) => !!u?.isAdmin,
  isNotInterestedStatus: (s: string) => /not\s*int/i.test(s),
  getLeadMeta: jest.fn(async () => ({ statusSuggestions: ["New", "Interested", "Converted"], notInterestedTtlDays: 30 })),
  updateLead: (...a: unknown[]) => mockUpdateLead(...(a as [])),
  importLeads: jest.fn(),
  syncLeads: jest.fn(),
  listSources: jest.fn(async () => [
    { id: "s1", kind: "sheet", url: "https://docs.google.com/x", label: "FB ads", sheetId: "x", gid: "0", enabled: true, isOwner: true, sharedWith: [{ id: "u2", name: "Bob", mobileNumber: "9876500002" }] },
    { id: "s2", kind: "manual", url: "", label: "My contacts", sheetId: "manual", gid: "0", enabled: true, isOwner: false, sharedWith: [] },
  ]),
  sourceLabel: (s: { label?: string; kind: string }) => s.label || (s.kind === "manual" ? "My contacts" : s.kind === "import" ? "Imported leads" : "Google Sheet"),
  renameSource: jest.fn(),
  setSourceSync: jest.fn(),
  renameOrigin: jest.fn(async () => ({ renamed: 12 })),
  listOrigins: jest.fn(async () => [
    { name: "Calling Data", count: 2 },
    { name: "Meta Sheet", count: 12 },
  ]),
  addSource: jest.fn(),
  deleteSource: jest.fn(),
  shareSource: jest.fn(),
  unshareSource: jest.fn(),
}));

import { LeadSettingsScreen } from "../LeadSettingsScreen";
import { LeadSourcesScreen } from "../LeadSourcesScreen";
import { LeadsScreen } from "../LeadsScreen";

const textOfNode = (n: TestRenderer.ReactTestInstance) =>
  n.findAll((c) => typeof c.children?.[0] === "string").map((c) => c.children.join("")).join(" | ");
const textOf = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.children?.[0] === "string").map((n) => n.children.join("")).join(" | ");

describe("lead screens render", () => {
  beforeEach(() => {
    mockUser = { id: "me", mobileNumber: "9876500001" };
    jest.clearAllMocks();
  });

  async function renderLeads() {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadsScreen navigation={{ navigate: jest.fn() }} />);
    });
    return r;
  }
  const byLabel = (r: TestRenderer.ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.accessibilityLabel === label)[0];

  it("opens on New leads, 10 per page, with dates, who updated, and paging", async () => {
    const r = await renderLeads();
    expect(mockListPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, status: "New" }));
    const text = textOf(r);
    expect(text).toContain("14 active leads");
    expect(text).toContain("New 12");
    expect(text).toContain("Interested 2");
    expect(text).toContain("All 14");
    expect(text).toContain("Ramesh");
    expect(text).toMatch(/Added 2 Oct 2026/);
    expect(text).toContain("Updated by Tanush");
    expect(text).toContain("Meta Sheet");
    expect(text).toContain("Page 1 of 2");
    expect(byLabel(r, "WhatsApp Ramesh")).toBeTruthy();
    // The add / import / share buttons live in Leads settings now, not above the list.
    expect(text).not.toContain("Import CSV");
    expect(text).not.toContain("Add lead");
    expect(text).not.toContain("Auto-add tagged contacts");

    const next = r.root.findAll((n) => n.props.label === "Next ›")[0];
    await act(async () => next.props.onPress());
    expect(mockListPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(textOf(r)).toContain("Page Two");
    await act(async () => r.unmount());
  });

  it("the update sheet shows stage and notes, and other fields only when asked for", async () => {
    const r = await renderLeads();
    await act(async () => byLabel(r, "Update Geeta").props.onPress());
    const inputs = () => r.root.findAll((n) => (n.type as unknown) === "TextInput" && n.props.multiline !== undefined).length;
    let text = textOf(r);
    expect(text).toContain("Stage");
    expect(text).toContain("Add a field");
    const before = inputs();
    const budgetChip = r.root.findAll((n) => n.props.label === "Budget" && typeof n.props.onPress === "function")[0];
    await act(async () => budgetChip.props.onPress());
    expect(inputs()).toBe(before + 1);

    // A lead that already has these details shows them straight away.
    await act(async () => r.root.findAll((n) => n.props.label === "Cancel")[0].props.onPress());
    await act(async () => byLabel(r, "Update Ramesh").props.onPress());
    text = textOf(r);
    expect(text).toContain("Plot in Farukh Nagar");
    expect(text).toContain("Save");
    await act(async () => r.unmount());
  });

  it("edits name and mobile behind the edit button", async () => {
    const r = await renderLeads();
    await act(async () => byLabel(r, "Edit name and number of Ramesh").props.onPress());
    expect(textOf(r)).toContain("Edit lead");
    const save = r.root.findAll((n) => n.props.label === "Save" && typeof n.props.onPress === "function").at(-1)!;
    await act(async () => save.props.onPress());
    expect(mockUpdateLead).toHaveBeenCalledWith("l1", { name: "Ramesh", phone: "9876511111" });
    await act(async () => r.unmount());
  });

  it("remembers a call so the app can ask for the outcome", async () => {
    const r = await renderLeads();
    await act(async () => byLabel(r, "Call Ramesh").props.onPress());
    expect(mockRegisterCall).toHaveBeenCalledWith(expect.objectContaining({ id: "l1" }));
    await act(async () => r.unmount());
  });

  it("puts the add, import, share and auto-add tools in Leads settings (admin sees the CSV import)", async () => {
    const renderSettings = async () => {
      let r!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        r = TestRenderer.create(<LeadSettingsScreen navigation={{ navigate: jest.fn() }} />);
      });
      return r;
    };
    mockUser = { id: "me", isAdmin: true };
    const admin = await renderSettings();
    for (const label of ["Add a lead", "From contacts", "Auto-add tagged contacts", "Sheets", "Import CSV", "Leads saved on this phone"]) {
      expect(textOf(admin)).toContain(label);
    }
    await act(async () => admin.unmount());

    mockUser = { id: "me", mobileNumber: "9876500001" };
    const normal = await renderSettings();
    expect(textOf(normal)).not.toContain("Import CSV");
    // No sharing any more, and connecting sheets is the admin's job.
    expect(textOf(normal)).not.toContain("Share");
    expect(textOf(normal)).not.toContain("SHEETS AND FILES");
    await act(async () => normal.unmount());
  });

  it("filters by sheet name, shows each sheet's count, and lets anyone delete", async () => {
    const r = await renderLeads();
    await act(async () => byLabel(r, "Sheet: All leads. Tap to change.").props.onPress());
    const text = textOf(r);
    expect(text).toContain("Meta Sheet");
    expect(text).toContain("12");
    const meta = r.root.findAll((n) => n.props.accessibilityRole === "radio" && typeof n.props.onPress === "function").find((n) =>
      JSON.stringify(n.props.accessibilityState) && textOfNode(n).includes("Meta Sheet")
    )!;
    await act(async () => meta.props.onPress());
    expect(mockListPage).toHaveBeenLastCalledWith(expect.objectContaining({ origin: "Meta Sheet", page: 1 }));
    // A normal user (not admin) gets the delete button too.
    expect(byLabel(r, "Delete Ramesh")).toBeTruthy();
    await act(async () => r.unmount());
  });

  it("lets the admin rename a sheet name from the dropdown, and hides the button from everyone else", async () => {
    const open = async (r: TestRenderer.ReactTestRenderer) => act(async () => byLabel(r, "Sheet: All leads. Tap to change.").props.onPress());
    mockUser = { id: "me", mobileNumber: "9876500001" };
    const normal = await renderLeads();
    await open(normal);
    expect(normal.root.findAll((n) => n.props.accessibilityLabel === "Rename Meta Sheet")).toHaveLength(0);
    await act(async () => normal.unmount());

    mockUser = { id: "me", isAdmin: true };
    const r = await renderLeads();
    await open(r);
    await act(async () => byLabel(r, "Rename Meta Sheet").props.onPress());
    const field = r.root.findAll((n) => n.props.label === "New name")[0];
    await act(async () => field.props.onChangeText("Calling Data"));
    const save = r.root.findAll((n) => n.props.label === "Rename" && typeof n.props.onPress === "function").at(-1)!;
    await act(async () => save.props.onPress());
    expect((jest.requireMock("../../../api/leads") as { renameOrigin: jest.Mock }).renameOrigin).toHaveBeenCalledWith("Meta Sheet", "Calling Data");
    await act(async () => r.unmount());
  });

  it("has a settings button at the top right of the Leads screen", async () => {
    const setOptions = jest.fn();
    await act(async () => {
      TestRenderer.create(<LeadsScreen navigation={{ navigate: jest.fn(), setOptions }} />);
    });
    expect(setOptions).toHaveBeenCalledWith(expect.objectContaining({ headerRight: expect.any(Function) }));
  });

  it("LeadSourcesScreen shows sheets and owner actions, with no sharing", async () => {
    mockUser = { id: "me", isAdmin: true };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadSourcesScreen />);
    });
    const text = textOf(r);
    expect(text).toContain("FB ads");
    expect(text).toContain("My contacts");
    expect(text).not.toContain("Shared with");
    expect(text).not.toContain("Leave");
    expect(text).toContain("Add Google Sheet");
    // A connected sheet shows the sync switch and what it does; sharing stays as before.
    expect(text).toContain("Sync from sheet");
    expect(text).toContain("Connected: new rows are added");
    expect(text).not.toContain("Share");
    const sw = r.root.findAll((n) => n.props.accessibilityLabel === "Sync FB ads from its sheet")[0];
    await act(async () => sw.props.onValueChange(false));
    expect((jest.requireMock("../../../api/leads") as { setSourceSync: jest.Mock }).setSourceSync).toHaveBeenCalledWith("s1", false);
    await act(async () => r.unmount());
  });

  it("LeadSourcesScreen hides the Google Sheet link option from normal users", async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadSourcesScreen />);
    });
    expect(textOf(r)).not.toContain("Add Google Sheet");
    expect(textOf(r)).not.toContain("Import CSV");
    await act(async () => r.unmount());
  });
});
