import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { LoadingState } from "../components/StateViews";
import { getJson, setJson } from "../offline/storage";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { OnboardingScreen } from "../screens/auth/OnboardingScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import type { AuthStackParamList } from "./types";

const Stack = createNativeStackNavigator<AuthStackParamList>();

/** Device-level (not per-user) — onboarding is about the install, not any one account. */
const ONBOARDING_SEEN_KEY = "dt_onboarding_seen";

export function AuthNavigator() {
  // null = still checking storage; keeps the very first frame from flashing Login before we know.
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);
  // Which screen the onboarding buttons should land on once onboarding is dismissed.
  const [initialRoute, setInitialRoute] = useState<keyof AuthStackParamList>("Login");

  useEffect(() => {
    (async () => {
      const seen = await getJson<boolean>(ONBOARDING_SEEN_KEY);
      setSeenOnboarding(Boolean(seen));
    })();
  }, []);

  if (seenOnboarding === null) {
    return <LoadingState label="Loading…" />;
  }

  if (!seenOnboarding) {
    const finishOnboarding = (route: keyof AuthStackParamList) => async () => {
      await setJson(ONBOARDING_SEEN_KEY, true);
      setInitialRoute(route);
      setSeenOnboarding(true);
    };
    return (
      <OnboardingScreen onCreateFamily={finishOnboarding("Register")} onJoinFamily={finishOnboarding("Login")} />
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
