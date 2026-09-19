import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { VehicleDetailScreen } from "../screens/vehicles/VehicleDetailScreen";
import { VehicleDocumentFormScreen } from "../screens/vehicles/VehicleDocumentFormScreen";
import { VehicleFormScreen } from "../screens/vehicles/VehicleFormScreen";
import { VehicleListScreen } from "../screens/vehicles/VehicleListScreen";
import type { VehicleStackParamList } from "./types";

const Stack = createNativeStackNavigator<VehicleStackParamList>();

export function VehicleNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VehicleList" component={VehicleListScreen} />
      <Stack.Screen
        name="VehicleDetail"
        component={VehicleDetailScreen}
        options={({ route }) => ({ headerShown: true, title: route.params.name })}
      />
      <Stack.Screen name="VehicleForm" component={VehicleFormScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen
        name="VehicleDocumentForm"
        component={VehicleDocumentFormScreen}
        options={{ headerShown: true, title: "" }}
      />
    </Stack.Navigator>
  );
}
