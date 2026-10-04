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
jest.mock("../../../offline/readCache", () => ({ loadCache: jest.fn(async () => null), saveCache: jest.fn(async () => undefined) }));
jest.mock("../../../offline/useOfflineSync", () => ({ subscribeToReconnect: () => () => undefined }));
jest.mock("../../../offline/offlineQueue", () => ({ isNetworkFailure: () => false }));

const account = (id: string, name: string, balance: number) => ({
  accountId: id,
  name,
  type: "home",
  balance,
  cashIn: balance,
  cashOut: 0,
  settledUpTo: null,
});
jest.mock("../../../api/finance", () => ({
  getFinancialSummary: jest.fn(async () => ({
    cashIn: 300,
    cashOut: 0,
    netFlow: 300,
    accounts: [account("a1", "Home", 100), account("a2", "Office", 200)],
  })),
}));

jest.mock("../../../api/groupExpenses", () => ({ listGroups: jest.fn(async () => []) }));

import { AccountsListScreen } from "../AccountsListScreen";
import { GroupsListScreen } from "../GroupsListScreen";

const textOf = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.children?.[0] === "string").map((n) => n.children.join("")).join(" | ");

async function renderMoney() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<AccountsListScreen navigation={navigation as never} route={{} as never} />);
  });
  return { r, navigation };
}

describe("Money screen", () => {
  it("shows accounts as cards, with See all to list every account and Back to return", async () => {
    const { r } = await renderMoney();
    expect(textOf(r)).toContain("Home");
    expect(textOf(r)).toContain("See all");
    expect(textOf(r)).not.toContain("‹ Back");
    expect(r.root.findAll((n) => n.props.horizontal === true).length).toBeGreaterThan(0);

    const seeAll = r.root.findAll((n) => n.props.accessibilityLabel === "See all, Your accounts")[0];
    await act(async () => seeAll.props.onPress());
    expect(textOf(r)).toContain("‹ Back");
    expect(textOf(r)).toContain("Office");
    expect(r.root.findAll((n) => n.props.horizontal === true)).toHaveLength(0);

    const back = r.root.findAll((n) => n.props.accessibilityLabel === "‹ Back, Your accounts")[0];
    await act(async () => back.props.onPress());
    expect(textOf(r)).toContain("See all");
  });

  it("opens an account from the full list", async () => {
    const { r, navigation } = await renderMoney();
    await act(async () => r.root.findAll((n) => n.props.accessibilityLabel === "See all, Your accounts")[0].props.onPress());
    const office = r.root.findAll((n) => String(n.props.accessibilityLabel ?? "").startsWith("Office, balance"))[0];
    await act(async () => office.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith("AccountDetail", { accountId: "a2" });
  });
});

describe("Group expenses screen", () => {
  it("has a Back to Money button", async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<GroupsListScreen navigation={navigation as never} route={{} as never} />);
    });
    const back = r.root.findAll((n) => n.props.accessibilityLabel === "Back to Money and all accounts")[0];
    await act(async () => back.props.onPress());
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it("goes to the accounts list when there is nothing to go back to", async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => false };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<GroupsListScreen navigation={navigation as never} route={{} as never} />);
    });
    await act(async () => r.root.findAll((n) => n.props.accessibilityLabel === "Back to Money and all accounts")[0].props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith("AccountsList");
  });
});
