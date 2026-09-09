import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { VaultFormScreen } from "../screens/vault/VaultFormScreen";
import { VaultListScreen } from "../screens/vault/VaultListScreen";
import type { VaultStackParamList } from "./types";

const Stack = createNativeStackNavigator<VaultStackParamList>();

export function VaultNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VaultList" component={VaultListScreen} />
      <Stack.Screen name="VaultForm" component={VaultFormScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
