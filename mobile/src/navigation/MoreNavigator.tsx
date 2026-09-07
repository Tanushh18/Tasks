import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { AssistantScreen } from "../screens/assistant/AssistantScreen";
import { AdminUsersScreen } from "../screens/admin/AdminUsersScreen";
import { FeatureFlagsScreen } from "../screens/admin/FeatureFlagsScreen";
import { LocationSharingScreen } from "../screens/location/LocationSharingScreen";
import { MoreScreen } from "../screens/more/MoreScreen";
import { NotesNavigator } from "./NotesNavigator";
import { SettingsNavigator } from "./SettingsNavigator";
import type { MoreStackParamList } from "./types";

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMain" component={MoreScreen} />
      <Stack.Screen name="Assistant" component={AssistantScreen} />
      <Stack.Screen name="Settings" component={SettingsNavigator} />
      <Stack.Screen name="LocationSharing" component={LocationSharingScreen} options={{ headerShown: true, title: "Location Sharing" }} />
      <Stack.Screen name="Notes" component={NotesNavigator} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ headerShown: true, title: "Admin" }} />
      <Stack.Screen name="FeatureFlags" component={FeatureFlagsScreen} options={{ headerShown: true, title: "Feature Flags" }} />
    </Stack.Navigator>
  );
}
