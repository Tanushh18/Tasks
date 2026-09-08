import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { BluetoothChatScreen } from "../screens/chat/BluetoothChatScreen";
import { ChatListScreen } from "../screens/chat/ChatListScreen";
import { ChatThreadScreen } from "../screens/chat/ChatThreadScreen";
import { ContactFormScreen } from "../screens/contacts/ContactFormScreen";
import { ContactImportScreen } from "../screens/contacts/ContactImportScreen";
import { ContactsListScreen } from "../screens/contacts/ContactsListScreen";
import { FamilyHubScreen } from "../screens/family/FamilyHubScreen";
import { LocationSharingScreen } from "../screens/location/LocationSharingScreen";
import type { FamilyStackParamList } from "./types";

const Stack = createNativeStackNavigator<FamilyStackParamList>();

/**
 * Contacts, chat and location used to be separate bottom tabs. They're one
 * "Family" stack now — you come here to reach a person and then pick how.
 */
export function FamilyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FamilyHub" component={FamilyHubScreen} />
      <Stack.Screen name="ContactsList" component={ContactsListScreen} options={{ headerShown: true, title: "Contacts" }} />
      <Stack.Screen name="ContactForm" component={ContactFormScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen
        name="ContactImport"
        component={ContactImportScreen}
        options={{ headerShown: true, title: "Import contacts" }}
      />
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ headerShown: true, title: "Chat" }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen
        name="BluetoothChat"
        component={BluetoothChatScreen}
        options={{ headerShown: true, title: "Bluetooth Chat" }}
      />
      <Stack.Screen
        name="LocationSharing"
        component={LocationSharingScreen}
        options={{ headerShown: true, title: "Family Location" }}
      />
    </Stack.Navigator>
  );
}
