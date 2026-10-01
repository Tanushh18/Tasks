import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetContacts = jest.fn();
const mockGetPermissions = jest.fn();
jest.mock("expo-contacts", () => ({
  Fields: { PhoneNumbers: "phoneNumbers" },
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  getContactsAsync: (...a: unknown[]) => mockGetContacts(...a),
}));

const mockImport = jest.fn();
jest.mock("../../api/leads", () => ({ importLeads: (...a: unknown[]) => mockImport(...a) }));

import { cleanLeadName, isLeadTagged, setAutoSyncEnabled, syncTaggedContacts } from "../contactAutoSync";

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
});

describe("lead tag matching", () => {
  it.each([
    ["Ramesh lead", true],
    ["Ramesh Lead", true],
    ["Ramesh #lead", true],
    ["lead Ramesh", true],
    ["Ramesh (LEAD)", true],
    ["Ramesh", false],
    ["Leader Singh", false],
    ["Mislead", false],
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

  it("retries next time if the request fails", async () => {
    await setAutoSyncEnabled(true);
    mockGetContacts.mockResolvedValue({ data: [contact("1", "Ramesh lead", "9876511111")] });
    mockImport.mockRejectedValueOnce(new Error("offline"));
    expect(await syncTaggedContacts({ force: true })).toBeNull();
    expect(await syncTaggedContacts({ force: true })).toEqual({ found: 1, added: 1 });
  });
});
