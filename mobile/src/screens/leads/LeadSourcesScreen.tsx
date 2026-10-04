import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { useAuth } from "../../auth/AuthContext";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { runAdminCsvImport } from "../../leads/adminCsvImport";
import { useTheme } from "../../theme/useTheme";

export function LeadSourcesScreen() {
  const { colors, spacing, typography, radius, feature, touchTarget } = useTheme();
  const { user } = useAuth();
  const [sources, setSources] = useState<api.LeadSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [allTabs, setAllTabs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  // Linking sheets and importing files are admin tools; the server enforces this too.
  const isAdmin = api.isLeadAdmin(user);
  const [shareFor, setShareFor] = useState<api.LeadSource | null>(null);
  const [shareNumber, setShareNumber] = useState("");
  const [syncBusy, setSyncBusy] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<api.LeadSource | null>(null);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      setSources(await api.listSources());
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const add = async () => {
    if (!url.trim()) {
      Alert.alert("Google Sheet link required");
      return;
    }
    setBusy(true);
    try {
      const res = await api.addSource(url.trim(), label.trim(), allTabs);
      if (res?.result?.error) Alert.alert("Sheet added, but it couldn't be read yet", String(res.result.error));
      setUrl("");
      setLabel("");
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert("Couldn't add sheet", getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!shareFor || !shareNumber.trim()) return;
    setBusy(true);
    try {
      await api.shareSource(shareFor.id, shareNumber.trim());
      setShareNumber("");
      setShareFor(null);
      await load();
    } catch (e) {
      Alert.alert("Couldn't share", getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const unshare = async (sourceId: string, userId: string) => {
    try {
      await api.unshareSource(sourceId, userId);
      await load();
    } catch (e) {
      Alert.alert("Couldn't update sharing", getApiErrorMessage(e));
    }
  };

  const confirm = (title: string, message: string, action: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Yes", style: "destructive", onPress: () => void action() },
    ]);

  const toggleSync = async (s: api.LeadSource, on: boolean) => {
    setSyncBusy(s.id);
    try {
      await api.setSourceSync(s.id, on);
      await load();
    } catch (e) {
      Alert.alert("Couldn't change sync", getApiErrorMessage(e));
    } finally {
      setSyncBusy(null);
    }
  };

  const rename = async () => {
    if (!renameFor) return;
    const name = newName.trim();
    if (!name) {
      Alert.alert("Name required");
      return;
    }
    setBusy(true);
    try {
      await api.renameSource(renameFor.id, name);
      setRenameFor(null);
      await load();
    } catch (e) {
      Alert.alert("Couldn't rename", getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const removeSheet = (s: api.LeadSource) =>
    confirm("Remove this sheet?", "Its leads stay in your list unless no other sheet has them.", async () => {
      try {
        await api.deleteSource(s.id);
        await load();
      } catch (e) {
        Alert.alert("Couldn't remove sheet", getApiErrorMessage(e));
      }
    });

  const renderSource = (s: api.LeadSource) => {
    const manual = s.kind === "manual";
    const imported = s.kind === "import";
    const subtitle = manual
      ? "Leads added from contacts or by hand"
      : imported
        ? "Imported list"
        : s.isOwner
          ? `${s.allTabs ? "Every tab · " : ""}${s.url ?? ""}`
          : "Shared list";
    return (
      <View
        key={s.id}
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: feature.leads.muted, borderRadius: radius.md }]}>
            <Ionicons name={manual ? "people" : imported ? "cloud-upload-outline" : "grid-outline"} size={20} color={feature.leads.solid} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {api.sourceLabel(s)}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {!s.isOwner ? (
            <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Shared with you</Text>
            </View>
          ) : null}
        </View>

        {s.isOwner && s.lastError ? (
          <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{s.lastError}</Text>
        ) : null}

        {s.isOwner && s.kind === "sheet" ? (
          <View style={[styles.syncRow, { marginTop: spacing.sm, gap: spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.captionStrong, { color: colors.text }]}>Sync from sheet</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {s.enabled
                  ? `Connected: new rows are added ${s.allTabs ? "about every 5 minutes" : "within seconds"}. Leads already here are never changed by the sheet.`
                  : "Not connected: nothing is read from the sheet. Its leads stay in the app."}
              </Text>
            </View>
            <Switch
              value={s.enabled}
              disabled={syncBusy === s.id}
              onValueChange={(v) => void toggleSync(s, v)}
              trackColor={{ true: feature.leads.solid, false: colors.border }}
              accessibilityLabel={`Sync ${api.sourceLabel(s)} from its sheet`}
            />
          </View>
        ) : null}

        {s.sharedWith.length > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>Shared with</Text>
            {s.sharedWith.map((m) => (
              <View key={m.id} style={[styles.memberRow, { borderTopColor: colors.border, minHeight: touchTarget.min }]}>
                <Ionicons name="person-circle-outline" size={22} color={colors.textMuted} />
                <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {m.name} · {m.mobileNumber}
                </Text>
                {s.isOwner ? (
                  <Pressable
                    onPress={() => confirm("Stop sharing?", `${m.name} will no longer see these leads.`, () => unshare(s.id, m.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Stop sharing with ${m.name}`}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.buttons, { gap: spacing.sm, marginTop: spacing.md }]}>
          {s.isOwner ? (
            <>
              <Button label="Rename" variant="secondary" onPress={() => { setRenameFor(s); setNewName(s.label || ""); }} style={{ flex: 1 }} />
              <Button label="Share" variant="secondary" onPress={() => setShareFor(s)} style={{ flex: 1 }} />
              {!manual ? <Button label="Remove" variant="ghost" onPress={() => removeSheet(s)} style={{ flex: 1 }} /> : null}
            </>
          ) : (
            <Button
              label="Leave"
              variant="ghost"
              onPress={() => {
                if (user) confirm("Leave this list?", "You'll stop seeing these leads.", () => unshare(s.id, user.id));
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.md }]}>
        Everyone a list is shared with sees and edits the same leads.
      </Text>
      {isAdmin ? (
        <View style={[styles.buttons, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          <Button label="Add Google Sheet" onPress={() => setAdding(true)} style={{ flex: 1 }} />
          <Button
            label="Import CSV"
            variant="secondary"
            loading={importing}
            onPress={() => runAdminCsvImport(setImporting).then(load)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !loaded ? (
        <LoadingState label="Loading your sheets…" />
      ) : sources.length === 0 ? (
        <EmptyState
          title="No lists yet"
          subtitle={isAdmin ? "Add a Google Sheet, import a CSV, or add leads from your contacts." : "Add leads from your contacts, then share your list here."}
          icon="document-outline"
        />
      ) : (
        sources.map(renderSource)
      )}

      <BottomSheet visible={!!renameFor} onClose={() => setRenameFor(null)} title="Rename list" subtitle={renameFor ? api.sourceLabel(renameFor) : undefined} avoidKeyboard>
        <TextField label="Name" value={newName} onChangeText={setNewName} placeholder="e.g. Meta Sheet" autoCapitalize="words" />
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 8 }}>
          <Button label="Cancel" variant="secondary" onPress={() => setRenameFor(null)} style={{ flex: 1 }} />
          <Button label="Save" onPress={() => void rename()} loading={busy} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add Google Sheet" avoidKeyboard>
        <TextField label="Label (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Facebook ads" />
        <TextField
          label="Google Sheets link"
          value={url}
          onChangeText={setUrl}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          autoCapitalize="none"
        />
        <View style={[styles.switchRow, { marginBottom: spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Read every tab</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Off = only the tab in the link</Text>
          </View>
          <Switch value={allTabs} onValueChange={setAllTabs} accessibilityLabel="Read every tab" />
        </View>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.lg }]}>
          Share the sheet as "Anyone with the link can view". Any column order works. Rows without a valid mobile number are skipped.
        </Text>
        <View style={[styles.buttons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
          <Button label="Add sheet" onPress={add} loading={busy} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={!!shareFor}
        onClose={() => setShareFor(null)}
        title="Share with"
        subtitle={shareFor ? shareFor.label || (shareFor.kind === "manual" ? "My contacts" : "Google Sheet") : undefined}
        avoidKeyboard
      >
        <TextField
          label="Mobile number"
          value={shareNumber}
          onChangeText={setShareNumber}
          placeholder="Number they use to log in to We Three"
          keyboardType="phone-pad"
        />
        <View style={[styles.buttons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setShareFor(null)} style={{ flex: 1 }} />
          <Button label="Share" onPress={share} loading={busy} style={{ flex: 1 }} />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  syncRow: { flexDirection: "row", alignItems: "center" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  buttons: { flexDirection: "row" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
