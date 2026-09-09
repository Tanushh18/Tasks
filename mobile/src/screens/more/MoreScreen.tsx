import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useFeatureFlags } from "../../features/FeatureFlagsContext";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "MoreMain">;

export function MoreScreen({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        More
      </Text>

      {flags.assistant ? (
        <MoreRow icon="mic-outline" label="Assistant" onPress={() => navigation.navigate("Assistant", undefined)} />
      ) : null}
      {flags.notes ? (
        <MoreRow
          icon="document-text-outline"
          label="Notes"
          onPress={() => navigation.navigate("Notes", { screen: "NotesList", params: undefined })}
        />
      ) : null}
      {flags.familyEvents ? (
        <MoreRow icon="calendar-outline" label="Family Events" onPress={() => navigation.navigate("EventsList")} />
      ) : null}
      {flags.shoppingLists ? (
        <MoreRow icon="cart-outline" label="Shopping Lists" onPress={() => navigation.navigate("ShoppingLists")} />
      ) : null}
      {/* Location Sharing now lives under the Family tab, alongside the other
          people-shaped features, rather than being buried in More. */}
      <MoreRow
        icon="settings-outline"
        label="Settings"
        onPress={() => navigation.navigate("Settings", { screen: "SettingsMain", params: undefined })}
      />
      {user?.isAdmin ? (
        <MoreRow icon="shield-checkmark-outline" label="Admin" onPress={() => navigation.navigate("AdminUsers")} />
      ) : null}
      {user?.isAdmin ? (
        <MoreRow icon="flag-outline" label="Feature Flags" onPress={() => navigation.navigate("FeatureFlags")} />
      ) : null}
    </ScreenContainer>
  );
}

function MoreRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const { colors, spacing, typography, touchTarget } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
      <Card style={[styles.row, { marginBottom: spacing.md, minHeight: touchTarget.large }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
        <View style={styles.flex}>
          <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: spacing.md }]}>{label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
