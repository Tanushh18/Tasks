import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SearchBar } from "../../components/SearchBar";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { LEAD_TAG, isAutoSyncEnabled, setAutoSyncEnabled, syncTaggedContacts } from "../../leads/contactAutoSync";
import { useTheme, type Theme } from "../../theme/useTheme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const EMPTY_FORM = { status: "", category: "", plot: "", requirement: "", address: "", budget: "", notes: "" };

/** Colour for a stage pill: done = green, dropped = red, in progress = amber, untouched = brand. */
function stageTone(status: string, colors: Theme["colors"]): { fg: string; bg: string } {
  const s = status.toLowerCase();
  if (!s || s === "new") return { fg: colors.primary, bg: colors.primaryMuted };
  if (s.includes("convert") || s.includes("won") || s.includes("closed")) return { fg: colors.success, bg: colors.successMuted };
  if (s.includes("not interested") || s.includes("lost") || s.includes("drop")) return { fg: colors.danger, bg: colors.dangerMuted };
  if (s.includes("no answer")) return { fg: colors.textMuted, bg: colors.surfaceAlt };
  return { fg: colors.warning, bg: colors.warningMuted };
}

function digitsFor(phone: string | undefined | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

export function LeadsScreen({ navigation }: any) {
  const { colors, spacing, typography, radius, touchTarget, feature } = useTheme();
  const [leads, setLeads] = useState<api.Lead[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusOptions, setStatusOptions] = useState<string[]>(api.DEFAULT_STATUS_OPTIONS);

  const [editing, setEditing] = useState<api.Lead | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "" });

  const [autoAdd, setAutoAdd] = useState(false);

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

  useEffect(() => {
    void isAutoSyncEnabled().then(setAutoAdd);
    api
      .getLeadMeta()
      .then((m) => m.statusSuggestions?.length && setStatusOptions(m.statusSuggestions))
      .catch(() => undefined);
  }, []);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const key = l.status || "New";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const visible = useMemo(
    () => (stageFilter ? leads.filter((l) => (l.status || "New") === stageFilter) : leads),
    [leads, stageFilter]
  );

  const callLead = async (phone: string) => {
    const digits = digitsFor(phone);
    if (!digits) {
      Alert.alert("Invalid number", "This lead does not have a valid phone number.");
      return;
    }
    try {
      await Linking.openURL(`tel:+${digits}`);
    } catch {
      Alert.alert("Unable to open dialer", "No phone app is available to handle this number.");
    }
  };

  const whatsappLead = async (phone: string) => {
    const digits = digitsFor(phone);
    if (!digits) return;
    try {
      await Linking.openURL(`https://wa.me/${digits}`);
    } catch {
      Alert.alert("Unable to open WhatsApp");
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await Promise.all([api.syncLeads(), syncTaggedContacts({ force: true })]);
      await load();
    } catch (e) {
      Alert.alert("Sync failed", getApiErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const toggleAutoAdd = async (on: boolean) => {
    if (!on) {
      await setAutoSyncEnabled(false);
      setAutoAdd(false);
      return;
    }
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Contacts permission needed", "Allow contacts access in your phone's Settings for We Three.");
      return;
    }
    await setAutoSyncEnabled(true);
    setAutoAdd(true);
    const result = await syncTaggedContacts({ force: true });
    if (result && result.added > 0) {
      Alert.alert("Leads added", `${result.added} contact${result.added === 1 ? "" : "s"} tagged "${LEAD_TAG}" added as leads.`);
      await load();
    }
  };

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
            ? { ...l, ...body, ...(body.plotInFarukhNagar !== undefined ? { plotManual: true } : {}) }
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

  const ActionTile = ({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: feature.leads.muted,
          borderRadius: radius.md,
          minHeight: touchTarget.large,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={feature.leads.solid} />
      <Text style={[typography.captionStrong, { color: feature.leads.solid, marginTop: 4 }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h3, { color: colors.text }]}>
            {leads.length} active lead{leads.length === 1 ? "" : "s"}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Shared with everyone on your lists</Text>
        </View>
        <Pressable
          onPress={sync}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync leads now"
          style={({ pressed }) => [
            styles.roundButton,
            {
              width: touchTarget.min,
              height: touchTarget.min,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
              opacity: pressed || syncing ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name="sync" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.tiles, { gap: spacing.sm, marginTop: spacing.lg }]}>
        <ActionTile icon="person-add-outline" label="Add lead" onPress={() => setAdding(true)} />
        <ActionTile icon="people-outline" label="From contacts" onPress={() => navigation.navigate("LeadImport")} />
        <ActionTile icon="share-social-outline" label="Sheets & share" onPress={() => navigation.navigate("LeadSources")} />
      </View>

      <View
        style={[
          styles.autoRow,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
        ]}
      >
        <Ionicons name="flash-outline" size={20} color={feature.leads.solid} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.captionStrong, { color: colors.text }]}>Auto-add tagged contacts</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {`Save a contact as "Ramesh ${LEAD_TAG}" and it becomes a lead`}
          </Text>
        </View>
        <Switch
          value={autoAdd}
          onValueChange={(v) => void toggleAutoAdd(v)}
          trackColor={{ true: feature.leads.solid, false: colors.border }}
          accessibilityLabel="Auto-add contacts tagged lead"
        />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone or stage" />
      </View>

      {stageCounts.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <FilterChipGroup>
            <FilterChip label={`All ${leads.length}`} selected={!stageFilter} onPress={() => setStageFilter(null)} />
            {stageCounts.map(([stage, count]) => (
              <FilterChip
                key={stage}
                label={`${stage} ${count}`}
                selected={stageFilter === stage}
                onPress={() => setStageFilter(stageFilter === stage ? null : stage)}
              />
            ))}
          </FilterChipGroup>
        </View>
      ) : null}
    </View>
  );

  const renderLead = ({ item }: { item: api.Lead }) => {
    const tone = stageTone(item.status, colors);
    const details = [item.requirement, item.address, item.budget].filter(Boolean).join(" • ");
    return (
      <Pressable
        onPress={() => openEditor(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name || "Lead"}, ${item.status || "New"}. Tap to edit.`}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.lg,
            marginBottom: spacing.md,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {item.name || "Unnamed lead"}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.phone}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[typography.captionStrong, { color: tone.fg }]} numberOfLines={1}>
              {item.status || "New"}
            </Text>
          </View>
        </View>

        {item.category || item.plotInFarukhNagar ? (
          <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
            {item.category ? (
              <View style={[styles.pill, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[typography.caption, { color: colors.text }]}>{item.category}</Text>
              </View>
            ) : null}
            {item.plotInFarukhNagar ? (
              <View style={[styles.pill, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[typography.caption, { color: colors.text }]}>Plot {item.plotInFarukhNagar}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {details ? (
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]} numberOfLines={2}>
            {details}
          </Text>
        ) : null}
        {item.notes ? (
          <Text style={[typography.caption, { color: colors.text, marginTop: spacing.xs }]} numberOfLines={2}>
            {item.notes}
          </Text>
        ) : null}

        <View style={[styles.cardActions, { marginTop: spacing.md, gap: spacing.sm }]}>
          <Pressable
            onPress={() => void callLead(item.phone)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${item.name || "lead"}`}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: touchTarget.min, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="call" size={16} color={colors.onPrimary} />
            <Text style={[typography.captionStrong, { color: colors.onPrimary }]}>Call</Text>
          </Pressable>
          <Pressable
            onPress={() => void whatsappLead(item.phone)}
            accessibilityRole="button"
            accessibilityLabel={`WhatsApp ${item.name || "lead"}`}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.successMuted, borderRadius: radius.pill, minHeight: touchTarget.min, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
            <Text style={[typography.captionStrong, { color: colors.success }]}>WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={() => openEditor(item)}
            accessibilityRole="button"
            accessibilityLabel={`Update ${item.name || "lead"}`}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, minHeight: touchTarget.min, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="create-outline" size={16} color={colors.text} />
            <Text style={[typography.captionStrong, { color: colors.text }]}>Update</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer scroll={false} edges={["left", "right"]} contentStyle={{ flex: 1, paddingBottom: 0 }}>
      {error ? (
        <>
          {header}
          <ErrorState message={error} onRetry={load} />
        </>
      ) : (
        <FlatList
          data={loading ? [] : visible}
          keyExtractor={(x) => x.id}
          renderItem={renderLead}
          ListHeaderComponent={<View style={{ marginBottom: spacing.md }}>{header}</View>}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshing={false}
          onRefresh={() => void load()}
          ListEmptyComponent={
            loading ? (
              <SkeletonLines count={5} />
            ) : (
              <EmptyState
                title={stageFilter ? `No leads in "${stageFilter}"` : "No leads yet"}
                subtitle={stageFilter ? "Pick another stage above." : "Add a lead, pick from contacts, or connect a Google Sheet."}
                icon="people-outline"
              />
            )
          }
        />
      )}

      <BottomSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name || "Lead"}
        subtitle={editing?.phone}
        avoidKeyboard
      >
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Stage</Text>
        <FilterChipGroup>
          {statusOptions.map((opt) => (
            <FilterChip
              key={opt}
              label={opt}
              selected={form.status === opt}
              onPress={() => setForm((f) => ({ ...f, status: f.status === opt ? "" : opt }))}
            />
          ))}
        </FilterChipGroup>
        <View style={{ marginTop: spacing.md }}>
          <TextField
            label="Or type a custom stage"
            value={statusOptions.includes(form.status) ? "" : form.status}
            onChangeText={(t) => setForm((f) => ({ ...f, status: t }))}
            placeholder="e.g. Token received"
          />
        </View>

        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Category</Text>
        <FilterChipGroup>
          {api.CATEGORY_OPTIONS.map((opt) => (
            <FilterChip
              key={opt}
              label={opt}
              selected={form.category === opt}
              onPress={() => setForm((f) => ({ ...f, category: f.category === opt ? "" : opt }))}
            />
          ))}
        </FilterChipGroup>
        <View style={{ height: spacing.lg }} />

        <TextField label="Plot in Farukh Nagar" value={form.plot} onChangeText={(t) => setForm((f) => ({ ...f, plot: t }))} />
        <TextField
          label="Requirement"
          value={form.requirement}
          onChangeText={(t) => setForm((f) => ({ ...f, requirement: t }))}
          multiline
        />
        <TextField label="Budget" value={form.budget} onChangeText={(t) => setForm((f) => ({ ...f, budget: t }))} />
        <TextField label="Address" value={form.address} onChangeText={(t) => setForm((f) => ({ ...f, address: t }))} />
        <TextField label="Notes" value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))} multiline />

        <View style={[styles.sheetButtons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button label="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add a lead" avoidKeyboard>
        <TextField label="Name" value={newLead.name} onChangeText={(t) => setNewLead((n) => ({ ...n, name: t }))} autoCapitalize="words" />
        <TextField
          label="Mobile number"
          value={newLead.phone}
          onChangeText={(t) => setNewLead((n) => ({ ...n, phone: t }))}
          keyboardType="phone-pad"
          placeholder="10-digit mobile number"
        />
        <View style={[styles.sheetButtons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
          <Button label="Add lead" onPress={addLead} loading={saving} style={{ flex: 1 }} />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center" },
  roundButton: { alignItems: "center", justifyContent: "center" },
  tiles: { flexDirection: "row" },
  tile: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 4 },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: StyleSheet.hairlineWidth },
  card: { borderWidth: StyleSheet.hairlineWidth },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, maxWidth: 170 },
  cardActions: { flexDirection: "row" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  sheetButtons: { flexDirection: "row", marginTop: 8 },
});
