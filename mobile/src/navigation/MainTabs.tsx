import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { useFeatureFlags } from "../features/FeatureFlagsContext";
import { useTheme } from "../theme/useTheme";
import { ChatNavigator } from "./ChatNavigator";
import { ContactsNavigator } from "./ContactsNavigator";
import { FinanceNavigator } from "./FinanceNavigator";
import { HomeNavigator } from "./HomeNavigator";
import { MoreNavigator } from "./MoreNavigator";
import { TasksNavigator } from "./TasksNavigator";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  HomeTab: "home",
  TasksTab: "checkbox",
  FinanceTab: "wallet",
  ContactsTab: "people",
  ChatTab: "chatbubbles",
  MoreTab: "ellipsis-horizontal-circle",
};

const OUTLINE_ICONS: Record<keyof MainTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  HomeTab: "home-outline",
  TasksTab: "checkbox-outline",
  FinanceTab: "wallet-outline",
  ContactsTab: "people-outline",
  ChatTab: "chatbubbles-outline",
  MoreTab: "ellipsis-horizontal-circle-outline",
};

export function MainTabs() {
  const { colors } = useTheme();
  const { flags } = useFeatureFlags();

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
      {flags.contacts ? (
        <Tab.Screen name="ContactsTab" component={ContactsNavigator} options={{ title: "Contacts" }} />
      ) : null}
      {flags.chat ? <Tab.Screen name="ChatTab" component={ChatNavigator} options={{ title: "Chat" }} /> : null}
      <Tab.Screen name="MoreTab" component={MoreNavigator} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
