import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { EmergencyInfoScreen } from "../screens/emergency/EmergencyInfoScreen";
import type { EmergencyStackParamList } from "./types";

const Stack = createNativeStackNavigator<EmergencyStackParamList>();

export function EmergencyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EmergencyInfoMain" component={EmergencyInfoScreen} />
    </Stack.Navigator>
  );
}
