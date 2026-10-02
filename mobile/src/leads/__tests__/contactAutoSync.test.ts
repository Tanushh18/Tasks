import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetContacts = jest.fn();
const mockGetPermissions = jest.fn();
// The legacy API is the one that works on SDK 57; the default export throws on every call.
jest.mock("expo-contacts/legacy", () => ({
  Fields: { PhoneNumbers: "phoneNumbers", FirstName: "firstName", MiddleName: "middleName", LastName: "lastName", Nickname: "nickname", Company: "company" },
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  getContactsAsync: (...a: unknown[]) => mockGetContacts(...a),
}));

const mockImport = jest.fn();
const mockLookup = jest.fn();
jest.mock("../../api/leads", () => ({
  importLeads: (...a: unknown[]) => mockImport(...a),
  lookupLeadPhones: (...a: unknown[]) => mockLookup(...a),
}));

import {
  cleanLeadName,
  dismissSuggestions,
  findContactSuggestions,
  getAutoSyncStatus,
  isLeadTagged,
  setAutoSyncEnabled,
  syncTaggedContacts,
} from "../contactAutoSync";

const contact = (id: string, name: string, ...numbers: string[]) => ({
  id,
  name,
  phoneNumbers: numbers.map((number) => ({ number })),
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockGetPermissions.mockResolvedValue({ status: "granted" });
  mockImport.mockImplementation(async (list: unknown[]) => ({ added: list.length, existing: 0, invalid: 0 }));
  mockLookup.mockResolvedValue([]);
  // One page unless a test says otherwise.
  mockGetContacts.mockImplementation(async () => ({ data: [], hasNextPage: false }));
});

describe("lead tag matching", () => {
  it.each([
    ["Ramesh lead", true],
    ["Ramesh Lead", true],
    ["Ramesh #lead", true],
    ["lead Ramesh", true],
    ["Ramesh (LEAD)", true],
    // "lead" anywhere in the name counts.
    ["Rameshlead", true],
    ["LeadSharma", true],
    ["Leader Singh", true],
    ["Ramesh", false],
    ["Mom", false],
    ["", false],
  ])("%s -> %s", (name, expected) => {
    expect(isLeadTagged(name)).toBe(expected);
  });

  it("strips the tag and leftover punctuation from the lead's name", () => {
    expect(cleanLeadName("Ramesh lead")).toBe("Ramesh");
    expect(cleanLeadName("Ramesh #Lead")).toBe("Ramesh");
    expect(cleanLeadName("Ramesh (lead)")).toBe("Ramesh");
    expect(cleanLeadName("Ramesh - lead")).toBe("Ramesh");
    expect(cleanLeadName("lead Ramesh Kumar")).toBe("Ramesh Kumar");
    // Glued-on tags are left alone rather than mangling the name; a bare "lead" keeps its name.
    expect(cleanLeadName("Rameshlead")).toBe("Rameshlead");
    expect(cleanLeadName("Lead")).toBe("Lead");
  });
});

describe("syncTaggedContacts", () => {
  it("does nothing until the toggle is on", async () => {
    mockGetContacts.mockResolvedValue({ data: [contact("1", "Ramesh lead", "9876511111")] });
    expect(await syncTaggedContacts({ force: true })).toBeNull();
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("does nothing (and never prompts) without contacts permission", async () => {
    await setAutoSyncEnabled(true);
    mockGetPermissions.mockResolvedValue({ status: "denied" });
    expect(await syncTaggedContacts({ force: true })).toBeNull();
    expect(mockGetContacts).not.toHaveBeenCalled();
  });

  it("sends only tagged contacts, with the tag removed, and never sends the same number twice", async () => {
    await setAutoSyncEnabled(true);
    mockGetContacts.mockResolvedValue({
      data: [
        contact("1", "Ramesh lead", "+91 98765 11111"),
        contact("2", "Mom", "9876522222"),
        contact("3", "Geeta #lead", "9123411111"),
      ],
    });

    const first = await syncTaggedContacts({ force: true });
    expect(first).toEqual({ found: 2, added: 2 });
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport.mock.calls[0][0]).toEqual([
      { name: "Ramesh", phone: "+919876511111" },
      { name: "Geeta", phone: "9123411111" },
    ]);

    // Second pass with one more tagged contact only sends the new one.
    mockGetContacts.mockResolvedValue({
      data: [
        contact("1", "Ramesh lead", "9876511111"),
        contact("3", "Geeta #lead", "9123411111"),
        contact("4", "Sunil lead", "9988077777"),
      ],
    });
    const second = await syncTaggedContacts({ force: true });
    expect(second).toEqual({ found: 1, added: 1 });
    expect(mockImport.mock.calls[1][0]).toEqual([{ name: "Sunil", phone: "9988077777" }]);

    // Nothing new -> no request.
    expect(await syncTaggedContacts({ force: true })).toEqual({ found: 0, added: 0 });
    expect(mockImport).toHaveBeenCalledTimes(2);
  });

  it("reads contacts page by page and uses first/last name when there is no display name", async () => {
    await setAutoSyncEnabled(true);
    mockGetContacts
      .mockResolvedValueOnce({ data: [contact("1", "Ramesh lead", "9876511111")], hasNextPage: true })
      .mockResolvedValueOnce({
        data: [{ id: "2", firstName: "Geeta", lastName: "Lead", phoneNumbers: [{ digits: "9123411111" }] }],
        hasNextPage: false,
      });
    expect(await syncTaggedContacts({ force: true })).toEqual({ found: 2, added: 2 });
    expect(mockGetContacts.mock.calls.map((c) => c[0].pageOffset)).toEqual([0, 500]);
    expect(mockImport.mock.calls[0][0][1]).toEqual({ name: "Geeta", phone: "9123411111" });
  });

  it("retries in place, then next run if the request keeps failing, and records the error", async () => {
    jest.useFakeTimers();
    try {
      await setAutoSyncEnabled(true);
      mockGetContacts.mockResolvedValue({ data: [contact("1", "Ramesh lead", "9876511111")] });
      mockImport.mockRejectedValue(new Error("offline"));
      const run = syncTaggedContacts({ force: true });
      await jest.runAllTimersAsync();
      expect(await run).toBeNull();
      expect(mockImport).toHaveBeenCalledTimes(3);
      expect((await getAutoSyncStatus()).lastError).toBe("offline");

      mockImport.mockImplementation(async (list: unknown[]) => ({ added: list.length, existing: 0, invalid: 0 }));
      const again = syncTaggedContacts({ force: true });
      await jest.runAllTimersAsync();
      expect(await again).toEqual({ found: 1, added: 1 });
      expect((await getAutoSyncStatus()).lastError).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it("doesn't count an offline-queued upload (no reply body) as sent", async () => {
    jest.useFakeTimers();
    try {
      await setAutoSyncEnabled(true);
      mockGetContacts.mockResolvedValue({ data: [contact("1", "Ramesh lead", "9876511111")] });
      mockImport.mockResolvedValue(undefined);
      const run = syncTaggedContacts({ force: true });
      await jest.runAllTimersAsync();
      expect(await run).toBeNull();
      expect((await getAutoSyncStatus()).pending).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("contact suggestions popup", () => {
  it("lists tagged contacts that aren't leads yet and hides dismissed ones from automatic popups", async () => {
    mockGetContacts.mockResolvedValue({
      data: [contact("1", "Ramesh lead", "9876511111"), contact("2", "Mom", "9876522222"), contact("3", "Sunillead", "9988077777")],
    });
    mockLookup.mockResolvedValue(["+919876511111"]);

    const found = await findContactSuggestions();
    expect(found).toEqual([{ key: "9988077777", name: "Sunillead", phone: "9988077777" }]);

    await dismissSuggestions(found);
    expect(await findContactSuggestions()).toEqual([]);
    // Asking by hand still shows them.
    expect(await findContactSuggestions({ includeDismissed: true })).toHaveLength(1);
    // The number that was already a lead is remembered and not looked up again.
    expect(mockLookup.mock.calls.at(-1)[0]).toEqual(["9988077777"]);
  });

  it("works without permission by returning nothing", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied" });
    expect(await findContactSuggestions({ includeDismissed: true })).toEqual([]);
    expect(mockGetContacts).not.toHaveBeenCalled();
  });
});
