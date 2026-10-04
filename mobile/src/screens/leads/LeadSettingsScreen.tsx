import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts/legacy";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { useAuth } from "../../auth/AuthContext";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { runAdminCsvImport } from "../../leads/adminCsvImport";
import {
  getOverlaySetup,
  requestOverlaySetup,
  showTestOverlay,
  type OverlaySetup,
} from "../../leads/callOverlay";
import {
  LEAD_TAG,
  getAutoSyncStatus,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  syncTaggedContacts,
  type AutoSyncStatus,
} from "../../leads/contactAutoSync";
import { emitLeadEvent } from "../../leads/leadEvents";
import { getLocalOrigins, localUpdatedAt, refreshLeadStore } from "../../leads/leadStore";
import { useTheme } from "../../theme/useTheme";
import { formatStamp } from "./LeadsScreen";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function syncStatusLine(s: AutoSyncStatus | null): { text: string; error: boolean } | null {
  if (!s) return null;
  if (s.lastError) return { text: `Last try failed: ${s.lastError}`, error: true };
  if (s.pending) return { text: `${s.pending} waiting to upload`, error: false };
  if (s.lastSuccessAt) return { text: `Checked ${formatStamp(new Date(s.lastSuccessAt).toISOString())}`, error: false };
  return null;
}

/** Everything that used to crowd the top of the Leads list: adding, importing, sharing, pop-up and offline copy. */
export function LeadSettingsScreen({ navigation }: any) {
  const { colors, spacing, typography, radius, touchTarget, feature } = useTheme();
  const { user } = useAuth();
  const isAdmin = api.isLeadAdmin(user);

  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  // Which list a hand-added lead is filed under: an existing name, or a new one typed here.
  const DEFAULT_LIST = "My contacts";
  const [lists, setLists] = useState<string[]>([DEFAULT_LIST]);
  const [listChoice, setListChoice] = useState(DEFAULT_LIST);
  const [newListMode, setNewListMode] = useState(false);
  const [newListName, setNewListName] = useState("");

  const [autoAdd, setAutoAdd] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStatus, setAutoStatus] = useState<AutoSyncStatus | null>(null);
  const [overlay, setOverlay] = useState<OverlaySetup | null>(null);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshAutoStatus = useCallback(() => void getAutoSyncStatus().then(setAutoStatus), []);

  useEffect(() => {
    void isAutoSyncEnabled().then(setAutoAdd);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshAutoStatus();
      void localUpdatedAt().then(setSavedAt);
      void getOverlaySetup().then(setOverlay);
    }, [refreshAutoStatus])
  );

  // Coming back from the phone's Settings after granting a permission.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && void getOverlaySetup().then(setOverlay));
    return () => sub.remove();
  }, []);

  const toggleAutoAdd = async (on: boolean) => {
    if (!on) {
      await setAutoSyncEnabled(false);
      setAutoAdd(false);
      return;
    }
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Contacts permission needed", "Allow contacts access in your phone's Settings for We Three.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    setAutoBusy(true);
    try {
      await setAutoSyncEnabled(true);
      setAutoAdd(true);
      const result = await syncTaggedContacts({ force: true });
      refreshAutoStatus();
      if (result && result.added > 0) {
        Alert.alert("Leads added", `${result.added} contact${result.added === 1 ? "" : "s"} with "${LEAD_TAG}" in the name added as leads.`);
        emitLeadEvent("leadsChanged");
      } else if (!result) {
        // The automatic upload didn't go through: offer the matches by hand.
        emitLeadEvent("showContactSuggestions", { manual: true });
      }
    } finally {
      setAutoBusy(false);
    }
  };

  const openAddLead = () => {
    setListChoice(DEFAULT_LIST);
    setNewListMode(false);
    setNewListName("");
    setAdding(true);
    const names = (found: { name: string }[]) =>
      setLists([DEFAULT_LIST, ...found.map((o) => o.name).filter((n) => n !== DEFAULT_LIST)]);
    api
      .listOrigins()
      .then(names)
      // Offline: the names from the copy on the phone.
      .catch(() => void getLocalOrigins().then(names));
  };

  const addLead = async () => {
    if (!newLead.phone.trim()) {
      Alert.alert("Phone number required");
      return;
    }
    const typedList = newListMode ? newListName.trim() : "";
    if (newListMode && !typedList) {
      Alert.alert("List name required", "Type a name for the new list, or pick one of the existing lists.");
      return;
    }
    const list = typedList || listChoice;
    setSaving(true);
    try {
      const r = await api.importLeads([{ name: newLead.name.trim(), phone: newLead.phone.trim() }], list);
      if (r.invalid) {
        Alert.alert("Invalid number", "Enter a valid 10-digit Indian mobile number.");
        return;
      }
      if (r.existing) Alert.alert("Already a lead", "This number is already in your leads.");
      setNewLead({ name: "", phone: "" });
      setAdding(false);
      emitLeadEvent("leadsChanged");
    } catch (e) {
      Alert.alert("Couldn't add lead", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const refreshCopy = async () => {
    setRefreshing(true);
    try {
      const n = await refreshLeadStore();
      setSavedAt(await localUpdatedAt());
      Alert.alert("Saved on this phone", `${n.toLocaleString("en-IN")} lead${n === 1 ? "" : "s"} are available offline.`);
    } catch (e) {
      Alert.alert("Couldn't download leads", getApiErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  const Section = ({ title }: { title: string }) => (
    <Text style={[typography.captionStrong, { color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm }]}>{title}</Text>
  );

  const Row = ({
    icon,
    title,
    subtitle,
    subtitleColor,
    onPress,
    busy,
    right,
  }: {
    icon: IconName;
    title: string;
    subtitle?: string;
    subtitleColor?: string;
    onPress?: () => void;
    busy?: boolean;
    right?: React.ReactNode;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.sm,
          minHeight: touchTarget.large,
          opacity: pressed || busy ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: feature.leads.muted, borderRadius: radius.pill }]}>
        {busy ? <ActivityIndicator size="small" color={feature.leads.solid} /> : <Ionicons name={icon} size={20} color={feature.leads.solid} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[typography.caption, { color: subtitleColor ?? colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );

  const statusLine = syncStatusLine(autoStatus);
  const overlayOn = !!overlay?.overlay && !!overlay?.phoneState;

  return (
    <ScreenContainer>
      <Section title="ADD LEADS" />
      <Row icon="person-add-outline" title="Add a lead" subtitle="Type a name and mobile number" onPress={openAddLead} />
      <Row icon="people-outline" title="From contacts" subtitle="Pick phone contacts to add" onPress={() => navigation.navigate("LeadImport")} />
      <Row
        icon="scan-outline"
        title={`Find "${LEAD_TAG}" contacts`}
        subtitle="Contacts with the tag that aren't leads yet"
        onPress={() => emitLeadEvent("showContactSuggestions", { manual: true })}
      />
      <Row
        icon="flash-outline"
        title="Auto-add tagged contacts"
        subtitle={`Any contact with "${LEAD_TAG}" in the name becomes a lead`}
        busy={autoBusy}
        right={
          <Switch
            value={autoAdd}
            disabled={autoBusy}
            onValueChange={(v) => void toggleAutoAdd(v)}
            trackColor={{ true: feature.leads.solid, false: colors.border }}
            accessibilityLabel="Auto-add contacts tagged lead"
          />
        }
      />
      {autoAdd && statusLine ? (
        <Text style={[typography.caption, { color: statusLine.error ? colors.danger : colors.textMuted, marginBottom: spacing.sm }]}>{statusLine.text}</Text>
      ) : null}

      {isAdmin ? (
        <>
          <Section title="SHEETS AND FILES" />
          <Row
            icon="grid-outline"
            title="Sheets"
            subtitle="Connect Google Sheets; their leads are saved for everyone"
            onPress={() => navigation.navigate("LeadSources")}
          />
          <Row
          icon="document-attach-outline"
          title="Import CSV"
          subtitle="Preview, then add leads from a file"
          busy={importing}
            onPress={() => void runAdminCsvImport(setImporting)}
          />
        </>
      ) : null}

      {overlay?.supported ? (
        <>
          <Section title="CALLS" />
          <Row
            icon="albums-outline"
            title="Call pop-up over other apps"
            subtitle={
              overlayOn
                ? "On: after a call, pick the stage from any app"
                : !overlay.phoneState
                  ? "Needs phone-call status permission"
                  : 'Needs "Display over other apps"'
            }
            subtitleColor={overlayOn ? colors.success : undefined}
            onPress={overlayOn ? showTestOverlay : () => void requestOverlaySetup().then(setOverlay)}
            right={<Text style={[typography.captionStrong, { color: colors.primary }]}>{overlayOn ? "Test" : "Set up"}</Text>}
          />
        </>
      ) : null}

      {Platform.OS === "android" && overlay && !overlay.supported ? (
        <>
          <Section title="CALLS" />
          <Row
            icon="albums-outline"
            title="Call pop-up over other apps"
            subtitle="Not in this phone's app version. It needs the newest APK (install it from the Firebase tester email). Until then the question still appears inside the app after a call."
          />
        </>
      ) : null}

      <Section title="OFFLINE" />
      <Row
        icon="cloud-download-outline"
        title="Leads saved on this phone"
        subtitle={savedAt ? `Updated ${formatStamp(new Date(savedAt).toISOString())}. You can search and edit offline.` : "Not downloaded yet. Opens automatically when you view leads online."}
        busy={refreshing}
        onPress={() => void refreshCopy()}
        right={<Text style={[typography.captionStrong, { color: colors.primary }]}>Refresh</Text>}
      />

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add a lead" avoidKeyboard>
        <TextField label="Name" value={newLead.name} onChangeText={(t) => setNewLead((n) => ({ ...n, name: t }))} autoCapitalize="words" />
        <TextField
          label="Mobile number"
          value={newLead.phone}
          onChangeText={(t) => setNewLead((n) => ({ ...n, phone: t }))}
          keyboardType="phone-pad"
        />
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Save under</Text>
        <FilterChipGroup>
          {lists.map((name) => (
            <FilterChip
              key={name}
              label={name}
              selected={!newListMode && listChoice === name}
              onPress={() => {
                setNewListMode(false);
                setListChoice(name);
              }}
            />
          ))}
          <FilterChip label="New list" icon="add" selected={newListMode} onPress={() => setNewListMode(true)} />
        </FilterChipGroup>
        {newListMode ? (
          <TextField label="New list name" value={newListName} onChangeText={setNewListName} placeholder="e.g. Referrals" autoCapitalize="words" />
        ) : null}
        <View style={styles.sheetButtons}>
          <Button label="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1, marginRight: 8 }} />
          <Button label={saving ? "Adding…" : "Add"} onPress={() => void addLead()} disabled={saving} style={{ flex: 1 }} />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  sheetButtons: { flexDirection: "row", marginTop: 8 },
});
