import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ChangeMpinScreen } from "../screens/settings/ChangeMpinScreen";
import { PendingScansScreen } from "../screens/settings/PendingScansScreen";
import { PrivacyCenterScreen } from "../screens/settings/PrivacyCenterScreen";
import { ProfileScreen } from "../screens/settings/ProfileScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import type { SettingsStackParamList } from "./types";

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="PrivacyCenter" component={PrivacyCenterScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="ChangeMpin" component={ChangeMpinScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="PendingScans" component={PendingScansScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
