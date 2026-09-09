import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as authApi from "../../api/auth";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { TextField } from "../../components/TextField";
import { pingLocalServer, type LocalHealth } from "../../localServer/client";
import { DEFAULT_LOCAL_SERVER_URL, getLocalServerUrl, setLocalServerUrl } from "../../localServer/config";
import { listPendingScans } from "../../localServer/pendingScans";
import type { SettingsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<SettingsStackParamList, "SettingsMain">;

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

/**
 * Deleting an account is irreversible and removes financial history, so it is gated behind two
 * separate decisions (spec §54): the first asks whether to delete at all, the second spells out
 * exactly what disappears. Nothing is called until the second is accepted.
 */
type DeleteStage = null | "confirm" | "final";

export function SettingsScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const { user, logout, updateUser } = useAuth();

  const [busy, setBusy] = useState(false);
  const [deleteStage, setDeleteStage] = useState<DeleteStage>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const [localServerUrl, setLocalServerUrlState] = useState("");
  const [testingLocalServer, setTestingLocalServer] = useState(false);
  const [localServerStatus, setLocalServerStatus] = useState<"idle" | "checking" | LocalHealth | "unreachable">(
    "idle"
  );
  const [pendingScansCount, setPendingScansCount] = useState(0);

  useEffect(() => {
    (async () => {
      setLocalServerUrlState(await getLocalServerUrl());
      setPendingScansCount((await listPendingScans()).length);
    })();
  }, []);

  async function handleSaveLocalServerUrl() {
    await setLocalServerUrl(localServerUrl || DEFAULT_LOCAL_SERVER_URL);
  }

  async function handleTestLocalServer() {
    await handleSaveLocalServerUrl();
    setTestingLocalServer(true);
    setLocalServerStatus("checking");
    const health = await pingLocalServer(localServerUrl || DEFAULT_LOCAL_SERVER_URL);
    setLocalServerStatus(health ?? "unreachable");
    setTestingLocalServer(false);
  }

  function localServerStatusLabel(): string {
    if (localServerStatus === "idle") return "";
    if (localServerStatus === "checking") return "Checking…";
    if (localServerStatus === "unreachable") return "Not reachable";
    return `Connected — OCR: ${localServerStatus.ocrReady ? "ready" : "not installed"}, Voice: ${
      localServerStatus.voiceReady ? "ready" : "not installed"
    }`;
  }

  async function updateSetting(patch: Parameters<typeof authApi.updateSettings>[0], revert: () => void) {
    try {
      updateUser(await authApi.updateSettings(patch));
    } catch (err) {
      revert();
      Alert.alert("We couldn't save that change", getApiErrorMessage(err));
    }
  }

  function toggleNotifications(next: boolean) {
    if (!user) return;
    updateUser({ ...user, notificationsEnabled: next });
    void updateSetting({ notificationsEnabled: next }, () => updateUser({ ...user, notificationsEnabled: !next }));
  }

  function toggleConfirmFinancial(next: boolean) {
    if (!user) return;
    updateUser({ ...user, confirmFinancialActions: next });
    void updateSetting({ confirmFinancialActions: next }, () =>
      updateUser({ ...user, confirmFinancialActions: !next })
    );
  }

  function toggleSpeakReplies(next: boolean) {
    if (!user) return;
    updateUser({ ...user, speakAssistantReplies: next });
    void updateSetting({ speakAssistantReplies: next }, () =>
      updateUser({ ...user, speakAssistantReplies: !next })
    );
  }

  function toggleWeeklySummary(next: boolean) {
    if (!user) return;
    updateUser({ ...user, weeklySummaryEnabled: next });
    void updateSetting({ weeklySummaryEnabled: next }, () =>
      updateUser({ ...user, weeklySummaryEnabled: !next })
    );
  }

  async function changeCurrency(currency: string) {
    if (!user || user.currency === currency) return;
    const previous = user.currency;
    updateUser({ ...user, currency });
    void updateSetting({ currency }, () => updateUser({ ...user, currency: previous }));
  }

  async function performDelete() {
    setBusy(true);
    try {
      await authApi.deleteAccount();
      setDeleteStage(null);
      await logout();
    } catch (err) {
      setBusy(false);
      setDeleteStage(null);
      Alert.alert("We couldn't delete your account", getApiErrorMessage(err));
    }
  }

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        Settings
      </Text>

      <SectionHeader title="Account" />
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Mobile number</Text>
        <Text style={[typography.h3, { color: colors.text, marginTop: 2 }]}>{user?.mobileNumber}</Text>
      </Card>

      <SettingRow
        label="Change MPIN"
        detail="Update the code you sign in with"
        onPress={() => navigation.navigate("ChangeMpin")}
      />

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Notifications" />
      </View>
      <ToggleRow
        label="Task reminders"
        detail="Alerts on this phone when a task is due"
        value={user?.notificationsEnabled ?? true}
        onValueChange={toggleNotifications}
      />

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Assistant & voice" />
      </View>
      <ToggleRow
        label="Confirm money changes"
        detail="Ask before saving anything the assistant proposes"
        value={user?.confirmFinancialActions ?? true}
        onValueChange={toggleConfirmFinancial}
      />
      <ToggleRow
        label="Speak replies out loud"
        detail="Read answers aloud after you use your voice"
        value={user?.speakAssistantReplies ?? true}
        onValueChange={toggleSpeakReplies}
      />

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Weekly summary" subtitle="A computed recap of your last 7 days" />
      </View>
      <ToggleRow
        label="Show weekly summary"
        detail="Tasks, spending and reminders from the last week, on demand"
        value={user?.weeklySummaryEnabled ?? false}
        onValueChange={toggleWeeklySummary}
      />

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Money" subtitle="How amounts are shown" />
      </View>
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>Currency</Text>
        <View style={styles.chipRow}>
          {CURRENCIES.map((code) => {
            const active = user?.currency === code;
            return (
              <Pressable
                key={code}
                onPress={() => changeCurrency(code)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderRadius: radius.pill,
                    minHeight: touchTarget.min,
                  },
                ]}
              >
                <Text style={[typography.captionStrong, { color: active ? colors.onPrimary : colors.textMuted }]}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Local AI server" subtitle="Process scans and voice on your family's own computer first" />
      </View>
      <Card style={{ marginBottom: spacing.md }}>
        <TextField
          label="Server URL"
          value={localServerUrl}
          onChangeText={setLocalServerUrlState}
          placeholder={DEFAULT_LOCAL_SERVER_URL}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Button label="Test connection" variant="secondary" onPress={handleTestLocalServer} loading={testingLocalServer} />
        {localServerStatusLabel() ? (
          <Text
            style={[
              typography.caption,
              {
                color: localServerStatus === "unreachable" ? colors.danger : colors.textMuted,
                marginTop: spacing.md,
              },
            ]}
          >
            {localServerStatusLabel()}
          </Text>
        ) : null}
      </Card>

      {pendingScansCount > 0 ? (
        <SettingRow
          label="Pending scans"
          detail={`${pendingScansCount} waiting`}
          onPress={() => navigation.navigate("PendingScans")}
        />
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Sign in" />
      </View>
      <SettingRow label="Log out" icon="log-out-outline" onPress={() => setConfirmingLogout(true)} />
      <SettingRow
        label="Delete account"
        detail="Removes everything, permanently"
        icon="trash-outline"
        destructive
        onPress={() => setDeleteStage("confirm")}
      />

      <ConfirmationSheet
        visible={confirmingLogout}
        title="Log out?"
        message="You'll need your mobile number and MPIN to sign back in."
        confirmLabel="Log out"
        onConfirm={() => {
          setConfirmingLogout(false);
          void logout();
        }}
        onCancel={() => setConfirmingLogout(false)}
      />

      {/* First decision: do you want to do this at all. */}
      <ConfirmationSheet
        visible={deleteStage === "confirm"}
        title="Delete your account?"
        message="We'll ask you once more before anything is removed."
        confirmLabel="Continue"
        destructive
        onConfirm={() => setDeleteStage("final")}
        onCancel={() => setDeleteStage(null)}
      />

      {/* Second decision: exactly what is about to be lost. */}
      <ConfirmationSheet
        visible={deleteStage === "final"}
        title="This can't be undone"
        message="This will permanently remove your tasks, reminders and financial records."
        details={user?.mobileNumber ? [{ label: "Account", value: user.mobileNumber }] : undefined}
        confirmLabel="Delete permanently"
        destructive
        busy={busy}
        onConfirm={performDelete}
        onCancel={() => setDeleteStage(null)}
      />
    </ScreenContainer>
  );
}

function SettingRow({
  label,
  detail,
  icon = "chevron-forward",
  destructive = false,
  onPress,
}: {
  label: string;
  detail?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  destructive?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, typography, touchTarget } = useTheme();
  const tone = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      <Card
        style={[
          styles.row,
          { marginBottom: spacing.md, minHeight: touchTarget.large },
          destructive ? { borderColor: colors.danger } : null,
        ]}
      >
        <View style={styles.flex}>
          <Text style={[typography.bodyStrong, { color: tone }]}>{label}</Text>
          {detail ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{detail}</Text>
          ) : null}
        </View>
        <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.textFaint} />
      </Card>
    </Pressable>
  );
}

function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const { colors, spacing, typography, touchTarget } = useTheme();
  return (
    <Card style={[styles.row, { marginBottom: spacing.md, minHeight: touchTarget.large }]}>
      <View style={styles.flex}>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{label}</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
});
