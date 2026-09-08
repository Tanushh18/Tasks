import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ContactFormScreen } from "../screens/contacts/ContactFormScreen";
import { ContactImportScreen } from "../screens/contacts/ContactImportScreen";
import { ContactsListScreen } from "../screens/contacts/ContactsListScreen";
import type { ContactsStackParamList } from "./types";

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export function ContactsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ContactsList" component={ContactsListScreen} />
      <Stack.Screen name="ContactForm" component={ContactFormScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen
        name="ContactImport"
        component={ContactImportScreen}
        options={{ headerShown: true, title: "Import contacts" }}
      />
    </Stack.Navigator>
  );
}
