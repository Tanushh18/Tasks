import React, { useCallback, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/useTheme";

export function LeadSourcesScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { user } = useAuth();
  const [sources, setSources] = useState<api.LeadSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareFor, setShareFor] = useState<api.LeadSource | null>(null);
  const [shareNumber, setShareNumber] = useState("");

  const load = useCallback(async () => {
    try {
      setSources(await api.listSources());
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
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
      await api.addSource(url.trim(), label.trim());
      setUrl("");
      setLabel("");
      setVisible(false);
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

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[typography.h1, { color: colors.text }]}>Lead Sheets</Text>
        <Pressable onPress={() => setVisible(true)}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>Add</Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : sources.length === 0 ? (
        <EmptyState
          title="No sheets connected"
          subtitle="Add a Google Sheet tab to import leads."
          icon="document-outline"
        />
      ) : (
        sources.map((s) => (
          <Card key={s.id} style={{ marginBottom: spacing.md }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>
              {s.label || "Google Sheet"}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
              {s.url}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: s.lastError ? colors.danger : colors.textMuted, marginTop: 6 },
              ]}
            >
              {s.lastError || "Syncs automatically every 15 seconds"}
            </Text>
            {s.isOwner ? null : (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 6 }]}>
                Shared with you
              </Text>
            )}
            {s.sharedWith.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <Text style={[typography.caption, { color: colors.text }]}>
                  {m.name} · {m.mobileNumber}
                </Text>
                {s.isOwner ? (
                  <Pressable onPress={() => void unshare(s.id, m.id)}>
                    <Text style={{ color: colors.danger }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {s.isOwner ? (
              <View style={styles.memberRow}>
                <Pressable onPress={() => setShareFor(s)}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Share</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    try {
                      await api.deleteSource(s.id);
                      await load();
                    } catch (e) {
                      Alert.alert("Couldn't remove sheet", getApiErrorMessage(e));
                    }
                  }}
                >
                  <Text style={{ color: colors.danger }}>Remove sheet</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  if (user) void unshare(s.id, user.id);
                }}
                style={{ marginTop: 10 }}
              >
                <Text style={{ color: colors.danger }}>Leave sheet</Text>
              </Pressable>
            )}
          </Card>
        ))
      )}

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View
            style={[
              styles.modal,
              { backgroundColor: colors.surface, borderRadius: radius.lg },
            ]}
          >
            <Text style={[typography.h2, { color: colors.text }]}>Add Google Sheet</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Label (optional)"
              placeholderTextColor={colors.textFaint}
              style={[styles.field, { color: colors.text, borderColor: colors.border }]}
            />
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="Paste Google Sheets link"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              style={[styles.field, { color: colors.text, borderColor: colors.border }]}
            />
            <View style={styles.actions}>
              <Pressable onPress={() => setVisible(false)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={add} disabled={busy}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {busy ? "Adding…" : "Add Sheet"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!shareFor} transparent animationType="slide" onRequestClose={() => setShareFor(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <Text style={[typography.h2, { color: colors.text }]}>Share with</Text>
            <TextInput
              value={shareNumber}
              onChangeText={setShareNumber}
              placeholder="Mobile number of a We Three user"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={[styles.field, { color: colors.text, borderColor: colors.border }]}
            />
            <View style={styles.actions}>
              <Pressable onPress={() => setShareFor(null)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={share} disabled={busy}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{busy ? "Sharing…" : "Share"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  memberRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,.35)",
  },
  modal: {
    padding: 20,
  },
  field: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 50,
    marginTop: 12,
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 24,
    marginTop: 20,
  },
});
