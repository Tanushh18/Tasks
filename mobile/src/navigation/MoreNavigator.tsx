import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { AssistantScreen } from "../screens/assistant/AssistantScreen";
import { AdminUsersScreen } from "../screens/admin/AdminUsersScreen";
import { FeatureFlagsScreen } from "../screens/admin/FeatureFlagsScreen";
import { EventFormScreen } from "../screens/events/EventFormScreen";
import { EventsListScreen } from "../screens/events/EventsListScreen";
import { MoreScreen } from "../screens/more/MoreScreen";
import { ShoppingListDetailScreen } from "../screens/shopping/ShoppingListDetailScreen";
import { ShoppingListsScreen } from "../screens/shopping/ShoppingListsScreen";
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
      <Stack.Screen name="Notes" component={NotesNavigator} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ headerShown: true, title: "Admin" }} />
      <Stack.Screen name="FeatureFlags" component={FeatureFlagsScreen} options={{ headerShown: true, title: "Feature Flags" }} />
      <Stack.Screen name="EventsList" component={EventsListScreen} options={{ headerShown: true, title: "Family Events" }} />
      <Stack.Screen name="EventForm" component={EventFormScreen} options={{ headerShown: true, title: "Event" }} />
      <Stack.Screen name="ShoppingLists" component={ShoppingListsScreen} options={{ headerShown: true, title: "Shopping Lists" }} />
      <Stack.Screen
        name="ShoppingListDetail"
        component={ShoppingListDetailScreen}
        options={({ route }) => ({ headerShown: true, title: route.params.name })}
      />
    </Stack.Navigator>
  );
}
