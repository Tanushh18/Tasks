import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/Card";
import { FamilyAvatar } from "../../components/FamilyAvatar";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { SettingsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<SettingsStackParamList, "Profile">;

/**
 * Identity-only screen: who you are and where to manage sign-in / privacy.
 * Preference toggles (notifications, currency, assistant behaviour) stay on
 * SettingsMain so there is a single settings "home" rather than two.
 */
export function ProfileScreen({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        Profile
      </Text>

      <View style={[styles.identity, { marginBottom: spacing.xl }]}>
        <FamilyAvatar name={user?.name ?? "?"} size={88} />
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.md }]}>{user?.name}</Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>{user?.mobileNumber}</Text>
      </View>

      <ProfileRow
        icon="key-outline"
        label="Change MPIN"
        detail="Update the code you sign in with"
        onPress={() => navigation.navigate("ChangeMpin")}
      />
      <ProfileRow
        icon="notifications-outline"
        label="Notification settings"
        detail="Manage reminders and alerts"
        onPress={() => navigation.navigate("SettingsMain")}
      />
      <ProfileRow
        icon="shield-checkmark-outline"
        label="Privacy Center"
        detail="How your family's data is protected"
        onPress={() => navigation.navigate("PrivacyCenter")}
      />
    </ScreenContainer>
  );
}

function ProfileRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const { colors, spacing, typography, touchTarget } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      <Card style={[styles.row, { marginBottom: spacing.md, minHeight: touchTarget.large }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
        <View style={styles.flex}>
          <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: spacing.md }]}>{label}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginLeft: spacing.md, marginTop: 2 }]}>
            {detail}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
