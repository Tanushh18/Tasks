import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { SkeletonLines } from "../../components/Skeleton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";

export function LeadsScreen({ navigation }: any) {
  const { colors, spacing, typography, radius, touchTarget } = useTheme();
  const [leads, setLeads] = useState<api.Lead[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<api.Lead | null>(null);
  const [form, setForm] = useState({
    status: "",
    category: "",
    plot: "",
    requirement: "",
    address: "",
    budget: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "" });
  const [statusOptions, setStatusOptions] = useState<string[]>(api.DEFAULT_STATUS_OPTIONS);

  useEffect(() => {
    api
      .getLeadMeta()
      .then((m) => m.statusSuggestions?.length && setStatusOptions(m.statusSuggestions))
      .catch(() => undefined);
  }, []);

  const openEditor = (lead: api.Lead) => {
    setForm({
      status: lead.status || "",
      category: lead.category || "",
      plot: lead.plotInFarukhNagar || "",
      requirement: lead.requirement || "",
      address: lead.address || "",
      budget: lead.budget || "",
      notes: lead.notes || "",
    });
    setEditing(lead);
  };

  const addLead = async () => {
    if (!newLead.phone.trim()) {
      Alert.alert("Phone number required");
      return;
    }
    setSaving(true);
    try {
      const r = await api.importLeads([{ name: newLead.name.trim(), phone: newLead.phone.trim() }]);
      if (r.invalid) {
        Alert.alert("Invalid number", "Enter a valid 10-digit Indian mobile number.");
        return;
      }
      if (r.existing) Alert.alert("Already a lead", "This number is already in your leads.");
      setNewLead({ name: "", phone: "" });
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert("Couldn't add lead", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const body: Partial<api.Lead> = {
      status: form.status.trim(),
      category: form.category.trim(),
      requirement: form.requirement.trim(),
      address: form.address.trim(),
      budget: form.budget.trim(),
      notes: form.notes.trim(),
    };
    if (form.plot.trim() !== (editing.plotInFarukhNagar || "")) body.plotInFarukhNagar = form.plot.trim();
    setSaving(true);
    try {
      await api.updateLead(editing.id, body);
      // Merge locally: if the phone was offline the save is queued and the reply has no lead in it.
      setLeads((prev) =>
        prev.map((l) =>
          l.id === editing.id
            ? {
                ...l,
                ...body,
                ...(body.plotInFarukhNagar !== undefined ? { plotManual: true } : {}),
              }
            : l
        )
      );
      setEditing(null);
    } catch (e) {
      Alert.alert("Couldn't save", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeads(await api.listLeads(search));
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't load your leads."));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Leads are shared: quietly pick up edits made by other people on the same sheet.
      const timer = setInterval(() => {
        api.listLeads(search).then(setLeads).catch(() => {});
      }, 20000);
      return () => clearInterval(timer);
    }, [load, search])
  );

  const callLead = async (phone: string | undefined | null) => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!digits) {
      Alert.alert("Invalid number", "This lead does not have a valid phone number.");
      return;
    }
    try {
      await Linking.openURL(`tel:+${digits.startsWith("91") ? digits : "91" + digits}`);
    } catch {
      Alert.alert("Unable to open dialer", "No phone app is available to handle this number.");
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await api.syncLeads();
      await load();
    } catch (e) {
      Alert.alert("Sync failed", getApiErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View>
          <Text style={[typography.h1, { color: colors.text }]}>Leads</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{leads.length} active leads</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 18 }}>
          <Pressable onPress={() => setAdding(true)} accessibilityLabel="Add a lead">
            <Ionicons name="person-add-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate("LeadImport")} accessibilityLabel="Add leads from contacts">
            <Ionicons name="people-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate("LeadSources")}>
            <Ionicons name="document-text-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={sync} disabled={syncing}>
            <Ionicons name="sync" size={24} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.search,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.md,
            minHeight: touchTarget.comfortable,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone or status"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { color: colors.text }]}
        />
      </View>

      {loading ? (
        <SkeletonLines count={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{
            paddingVertical: spacing.md,
            paddingBottom: 40,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <EmptyState
              title="No leads yet"
              subtitle="Open the sheet icon to connect a Google Sheet."
              icon="people-outline"
            />
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <Pressable onPress={() => openEditor(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.name || "lead"}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]}>
                  {item.name || "Unnamed lead"}
                </Text>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </View>
              </Pressable>
              <View style={styles.phoneRow}>
                <Text style={[typography.body, { color: colors.textMuted, marginTop: 4 }]}>
                  {item.phone}
                </Text>
                <Pressable
                  onPress={() => void callLead(item.phone)}
                  style={[styles.callButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${item.name || "lead"}`}
                >
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={styles.callText}>Call</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <Text style={[styles.pill, { color: colors.text, backgroundColor: colors.surfaceAlt }]}>
                  {item.category || "Uncategorised"}
                </Text>
                <Text style={[styles.pill, { color: colors.text, backgroundColor: colors.surfaceAlt }]}>
                  {item.status || "New"}
                </Text>
                {item.plotInFarukhNagar ? (
                  <Text
                    style={[styles.pill, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
                  >
                    Plot: {item.plotInFarukhNagar}
                  </Text>
                ) : null}
              </View>
              {item.requirement || item.address || item.budget || item.notes ? (
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
                  {[item.requirement, item.address, item.budget, item.notes].filter(Boolean).join(" • ")}
                </Text>
              ) : null}
            </Card>
          )}
        />
      )}

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <Text style={[typography.h2, { color: colors.text }]}>Add a lead</Text>
            <TextInput
              value={newLead.name}
              onChangeText={(t) => setNewLead((n) => ({ ...n, name: t }))}
              placeholder="Name"
              placeholderTextColor={colors.textFaint}
              style={[styles.field, { color: colors.text, borderColor: colors.border }]}
            />
            <TextInput
              value={newLead.phone}
              onChangeText={(t) => setNewLead((n) => ({ ...n, phone: t }))}
              placeholder="Mobile number"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={[styles.field, { color: colors.text, borderColor: colors.border }]}
            />
            <View style={styles.actions}>
              <Pressable onPress={() => setAdding(false)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addLead} disabled={saving}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{saving ? "Adding…" : "Add"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.overlay}
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <Text style={[typography.h2, { color: colors.text }]}>{editing?.name || "Lead"}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 8 }]}>{editing?.phone}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Status / stage</Text>
              <View style={styles.chips}>
                {statusOptions.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => setForm((f) => ({ ...f, status: opt }))}
                    style={[
                      styles.chip,
                      { backgroundColor: form.status === opt ? colors.primary : colors.surfaceAlt },
                    ]}
                  >
                    <Text style={{ color: form.status === opt ? "#fff" : colors.text, fontSize: 12 }}>{opt}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={form.status}
                onChangeText={(t) => setForm((f) => ({ ...f, status: t }))}
                placeholder="Or type your own stage"
                placeholderTextColor={colors.textFaint}
                style={[styles.field, { color: colors.text, borderColor: colors.border }]}
              />

              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 10 }]}>Category</Text>
              <View style={styles.chips}>
                {api.CATEGORY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => setForm((f) => ({ ...f, category: opt }))}
                    style={[
                      styles.chip,
                      { backgroundColor: form.category === opt ? colors.primary : colors.surfaceAlt },
                    ]}
                  >
                    <Text style={{ color: form.category === opt ? "#fff" : colors.text, fontSize: 12 }}>{opt}</Text>
                  </Pressable>
                ))}
              </View>

              {(
                [
                  ["plot", "Plot in Farukh Nagar"],
                  ["requirement", "Requirement"],
                  ["address", "Address"],
                  ["budget", "Budget"],
                  ["notes", "Notes"],
                ] as const
              ).map(([key, label]) => (
                <TextInput
                  key={key}
                  value={form[key]}
                  onChangeText={(t) => setForm((f) => ({ ...f, [key]: t }))}
                  placeholder={label}
                  placeholderTextColor={colors.textFaint}
                  multiline={key === "notes" || key === "requirement"}
                  style={[styles.field, { color: colors.text, borderColor: colors.border, marginTop: 10 }]}
                />
              ))}
            </ScrollView>
            <View style={styles.actions}>
              <Pressable onPress={() => setEditing(null)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={save} disabled={saving}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { padding: 16, margin: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  field: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, marginTop: 8, fontSize: 15 },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  callText: {
    color: "#fff",
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
  },
});
