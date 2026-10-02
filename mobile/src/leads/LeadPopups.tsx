import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts/legacy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Keyboard, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../api/client";
import * as api from "../api/leads";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { FilterChip, FilterChipGroup } from "../components/FilterChip";
import { TextField } from "../components/TextField";
import { useFeatureFlags } from "../features/FeatureFlagsContext";
import { useTheme } from "../theme/useTheme";
import {
  QUICK_STATUSES,
  cancelNotification,
  dueCall,
  getPendingCalls,
  saveCallOutcome,
  snoozeCall,
  type PendingCall,
} from "./callFollowUp";
import { LEAD_TAG, dismissSuggestions, findContactSuggestions, uploadTaggedContacts, type TaggedContact } from "./contactAutoSync";
import { emitLeadEvent, onLeadEvent } from "./leadEvents";

function useLeadsActive() {
  const { isAuthenticated } = useAuth();
  const { flags } = useFeatureFlags();
  return isAuthenticated && flags.leads;
}

/** Card frame shared by both popups: a centred card over whatever screen is open. */
function PopupCard({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { colors, radius, spacing, shadow } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.45)", padding: spacing.lg }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.card, shadow.raised, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }]}>{children}</View>
      </View>
    </Modal>
  );
}

function CloseButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors, radius, touchTarget } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.close,
        { minWidth: touchTarget.min, minHeight: touchTarget.min, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name="close" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Asks for the stage of a lead the person just called. Appears over any screen once they are back in
 * the app and not typing; ✕ means "remind me later" (popup again later, or a notification).
 */
export function CallFollowUpHost() {
  const active = useLeadsActive();
  const { colors, spacing, typography } = useTheme();
  const [call, setCall] = useState<PendingCall | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const keyboardOpen = useRef(false);
  const showing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!active || showing.current) return;
    const list = await getPendingCalls();
    if (!list.length) return;
    const due = dueCall(list);
    // Only when they're actually looking at the app and not in the middle of typing something.
    if (due && AppState.currentState === "active" && !keyboardOpen.current) {
      showing.current = true;
      setCall(due);
      setPendingCount(list.length);
      setStatus("");
      setNote("");
      setShowAll(false);
      void cancelNotification(due.leadId);
      return;
    }
    const next = Math.min(...list.map((c) => c.nextAt));
    const wait = Math.min(Math.max(next - Date.now(), 1_000), 60_000) + 300;
    timer.current = setTimeout(() => void check(), keyboardOpen.current ? 5_000 : wait);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const kbShow = Keyboard.addListener("keyboardDidShow", () => (keyboardOpen.current = true));
    const kbHide = Keyboard.addListener("keyboardDidHide", () => (keyboardOpen.current = false));
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") setTimeout(() => void check(), 1_500);
    });
    const off = onLeadEvent("callsChanged", () => void check());
    void check();
    return () => {
      kbShow.remove();
      kbHide.remove();
      app.remove();
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, check]);

  const finish = () => {
    showing.current = false;
    setCall(null);
    setTimeout(() => void check(), 600);
  };

  const later = async () => {
    if (!call) return;
    await snoozeCall(call.leadId);
    finish();
  };

  const save = async () => {
    if (!call || !status) return;
    setSaving(true);
    try {
      await saveCallOutcome(call, status, note);
      finish();
    } catch (e) {
      Alert.alert("Couldn't save", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const options = showAll ? api.DEFAULT_STATUS_OPTIONS.filter((s) => s !== "New") : QUICK_STATUSES;

  return (
    <PopupCard visible={!!call} onClose={() => void later()}>
      {call ? (
        <>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {pendingCount > 1 ? `Call follow-up · ${pendingCount} waiting` : "Call follow-up"}
              </Text>
              <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]} numberOfLines={1}>
                {call.name || "Lead"}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {call.phone} · now: {call.status || "New"}
              </Text>
            </View>
            <CloseButton onPress={() => void later()} label="Remind me later" />
          </View>

          <Text style={[typography.bodyStrong, { color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm }]}>
            How did the call go?
          </Text>
          <FilterChipGroup>
            {options.map((s) => (
              <FilterChip key={s} label={s} selected={status === s} onPress={() => setStatus(status === s ? "" : s)} />
            ))}
            {!showAll ? <FilterChip label="More…" icon="ellipsis-horizontal" onPress={() => setShowAll(true)} /> : null}
          </FilterChipGroup>
          <View style={{ marginTop: spacing.md }}>
            <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Call back Monday" multiline />
          </View>
          <View style={[styles.row, { gap: spacing.md }]}>
            <Button label="Remind me later" variant="secondary" onPress={later} style={{ flex: 1 }} />
            <Button label="Save" onPress={save} loading={saving} disabled={!status} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
    </PopupCard>
  );
}

const AUTO_POPUP_GAP_MS = 6 * 60 * 60 * 1000;
let lastAutoPopup = 0;

/** "Matching contacts found": phone contacts with "lead" in the name that aren't leads yet. */
export function ContactSuggestionsHost() {
  const active = useLeadsActive();
  const { colors, spacing, typography, radius } = useTheme();
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TaggedContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  const open = useCallback(
    async (isManual: boolean) => {
      if (!active) return;
      if (!isManual && Date.now() - lastAutoPopup < AUTO_POPUP_GAP_MS) return;
      if (isManual) {
        const perm = await Contacts.requestPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Contacts permission needed", "Allow contacts access for We Three to find contacts saved with \"lead\" in the name.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]);
          return;
        }
        setManual(true);
        setVisible(true);
        setLoading(true);
        setError(null);
        setItems([]);
      }
      try {
        const found = await findContactSuggestions({ includeDismissed: isManual });
        if (!isManual) {
          if (!found.length) return;
          lastAutoPopup = Date.now();
          setManual(false);
          setError(null);
          setVisible(true);
        }
        setItems(found);
        setSelected(new Set(found.map((f) => f.key)));
      } catch (e) {
        if (isManual) setError(e instanceof Error ? e.message : "We couldn't read your contacts.");
      } finally {
        setLoading(false);
      }
    },
    [active]
  );

  useEffect(() => onLeadEvent("showContactSuggestions", ({ manual: m }) => void open(m)), [open]);

  const close = async (dismiss: boolean) => {
    if (dismiss && items.length) await dismissSuggestions(items).catch(() => undefined);
    setVisible(false);
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const upload = async () => {
    const chosen = items.filter((i) => selected.has(i.key));
    if (!chosen.length) return;
    setUploading(true);
    try {
      const r = await uploadTaggedContacts(chosen);
      // Anything left unticked shouldn't keep popping up.
      await dismissSuggestions(items.filter((i) => !selected.has(i.key))).catch(() => undefined);
      setVisible(false);
      emitLeadEvent("leadsChanged");
      Alert.alert(
        "Leads uploaded",
        [`${r.added} added`, r.existing ? `${r.existing} already leads` : "", r.invalid ? `${r.invalid} not valid mobile numbers` : ""]
          .filter(Boolean)
          .join(" · ")
      );
    } catch (e) {
      Alert.alert("Upload failed", `${getApiErrorMessage(e)}\nNothing was lost. Try again when you're online.`);
    } finally {
      setUploading(false);
    }
  };

  const allOn = items.length > 0 && items.every((i) => selected.has(i.key));

  return (
    <PopupCard visible={visible} onClose={() => void close(!manual)}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
            {loading ? "Scanning contacts…" : items.length ? `${items.length} matching contact${items.length === 1 ? "" : "s"} found` : "No new matches"}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{`Contacts with "${LEAD_TAG}" in the name that aren't leads yet`}</Text>
        </View>
        <CloseButton onPress={() => void close(!manual)} label="Close" />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: spacing.xl }} color={colors.primary} />
      ) : error ? (
        <Text style={[typography.body, { color: colors.danger, marginVertical: spacing.lg }]}>{error}</Text>
      ) : items.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted, marginVertical: spacing.lg }]}>
          {`Save a contact with "${LEAD_TAG}" anywhere in the name (e.g. "Ramesh lead") and it shows up here.`}
        </Text>
      ) : (
        <>
          <Pressable onPress={() => setSelected(allOn ? new Set() : new Set(items.map((i) => i.key)))} style={{ paddingVertical: spacing.sm }}>
            <Text style={[typography.captionStrong, { color: colors.primary }]}>{allOn ? "Deselect all" : "Select all"}</Text>
          </Pressable>
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => {
              const on = selected.has(item.key);
              return (
                <Pressable
                  onPress={() => toggle(item.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.contactRow, { borderBottomColor: colors.border, paddingVertical: spacing.sm }]}
                >
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.textFaint} />
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{item.phone}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </>
      )}

      <View style={[styles.row, { gap: spacing.md }]}>
        <Button label={items.length ? "Not now" : "Close"} variant="secondary" onPress={() => close(!manual || !items.length)} style={{ flex: 1 }} />
        {items.length ? (
          <Button label={`Upload ${selected.size}`} onPress={upload} loading={uploading} disabled={!selected.size} style={{ flex: 1, borderRadius: radius.md }} />
        ) : null}
      </View>
    </PopupCard>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center" },
  card: { width: "100%", maxWidth: 480, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  close: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", marginTop: 16 },
  contactRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
});
