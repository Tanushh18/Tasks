import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ChatListScreen } from "../screens/chat/ChatListScreen";
import { ChatThreadScreen } from "../screens/chat/ChatThreadScreen";
import type { ChatStackParamList } from "./types";

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
