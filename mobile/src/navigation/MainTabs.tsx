import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeatureFlags } from "../features/FeatureFlagsContext";
import { useTheme } from "../theme/useTheme";
import { FamilyNavigator } from "./FamilyNavigator";
import { FinanceNavigator } from "./FinanceNavigator";
import { HomeNavigator } from "./HomeNavigator";
import { MoreNavigator } from "./MoreNavigator";
import { TasksNavigator } from "./TasksNavigator";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

// Height Android reserves for the classic 3-button navigation bar.
const ANDROID_NAV_BUTTONS_HEIGHT = 48;

const ICONS: Record<keyof MainTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  HomeTab: "home",
  TasksTab: "checkbox",
  FinanceTab: "wallet",
  FamilyTab: "people",
  MoreTab: "ellipsis-horizontal-circle",
};

const OUTLINE_ICONS: Record<keyof MainTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  HomeTab: "home-outline",
  TasksTab: "checkbox-outline",
  FinanceTab: "wallet-outline",
  FamilyTab: "people-outline",
  MoreTab: "ellipsis-horizontal-circle-outline",
};

export function MainTabs() {
  const { colors, spacing } = useTheme();
  const { flags } = useFeatureFlags();
  const insets = useSafeAreaInsets();

  // insets.bottom already adapts to whatever the device puts below the app:
  // ~48dp for an Android 3-button bar, ~16-24dp for a gesture pill, ~34pt for
  // the iPhone home indicator, 0 when there is genuinely nothing there. Use it
  // as-is whenever it reports something, so the bar sizes itself per device.
  //
  // A zero on Android is the ambiguous case — it means either "no system bar"
  // or "edge-to-edge hasn't reported the inset yet" — and guessing wrong there
  // is what leaves the tab bar sitting under the on-screen buttons, so reserve
  // a full button bar's height rather than letting them overlap.
  const bottomInset =
    insets.bottom > 0 ? insets.bottom : Platform.OS === "android" ? ANDROID_NAV_BUTTONS_HEIGHT : spacing.sm;

  // The Family tab is the way into contacts, chat and location — if an admin
  // has turned all three off there's nothing behind it, so it disappears
  // rather than opening an empty screen (spec §3).
  const showFamilyTab = flags.contacts || flags.chat || flags.location;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: spacing.sm,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
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
      <Tab.Screen name="FinanceTab" component={FinanceNavigator} options={{ title: "Money" }} />
      {showFamilyTab ? (
        <Tab.Screen name="FamilyTab" component={FamilyNavigator} options={{ title: "Family" }} />
      ) : null}
      <Tab.Screen name="MoreTab" component={MoreNavigator} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
