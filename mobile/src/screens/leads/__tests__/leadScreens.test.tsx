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
jest.mock("expo-contacts", () => ({ requestPermissionsAsync: jest.fn(), getPermissionsAsync: jest.fn() }));
jest.mock("../../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
jest.mock("../../../leads/contactAutoSync", () => ({
  LEAD_TAG: "lead",
  isAutoSyncEnabled: jest.fn().mockResolvedValue(false),
  setAutoSyncEnabled: jest.fn(),
  syncTaggedContacts: jest.fn().mockResolvedValue(null),
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
};
jest.mock("../../../api/leads", () => ({
  CATEGORY_OPTIONS: ["Construction", "Interior", "Sale / Purchase"],
  DEFAULT_STATUS_OPTIONS: ["New", "Interested", "Converted"],
  listLeads: jest.fn(async () => [lead, { ...lead, id: "l2", name: "Geeta", status: "" }]),
  getLeadMeta: jest.fn(async () => ({ statusSuggestions: ["New", "Interested", "Converted"] })),
  updateLead: jest.fn(async () => lead),
  importLeads: jest.fn(),
  syncLeads: jest.fn(),
  listSources: jest.fn(async () => [
    { id: "s1", kind: "sheet", url: "https://docs.google.com/x", label: "FB ads", sheetId: "x", gid: "0", enabled: true, isOwner: true, sharedWith: [{ id: "u2", name: "Bob", mobileNumber: "9876500002" }] },
    { id: "s2", kind: "manual", url: "", label: "My contacts", sheetId: "manual", gid: "0", enabled: true, isOwner: false, sharedWith: [] },
  ]),
  addSource: jest.fn(),
  deleteSource: jest.fn(),
  shareSource: jest.fn(),
  unshareSource: jest.fn(),
}));

import { LeadSourcesScreen } from "../LeadSourcesScreen";
import { LeadsScreen } from "../LeadsScreen";

const textOf = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.children?.[0] === "string").map((n) => n.children.join("")).join(" | ");

describe("lead screens render", () => {
  it("LeadsScreen shows leads, stage chips, actions, and opens the editor", async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadsScreen navigation={{ navigate: jest.fn() }} />);
    });
    const text = textOf(r);
    expect(text).toContain("Ramesh");
    expect(text).toContain("Interested");
    expect(text).toContain("Add lead");
    expect(text).toContain("From contacts");
    expect(text).toContain("WhatsApp");
    expect(text).toContain("All 2");

    const update = r.root.findAll((n) => n.props.accessibilityLabel === "Update Ramesh")[0];
    await act(async () => update.props.onPress());
    expect(textOf(r)).toContain("Plot in Farukh Nagar");
    expect(textOf(r)).toContain("Save");
    await act(async () => r.unmount());
  });

  it("LeadSourcesScreen shows sheets, members and owner/shared actions", async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<LeadSourcesScreen />);
    });
    const text = textOf(r);
    expect(text).toContain("FB ads");
    expect(text).toContain("Bob · 9876500002");
    expect(text).toContain("My contacts");
    expect(text).toContain("Shared with you");
    expect(text).toContain("Leave");
    await act(async () => r.unmount());
  });
});
