import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { AssistantScreen } from "../screens/assistant/AssistantScreen";
import { useTheme } from "../theme/useTheme";
import { FinanceNavigator } from "./FinanceNavigator";
import { HomeNavigator } from "./HomeNavigator";
import { SettingsNavigator } from "./SettingsNavigator";
import { TasksNavigator } from "./TasksNavigator";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  HomeTab: "home",
  TasksTab: "checkbox",
  FinanceTab: "wallet",
  AssistantTab: "mic",
  SettingsTab: "settings",
};

const OUTLINE_ICONS: Record<keyof MainTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  HomeTab: "home-outline",
  TasksTab: "checkbox-outline",
  FinanceTab: "wallet-outline",
  AssistantTab: "mic-outline",
  SettingsTab: "settings-outline",
};

export function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? ICONS[route.name as keyof MainTabParamList] : OUTLINE_ICONS[route.name as keyof MainTabParamList]}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: "Home" }} />
      <Tab.Screen name="TasksTab" component={TasksNavigator} options={{ title: "Tasks" }} />
      <Tab.Screen name="FinanceTab" component={FinanceNavigator} options={{ title: "Finance" }} />
      <Tab.Screen name="AssistantTab" component={AssistantScreen} options={{ title: "Assistant" }} />
      <Tab.Screen name="SettingsTab" component={SettingsNavigator} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}
