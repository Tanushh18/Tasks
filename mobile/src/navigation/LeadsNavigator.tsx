import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { LeadsScreen } from "../screens/leads/LeadsScreen";
import { LeadImportScreen } from "../screens/leads/LeadImportScreen";
import { LeadSourcesScreen } from "../screens/leads/LeadSourcesScreen";

const Stack = createNativeStackNavigator();

export function LeadsNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="LeadsMain"
        component={LeadsScreen}
        options={{ title: "Lead Tracker" }}
      />
      <Stack.Screen
        name="LeadSources"
        component={LeadSourcesScreen}
        options={{ title: "Lead Sheets" }}
      />
      <Stack.Screen
        name="LeadImport"
        component={LeadImportScreen}
        options={{ title: "Add from contacts" }}
      />
    </Stack.Navigator>
  );
}
