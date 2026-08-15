import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { TaskCalendarScreen } from "../screens/tasks/TaskCalendarScreen";
import { TaskFormScreen } from "../screens/tasks/TaskFormScreen";
import { TaskListScreen } from "../screens/tasks/TaskListScreen";
import type { TasksStackParamList } from "./types";

const Stack = createNativeStackNavigator<TasksStackParamList>();

export function TasksNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TaskList" component={TaskListScreen} />
      <Stack.Screen name="TaskForm" component={TaskFormScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="Calendar" component={TaskCalendarScreen} />
    </Stack.Navigator>
  );
}
