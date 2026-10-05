import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { LeadsScreen } from "../screens/leads/LeadsScreen";
import { LeadImportScreen } from "../screens/leads/LeadImportScreen";
import { LeadSettingsScreen } from "../screens/leads/LeadSettingsScreen";
import { LeadWhatsAppScreen } from "../screens/leads/LeadWhatsAppScreen";
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
        name="LeadSettings"
        component={LeadSettingsScreen}
        options={{ title: "Leads settings" }}
      />
      <Stack.Screen
        name="LeadSources"
        component={LeadSourcesScreen}
        options={{ title: "Lead Sheets" }}
      />
      <Stack.Screen
        name="LeadWhatsApp"
        component={LeadWhatsAppScreen}
        options={{ title: "WhatsApp templates" }}
      />
      <Stack.Screen
        name="LeadImport"
        component={LeadImportScreen}
        options={{ title: "Add from contacts" }}
      />
    </Stack.Navigator>
  );
}
