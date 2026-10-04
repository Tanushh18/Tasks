import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { MediaProjectScreen } from "../screens/media/MediaProjectScreen";
import { MediaScreen } from "../screens/media/MediaScreen";

const Stack = createNativeStackNavigator();

export function MediaNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MediaMain" component={MediaScreen} options={{ title: "Website photos" }} />
      <Stack.Screen
        name="MediaProject"
        component={MediaProjectScreen}
        options={({ route }) => ({ title: (route.params as { label?: string } | undefined)?.label ?? "Photos" })}
      />
    </Stack.Navigator>
  );
}
