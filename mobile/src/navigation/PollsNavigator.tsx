import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { PollDetailScreen } from "../screens/polls/PollDetailScreen";
import { PollFormScreen } from "../screens/polls/PollFormScreen";
import { PollsListScreen } from "../screens/polls/PollsListScreen";
import type { PollsStackParamList } from "./types";

const Stack = createNativeStackNavigator<PollsStackParamList>();

export function PollsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PollsList" component={PollsListScreen} />
      <Stack.Screen name="PollForm" component={PollFormScreen} options={{ headerShown: true, title: "New poll" }} />
      <Stack.Screen name="PollDetail" component={PollDetailScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
