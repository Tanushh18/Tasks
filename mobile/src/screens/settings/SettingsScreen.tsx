import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import * as authApi from "../../api/auth";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";
import type { SettingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SettingsStackParamList, "SettingsMain">;

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

export function SettingsScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleToggleNotifications(next: boolean) {
    if (!user) return;
    updateUser({ ...user, notificationsEnabled: next });
    try {
      const updated = await authApi.updateSettings({ notificationsEnabled: next });
      updateUser(updated);
    } catch (err) {
      updateUser({ ...user, notificationsEnabled: !next });
      Alert.alert("Couldn't update setting", getApiErrorMessage(err));
    }
  }

  async function handleCurrencyChange(currency: string) {
    if (!user) return;
    try {
      const updated = await authApi.updateSettings({ currency });
      updateUser(updated);
    } catch (err) {
      Alert.alert("Couldn't update currency", getApiErrorMessage(err));
    }
  }

  async function handleToggleConfirmFinancial(next: boolean) {
    if (!user) return;
    updateUser({ ...user, confirmFinancialActions: next });
    try {
      const updated = await authApi.updateSettings({ confirmFinancialActions: next });
      updateUser(updated);
    } catch (err) {
      updateUser({ ...user, confirmFinancialActions: !next });
      Alert.alert("Couldn't update setting", getApiErrorMessage(err));
    }
  }

  async function handleToggleSpeakReplies(next: boolean) {
    if (!user) return;
    updateUser({ ...user, speakAssistantReplies: next });
    try {
      const updated = await authApi.updateSettings({ speakAssistantReplies: next });
      updateUser(updated);
    } catch (err) {
      updateUser({ ...user, speakAssistantReplies: !next });
      Alert.alert("Couldn't update setting", getApiErrorMessage(err));
    }
  }

  function handleLogout() {
    Alert.alert("Log out", "You'll need your mobile number and MPIN to log back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account, tasks, and financial data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await authApi.deleteAccount();
              await logout();
            } catch (err) {
              setBusy(false);
              Alert.alert("Couldn't delete account", getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer>
      <Text style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>Settings</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Mobile number</Text>
        <Text style={[typography.h3, { color: colors.text, marginTop: 2 }]}>{user?.mobileNumber}</Text>
      </Card>

      <Pressable onPress={() => navigation.navigate("ChangeMpin")}>
        <Card style={[styles.row, { marginBottom: spacing.md }]}>
          <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]}>Change MPIN</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      </Pressable>

      <Card style={[styles.row, { marginBottom: spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Notifications</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Task and reminder alerts</Text>
        </View>
        <Switch value={user?.notificationsEnabled ?? true} onValueChange={handleToggleNotifications} />
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.sm }]}>Currency</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => handleCurrencyChange(c)}
              style={[
                styles.chip,
                { backgroundColor: user?.currency === c ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill },
              ]}
            >
              <Text style={{ color: user?.currency === c ? "#FFFFFF" : colors.textMuted, fontWeight: "600" }}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>AI & Voice</Text>
      <Card style={[styles.row, { marginBottom: spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Confirm financial actions</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Ask before saving transactions the assistant proposes</Text>
        </View>
        <Switch value={user?.confirmFinancialActions ?? true} onValueChange={handleToggleConfirmFinancial} />
      </Card>
      <Card style={[styles.row, { marginBottom: spacing.lg }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Speak assistant replies</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Read responses aloud after voice commands</Text>
        </View>
        <Switch value={user?.speakAssistantReplies ?? true} onValueChange={handleToggleSpeakReplies} />
      </Card>

      <Pressable onPress={handleLogout}>
        <Card style={[styles.row, { marginBottom: spacing.md }]}>
          <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]}>Log out</Text>
          <Ionicons name="log-out-outline" size={20} color={colors.textFaint} />
        </Card>
      </Pressable>

      <Pressable onPress={handleDeleteAccount} disabled={busy}>
        <Card style={[styles.row, { borderColor: colors.danger }]}>
          <Text style={[typography.bodyStrong, { color: colors.danger, flex: 1 }]}>Delete account</Text>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Card>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  chip: { paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center" },
});
