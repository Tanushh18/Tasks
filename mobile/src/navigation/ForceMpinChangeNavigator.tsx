import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ChangeMpinScreen } from "../screens/settings/ChangeMpinScreen";
import type { SettingsStackParamList } from "./types";

const Stack = createNativeStackNavigator<SettingsStackParamList>();

/**
 * Shown instead of MainTabs when the signed-in user's MPIN was reset by an admin
 * (`mustChangeMpin: true`) — forces a change before anything else in the app is reachable.
 */
export function ForceMpinChangeNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="ChangeMpin" component={ChangeMpinScreen} options={{ title: "Change MPIN" }} />
    </Stack.Navigator>
  );
}
