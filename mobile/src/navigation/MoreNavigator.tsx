import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { AssistantScreen } from "../screens/assistant/AssistantScreen";
import { AdminUsersScreen } from "../screens/admin/AdminUsersScreen";
import { FeatureFlagsScreen } from "../screens/admin/FeatureFlagsScreen";
import { GoalDetailScreen } from "../screens/goals/GoalDetailScreen";
import { GoalFormScreen } from "../screens/goals/GoalFormScreen";
import { GoalsListScreen } from "../screens/goals/GoalsListScreen";
import { MoreScreen } from "../screens/more/MoreScreen";
import { RecurringPaymentFormScreen } from "../screens/payments/RecurringPaymentFormScreen";
import { RecurringPaymentsListScreen } from "../screens/payments/RecurringPaymentsListScreen";
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
      <Stack.Screen
        name="RecurringPaymentsList"
        component={RecurringPaymentsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RecurringPaymentForm"
        component={RecurringPaymentFormScreen}
        options={{ headerShown: true }}
      />
      <Stack.Screen name="GoalsList" component={GoalsListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GoalForm" component={GoalFormScreen} options={{ headerShown: true }} />
      <Stack.Screen name="GoalDetail" component={GoalDetailScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}
