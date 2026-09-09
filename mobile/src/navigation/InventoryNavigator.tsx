import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { InventoryFormScreen } from "../screens/inventory/InventoryFormScreen";
import { InventoryListScreen } from "../screens/inventory/InventoryListScreen";
import type { InventoryStackParamList } from "./types";

const Stack = createNativeStackNavigator<InventoryStackParamList>();

export function InventoryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InventoryList" component={InventoryListScreen} />
      <Stack.Screen name="InventoryForm" component={InventoryFormScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
