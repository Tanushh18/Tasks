import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { AccountDetailScreen } from "../screens/finance/AccountDetailScreen";
import { AccountFormScreen } from "../screens/finance/AccountFormScreen";
import { AccountsListScreen } from "../screens/finance/AccountsListScreen";
import { FinanceInsightsScreen } from "../screens/finance/FinanceInsightsScreen";
import { TransactionFormScreen } from "../screens/finance/TransactionFormScreen";
import type { FinanceStackParamList } from "./types";

const Stack = createNativeStackNavigator<FinanceStackParamList>();

export function FinanceNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AccountsList" component={AccountsListScreen} />
      <Stack.Screen name="AccountDetail" component={AccountDetailScreen} options={{ headerShown: true }} />
      <Stack.Screen name="AccountForm" component={AccountFormScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="TransactionForm" component={TransactionFormScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="Insights" component={FinanceInsightsScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
