import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts/legacy";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, FlatList, Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../auth/AuthContext";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SearchBar } from "../../components/SearchBar";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { runAdminCsvImport } from "../../leads/adminCsvImport";
import { QUICK_STATUSES, registerCall } from "../../leads/callFollowUp";
import {
  getOverlaySetup,
  overlaySupported,
  requestOverlaySetup,
  showTestOverlay,
  startCallWatch,
  wasOverlaySetupOffered,
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
import { emitLeadEvent, onLeadEvent } from "../../leads/leadEvents";
import { bypassCacheBriefly } from "../../offline/httpCache";
import { useTheme, type Theme } from "../../theme/useTheme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** The list opens on new leads: the ones nobody has called yet. */
export const DEFAULT_STAGE = "New";
const ALL = "all";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fields the update sheet keeps out of the way until someone asks for them (or they already have a value). */
const OPTIONAL_FIELDS = [
  { key: "category", label: "Category" },
  { key: "plot", label: "Plot in Farukh Nagar" },
  { key: "requirement", label: "Requirement" },
  { key: "budget", label: "Budget" },
  { key: "address", label: "Address" },
  { key: "email", label: "Email" },
] as const;
type OptionalKey = (typeof OPTIONAL_FIELDS)[number]["key"];

const EMPTY_FORM = { status: "", notes: "", category: "", plot: "", requirement: "", address: "", budget: "", email: "" };

/** Colour for a stage pill: done = green, dropped = red, in progress = amber, untouched = brand. */
function stageTone(status: string, colors: Theme["colors"]): { fg: string; bg: string } {
  const s = status.toLowerCase();
  if (!s || s === "new") return { fg: colors.primary, bg: colors.primaryMuted };
  if (s.includes("convert") || s.includes("won") || s.includes("closed")) return { fg: colors.success, bg: colors.successMuted };
  if (api.isNotInterestedStatus(s) || s.includes("lost") || s.includes("drop")) return { fg: colors.danger, bg: colors.dangerMuted };
  if (s.includes("no answer")) return { fg: colors.textMuted, bg: colors.surfaceAlt };
  return { fg: colors.warning, bg: colors.warningMuted };
}

function digitsFor(phone: string | undefined | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

/** "2 Oct 2026, 4:15 pm" */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Days until a "Not interested" lead is deleted (never below 0). */
export function daysUntilDeleted(notInterestedAt: string | null | undefined, ttlDays: number, now = Date.now()): number | null {
  if (!notInterestedAt) return null;
  const left = ttlDays - Math.floor((now - new Date(notInterestedAt).getTime()) / DAY_MS);
  return Math.max(0, left);
}

function syncStatusLine(s: AutoSyncStatus | null): { text: string; error: boolean } | null {
  if (!s) return null;
  if (s.lastError) return { text: `Last try failed: ${s.lastError}`, error: true };
  if (s.pending) return { text: `${s.pending} waiting to upload`, error: false };
  if (s.lastSuccessAt) return { text: `Checked ${formatStamp(new Date(s.lastSuccessAt).toISOString())}`, error: false };
  return null;
}

export function LeadsScreen({ navigation }: any) {
  const { colors, spacing, typography, radius, touchTarget, feature } = useTheme();
  const { user } = useAuth();
  const isAdmin = api.isLeadAdmin(user);

  const [page, setPage] = useState(1);
  const [stage, setStage] = useState<string>(DEFAULT_STAGE);
  // Which list the leads come from (e.g. Meta leads, Calling data); "all" combines every list.
  const [sourceId, setSourceId] = useState<string>(ALL);
  const [sources, setSources] = useState<api.LeadSource[]>([]);
  const [pickingSource, setPickingSource] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<api.LeadPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusOptions, setStatusOptions] = useState<string[]>(api.DEFAULT_STATUS_OPTIONS);
  const [ttlDays, setTtlDays] = useState(30);

  const [editing, setEditing] = useState<api.Lead | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [shown, setShown] = useState<Set<OptionalKey>>(new Set());
  const [saving, setSaving] = useState(false);

  const [renaming, setRenaming] = useState<api.Lead | null>(null);
  const [identity, setIdentity] = useState({ name: "", phone: "" });

  const [adding, setAdding] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "" });

  const [autoAdd, setAutoAdd] = useState(false);
  const [autoStatus, setAutoStatus] = useState<AutoSyncStatus | null>(null);
  const [overlay, setOverlay] = useState<OverlaySetup | null>(null);

  const listRef = useRef<FlatList<api.Lead>>(null);
  const request = useRef(0);

  // Typing in search waits a moment before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter or search starts again at page 1.
  useEffect(() => setPage(1), [stage, query, sourceId]);

  const load = useCallback(
    async (opts: { quiet?: boolean; fresh?: boolean } = {}) => {
      const id = ++request.current;
      if (!opts.quiet) setLoading(true);
      if (opts.fresh) bypassCacheBriefly();
      try {
        const res = await api.listLeadsPage({ page, status: stage, search: query, sourceId });
        if (id !== request.current) return;
        // Deleting/filtering can leave us past the last page; step back.
        if (res.page > res.totalPages && res.totalPages >= 1) {
          setPage(res.totalPages);
          return;
        }
        setData(res);
        setError(null);
      } catch (e) {
        if (id === request.current && !opts.quiet) setError(getApiErrorMessage(e, "We couldn't load your leads."));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [page, stage, query, sourceId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAutoStatus = useCallback(() => {
    void getAutoSyncStatus().then(setAutoStatus);
  }, []);

  // Re-check the "pop-up over other apps" setup whenever they come back (e.g. from Settings).
  useEffect(() => {
    if (!overlaySupported) return;
    void getOverlaySetup().then(setOverlay);
    const sub = AppState.addEventListener("change", (st) => st === "active" && void getOverlaySetup().then(setOverlay));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load({ quiet: true, fresh: true });
      refreshAutoStatus();
      // Leads are shared: quietly pick up edits made by other people on the same list.
      const timer = setInterval(() => void load({ quiet: true, fresh: true }), 30000);
      return () => clearInterval(timer);
    }, [load, refreshAutoStatus])
  );

  useEffect(
    () =>
      onLeadEvent("leadsChanged", () => {
        void load({ quiet: true, fresh: true });
        refreshAutoStatus();
      }),
    [load, refreshAutoStatus]
  );

  useEffect(() => {
    void isAutoSyncEnabled().then(setAutoAdd);
    api
      .listSources()
      .then((list) => setSources(list.filter((x) => x.enabled)))
      .catch(() => undefined);
    api
      .getLeadMeta()
      .then((m) => {
        if (m.statusSuggestions?.length) setStatusOptions(m.statusSuggestions);
        if (m.notInterestedTtlDays) setTtlDays(m.notInterestedTtlDays);
      })
      .catch(() => undefined);
  }, []);

  const leads = data?.leads ?? [];
  const countFor = useCallback(
    (s: string) => (s === ALL ? data?.totalAll ?? 0 : data?.stageCounts.find((c) => c.stage === s)?.count ?? 0),
    [data]
  );
  const stageChips = useMemo(() => {
    const others = (data?.stageCounts ?? []).map((c) => c.stage).filter((s) => s !== DEFAULT_STAGE);
    return [DEFAULT_STAGE, ...others, ALL];
  }, [data]);

  const sourceName = useCallback(
    (id: string) => (id === ALL ? "All leads" : sources.find((x) => x.id === id)?.label || "Sheet"),
    [sources]
  );

  const goToPage = (next: number) => {
    setPage(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const callLead = async (lead: api.Lead) => {
    const digits = digitsFor(lead.phone);
    if (!digits) {
      Alert.alert("Invalid number", "This lead does not have a valid phone number.");
      return;
    }
    // First call on Android: offer the over-other-apps card once, before the dialer takes over.
    if (overlaySupported && overlay && !(overlay.overlay && overlay.phoneState) && !(await wasOverlaySetupOffered())) {
      Alert.alert(
        "Ask how calls went?",
        "After a call to a lead ends, We Three can show a small card over any app to pick the stage. It needs two permissions.",
        [
          { text: "Not now", style: "cancel", onPress: () => void requestOverlaySetupLater().then(() => void callLead(lead)) },
          { text: "Set up", onPress: () => void requestOverlaySetup().then(setOverlay) },
        ]
      );
      return;
    }
    try {
      // Remember the call so the app asks for the outcome when they're back.
      await registerCall(lead).catch(() => undefined);
      if (overlay?.overlay && overlay.phoneState) startCallWatch({ leadId: lead.id, name: lead.name, phone: lead.phone }, QUICK_STATUSES);
      await Linking.openURL(`tel:+${digits}`);
    } catch {
      Alert.alert("Unable to open dialer", "No phone app is available to handle this number.");
    }
  };

  const requestOverlaySetupLater = () => AsyncStorage.setItem("leads.callOverlay.asked", "1").catch(() => undefined);

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
      await load({ fresh: true });
    } catch (e) {
      Alert.alert("Sync failed", getApiErrorMessage(e));
    } finally {
      refreshAutoStatus();
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
      Alert.alert("Contacts permission needed", "Allow contacts access in your phone's Settings for We Three.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    await setAutoSyncEnabled(true);
    setAutoAdd(true);
    const result = await syncTaggedContacts({ force: true });
    refreshAutoStatus();
    if (result && result.added > 0) {
      Alert.alert("Leads added", `${result.added} contact${result.added === 1 ? "" : "s"} with "${LEAD_TAG}" in the name added as leads.`);
      await load({ fresh: true });
    } else if (!result) {
      // The automatic upload didn't go through: offer the matches by hand.
      emitLeadEvent("showContactSuggestions", { manual: true });
    }
  };

  const openEditor = (lead: api.Lead) => {
    const next = {
      status: lead.status || "",
      notes: lead.notes || "",
      category: lead.category || "",
      plot: lead.plotInFarukhNagar || "",
      requirement: lead.requirement || "",
      address: lead.address || "",
      budget: lead.budget || "",
      email: lead.email || "",
    };
    setForm(next);
    // Only fields that already hold something are open; the rest wait behind "Add a field".
    setShown(new Set(OPTIONAL_FIELDS.filter((f) => next[f.key].trim()).map((f) => f.key)));
    setEditing(lead);
  };

  const mergeLocal = (id: string, patch: Partial<api.Lead>) =>
    setData((prev) => (prev ? { ...prev, leads: prev.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : prev));

  const save = async () => {
    if (!editing) return;
    const body: Partial<api.Lead> = { status: form.status.trim(), notes: form.notes.trim() };
    if (shown.has("category")) body.category = form.category.trim();
    if (shown.has("requirement")) body.requirement = form.requirement.trim();
    if (shown.has("address")) body.address = form.address.trim();
    if (shown.has("budget")) body.budget = form.budget.trim();
    if (shown.has("email")) body.email = form.email.trim();
    if (shown.has("plot") && form.plot.trim() !== (editing.plotInFarukhNagar || "")) body.plotInFarukhNagar = form.plot.trim();
    setSaving(true);
    try {
      const saved = await api.updateLead(editing.id, body);
      // If the phone was offline the save is queued and the reply has no lead in it: merge what we sent.
      mergeLocal(editing.id, saved?.id ? saved : { ...body, ...(body.plotInFarukhNagar !== undefined ? { plotManual: true } : {}) });
      setEditing(null);
      void load({ quiet: true, fresh: true });
    } catch (e) {
      Alert.alert("Couldn't save", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const openRename = (lead: api.Lead) => {
    setIdentity({ name: lead.name || "", phone: (lead.phone || "").replace(/^\+91/, "") });
    setRenaming(lead);
  };

  const saveIdentity = async () => {
    if (!renaming) return;
    const digits = identity.phone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      Alert.alert("Invalid number", "Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.updateLead(renaming.id, { name: identity.name.trim(), phone: digits });
      mergeLocal(renaming.id, saved?.id ? saved : { name: identity.name.trim(), phone: `+91${digits}` });
      setRenaming(null);
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
      await load({ fresh: true });
    } catch (e) {
      Alert.alert("Couldn't add lead", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const ActionTile = ({ icon, label, onPress, busy }: { icon: IconName; label: string; onPress: () => void; busy?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: feature.leads.muted,
          borderRadius: radius.md,
          minHeight: touchTarget.large,
          opacity: pressed || busy ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={feature.leads.solid} />
      <Text style={[typography.captionStrong, { color: feature.leads.solid, marginTop: 4, textAlign: "center" }]} numberOfLines={2}>
        {busy ? "Working…" : label}
      </Text>
    </Pressable>
  );

  const statusLine = syncStatusLine(autoStatus);
  const totalAll = data?.totalAll ?? 0;

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h3, { color: colors.text }]}>
            {totalAll.toLocaleString("en-IN")} active lead{totalAll === 1 ? "" : "s"}
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
        <ActionTile
          icon="scan-outline"
          label={`Find "${LEAD_TAG}" contacts`}
          onPress={() => emitLeadEvent("showContactSuggestions", { manual: true })}
        />
        <ActionTile icon="share-social-outline" label={isAdmin ? "Sheets & share" : "Share"} onPress={() => navigation.navigate("LeadSources")} />
        {isAdmin ? (
          <ActionTile icon="document-attach-outline" label="Import CSV" busy={importing} onPress={() => void runAdminCsvImport(setImporting)} />
        ) : null}
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
            {`Any contact with "${LEAD_TAG}" in the name becomes a lead`}
          </Text>
          {autoAdd && statusLine ? (
            <Text style={[typography.caption, { color: statusLine.error ? colors.danger : colors.textMuted }]} numberOfLines={2}>
              {statusLine.text}
            </Text>
          ) : null}
        </View>
        <Switch
          value={autoAdd}
          onValueChange={(v) => void toggleAutoAdd(v)}
          trackColor={{ true: feature.leads.solid, false: colors.border }}
          accessibilityLabel="Auto-add contacts tagged lead"
        />
      </View>

      {overlay?.supported ? (
        <View
          style={[
            styles.autoRow,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
          ]}
        >
          <Ionicons name="albums-outline" size={20} color={feature.leads.solid} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.captionStrong, { color: colors.text }]}>Call pop-up over other apps</Text>
            <Text style={[typography.caption, { color: overlay.overlay && overlay.phoneState ? colors.success : colors.textMuted }]}>
              {overlay.overlay && overlay.phoneState
                ? "On: after a call, pick the stage from any app"
                : !overlay.phoneState
                  ? "Needs phone-call status permission"
                  : 'Needs "Display over other apps"'}
            </Text>
          </View>
          {overlay.overlay && overlay.phoneState ? (
            <Pressable onPress={showTestOverlay} accessibilityRole="button" accessibilityLabel="Show a test pop-up" hitSlop={8}>
              <Text style={[typography.captionStrong, { color: colors.primary }]}>Test</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => void requestOverlaySetup().then(setOverlay)} accessibilityRole="button" accessibilityLabel="Set up call pop-up" hitSlop={8}>
              <Text style={[typography.captionStrong, { color: colors.primary }]}>Set up</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <Pressable
        onPress={() => setPickingSource(true)}
        accessibilityRole="button"
        accessibilityLabel={`Lead list: ${sourceName(sourceId)}. Tap to change.`}
        style={[
          styles.dropdown,
          { marginTop: spacing.md, minHeight: touchTarget.min, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md },
        ]}
      >
        <Ionicons name="funnel-outline" size={18} color={colors.primary} />
        <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
          {sourceName(sourceId)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={{ marginTop: spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone, stage or notes" />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <FilterChipGroup>
          {stageChips.map((s) => (
            <FilterChip
              key={s}
              label={`${s === ALL ? "All" : s} ${countFor(s).toLocaleString("en-IN")}`}
              selected={stage === s}
              onPress={() => setStage(s)}
            />
          ))}
        </FilterChipGroup>
      </View>
    </View>
  );

  const footer =
    data && data.totalPages > 1 ? (
      <View style={[styles.pager, { gap: spacing.sm, marginTop: spacing.sm }]}>
        <Button label="‹ Prev" variant="secondary" onPress={() => goToPage(page - 1)} disabled={page <= 1 || loading} style={{ flex: 1 }} />
        <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", minWidth: 96 }]}>
          {`Page ${page} of ${data.totalPages}\n${data.total.toLocaleString("en-IN")} leads`}
        </Text>
        <Button
          label="Next ›"
          variant="secondary"
          onPress={() => goToPage(page + 1)}
          disabled={page >= data.totalPages || loading}
          style={{ flex: 1 }}
        />
      </View>
    ) : null;

  const renderLead = ({ item }: { item: api.Lead }) => {
    const tone = stageTone(item.status, colors);
    const details = [item.requirement, item.address, item.budget].filter(Boolean).join(" • ");
    const added = formatStamp(item.createdAt || item.sheetDate);
    const updated = item.updatedByName && item.updatedAt ? `Updated by ${item.updatedByName} · ${formatStamp(item.updatedAt)}` : "";
    const daysLeft = api.isNotInterestedStatus(item.status) ? daysUntilDeleted(item.notInterestedAt, ttlDays) : null;
    return (
      <Pressable
        onPress={() => openEditor(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name || "Lead"}, ${item.status || "New"}. Tap to update.`}
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

        {added ? (
          <View style={[styles.stampRow, { marginTop: spacing.xs }]}>
            <Ionicons name="time-outline" size={12} color={colors.textFaint} />
            <Text style={[typography.caption, { color: colors.textFaint }]}>Added {added}</Text>
          </View>
        ) : null}
        {updated ? (
          <View style={styles.stampRow}>
            <Ionicons name="create-outline" size={12} color={colors.textFaint} />
            <Text style={[typography.caption, { color: colors.textFaint }]} numberOfLines={1}>
              {updated}
            </Text>
          </View>
        ) : null}
        {daysLeft !== null ? (
          <Text style={[typography.caption, { color: colors.danger, marginTop: 2 }]}>
            {daysLeft === 0 ? "Will be deleted today" : `Will be deleted in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </Text>
        ) : null}

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

        {item.info ? (
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]} numberOfLines={2}>
            {item.info}
          </Text>
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
            onPress={() => void callLead(item)}
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
            <Ionicons name="checkmark-done-outline" size={16} color={colors.text} />
            <Text style={[typography.captionStrong, { color: colors.text }]}>Update</Text>
          </Pressable>
          <Pressable
            onPress={() => openRename(item)}
            accessibilityRole="button"
            accessibilityLabel={`Edit name and number of ${item.name || "lead"}`}
            hitSlop={4}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, width: touchTarget.min, height: touchTarget.min, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="pencil" size={16} color={colors.text} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const hiddenFields = OPTIONAL_FIELDS.filter((f) => !shown.has(f.key));
  const setField = (key: keyof typeof EMPTY_FORM) => (t: string) => setForm((f) => ({ ...f, [key]: t }));

  return (
    <ScreenContainer scroll={false} edges={["left", "right"]} contentStyle={{ flex: 1, paddingBottom: 0 }}>
      {error && !data ? (
        <>
          {header}
          <ErrorState message={error} onRetry={() => void load({ fresh: true })} />
        </>
      ) : (
        <FlatList
          ref={listRef}
          data={loading && !data ? [] : leads}
          keyExtractor={(x) => x.id}
          renderItem={renderLead}
          ListHeaderComponent={<View style={{ marginBottom: spacing.md }}>{header}</View>}
          ListFooterComponent={footer}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshing={false}
          onRefresh={() => void load({ fresh: true })}
          ListEmptyComponent={
            loading ? (
              <SkeletonLines count={5} />
            ) : (
              <EmptyState
                title={query ? "No matching leads" : stage === ALL ? "No leads yet" : `No leads in "${stage}"`}
                subtitle={
                  query
                    ? "Try another name or number."
                    : stage === ALL
                      ? "Add a lead, pick from contacts, or connect a Google Sheet."
                      : "Pick another stage above, or All."
                }
                icon="people-outline"
              />
            )
          }
        />
      )}

      <BottomSheet visible={pickingSource} onClose={() => setPickingSource(false)} title="Show leads from" scrollable>
        {[{ id: ALL, label: "All leads" }, ...sources.map((x) => ({ id: x.id, label: x.label || "Sheet" }))].map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => {
              setSourceId(opt.id);
              setPickingSource(false);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: sourceId === opt.id }}
            style={[styles.dropdownRow, { minHeight: touchTarget.min, paddingVertical: spacing.sm }]}
          >
            <Text style={[sourceId === opt.id ? typography.bodyStrong : typography.body, { color: colors.text, flex: 1 }]}>{opt.label}</Text>
            {sourceId === opt.id ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.name || "Lead"} subtitle={editing?.phone} avoidKeyboard>
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
        {api.isNotInterestedStatus(form.status) ? (
          <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>
            {`"Not interested" leads are deleted automatically after ${ttlDays} days.`}
          </Text>
        ) : null}
        <View style={{ marginTop: spacing.md }}>
          <TextField
            label="Or type a custom stage"
            value={statusOptions.includes(form.status) ? "" : form.status}
            onChangeText={setField("status")}
            placeholder="e.g. Token received"
          />
        </View>
        <TextField label="Notes" value={form.notes} onChangeText={setField("notes")} multiline />

        {OPTIONAL_FIELDS.filter((f) => shown.has(f.key)).map((f) =>
          f.key === "category" ? (
            <View key={f.key} style={{ marginBottom: spacing.md }}>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Category</Text>
              <FilterChipGroup>
                {api.CATEGORY_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt}
                    label={opt}
                    selected={form.category === opt}
                    onPress={() => setForm((cur) => ({ ...cur, category: cur.category === opt ? "" : opt }))}
                  />
                ))}
              </FilterChipGroup>
            </View>
          ) : (
            <TextField
              key={f.key}
              label={f.label}
              value={form[f.key]}
              onChangeText={setField(f.key)}
              multiline={f.key === "requirement"}
              keyboardType={f.key === "email" ? "email-address" : undefined}
              autoCapitalize={f.key === "email" ? "none" : undefined}
            />
          )
        )}

        {hiddenFields.length ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Add a field</Text>
            <FilterChipGroup>
              {hiddenFields.map((f) => (
                <FilterChip key={f.key} label={f.label} icon="add" selected={false} onPress={() => setShown((s) => new Set(s).add(f.key))} />
              ))}
            </FilterChipGroup>
          </View>
        ) : null}

        <View style={[styles.sheetButtons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button label="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!renaming} onClose={() => setRenaming(null)} title="Edit lead" subtitle="Name and mobile number" avoidKeyboard>
        <TextField label="Name" value={identity.name} onChangeText={(t) => setIdentity((v) => ({ ...v, name: t }))} autoCapitalize="words" />
        <TextField
          label="Mobile number"
          value={identity.phone}
          onChangeText={(t) => setIdentity((v) => ({ ...v, phone: t }))}
          keyboardType="phone-pad"
          placeholder="10-digit mobile number"
        />
        <View style={[styles.sheetButtons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setRenaming(null)} style={{ flex: 1 }} />
          <Button label="Save" onPress={saveIdentity} loading={saving} style={{ flex: 1 }} />
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
  tiles: { flexDirection: "row", flexWrap: "wrap" },
  tile: { flexGrow: 1, flexBasis: "30%", alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 4 },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: StyleSheet.hairlineWidth },
  card: { borderWidth: StyleSheet.hairlineWidth },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stampRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, maxWidth: 170 },
  cardActions: { flexDirection: "row", alignItems: "center" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  iconBtn: { alignItems: "center", justifyContent: "center" },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth },
  dropdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pager: { flexDirection: "row", alignItems: "center" },
  sheetButtons: { flexDirection: "row", marginTop: 8 },
});
