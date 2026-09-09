import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";

interface Props {
  onFinish: () => void;
}

/**
 * Shown once, right after a brand-new registration (never on login). There's no invite-code
 * or family-join system in this app's auth model — a family is just a set of individually
 * registered accounts — so this is a single explanatory screen rather than a real "add member"
 * flow with a member list to build.
 */
export function FirstTimeSetupScreen({ onFinish }: Props) {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer contentStyle={{ flexGrow: 1, justifyContent: "center" }} scroll={false}>
      <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
        <Ionicons name="people-outline" size={64} color={colors.primary} />
      </View>

      <Text style={[typography.h1, { color: colors.text, textAlign: "center", marginBottom: spacing.md }]}>
        Add your family
      </Text>

      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.body, { color: colors.textMuted, textAlign: "center" }]}>
          Invite your family by sharing your family's sign-in details, or have them register with
          their own number.
        </Text>
      </Card>

      <Button
        label="Get Started"
        onPress={onFinish}
        accessibilityLabel="Get Started"
        accessibilityHint="Finishes setup and opens the app"
      />
    </ScreenContainer>
  );
}
