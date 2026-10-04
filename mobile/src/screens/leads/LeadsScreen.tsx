import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SearchBar } from "../../components/SearchBar";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { callStatusOptions, registerCall } from "../../leads/callFollowUp";
import {
  getOverlaySetup,
  overlaySupported,
  requestOverlaySetup,
  startCallWatch,
  wasOverlaySetupOffered,
  type OverlaySetup,
} from "../../leads/callOverlay";
import { syncTaggedContacts } from "../../leads/contactAutoSync";
import { emitLeadEvent, onLeadEvent } from "../../leads/leadEvents";
import { getLocalOrigins, isLocalFresh, queryLocalLeads, refreshLeadStoreIfStale, renameLocalOrigin } from "../../leads/leadStore";
import { isUnreachableError } from "../../offline/httpQueue";
import { bypassCacheBriefly } from "../../offline/httpCache";
import { useTheme, type Theme } from "../../theme/useTheme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** The list opens on new leads: the ones nobody has called yet. */
export const DEFAULT_STAGE = "New";
const ALL = "all";
const DAY_MS = 24 * 60 * 60 * 1000;
/** How old the full copy on the phone may get before a successful list load refreshes it. */
const STORE_REFRESH_MS = 5 * 60 * 1000;

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

export function LeadsScreen({ navigation }: any) {
  const { colors, spacing, typography, radius, touchTarget, feature } = useTheme();

  const [page, setPage] = useState(1);
  const [stage, setStage] = useState<string>(DEFAULT_STAGE);
  // Which list the leads come from (e.g. Meta leads, Calling data); "all" combines every list.
  // Sheet filter: the sheet name saved on every lead ("Meta Sheet", "Calling Data"…); "all" shows every sheet.
  const [sheet, setSheet] = useState<string>(ALL);
  const [sheets, setSheets] = useState<api.OriginCount[]>([]);
  const [pickingSource, setPickingSource] = useState(false);
  // Renaming a sheet name (anyone signed in) updates it on every lead that carries it.
  const [renamingSheet, setRenamingSheet] = useState<string | null>(null);
  const [sheetNewName, setSheetNewName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  // Adding a new list (a new name in the sheet filter, like "Meta Sheet" or "Calling Data").
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<api.LeadPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusOptions, setStatusOptions] = useState<string[]>(api.DEFAULT_STATUS_OPTIONS);
  const [ttlDays, setTtlDays] = useState(30);

  const [editing, setEditing] = useState<api.Lead | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [shown, setShown] = useState<Set<OptionalKey>>(new Set());
  const [saving, setSaving] = useState(false);

  const [renaming, setRenaming] = useState<api.Lead | null>(null);
  const [identity, setIdentity] = useState({ name: "", phone: "" });


  const [overlay, setOverlay] = useState<OverlaySetup | null>(null);

  // Top-right button that opens the Leads settings (add, import, share, call pop-up, offline copy).
  useLayoutEffect(() => {
    navigation.setOptions?.({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("LeadSettings")}
          accessibilityRole="button"
          accessibilityLabel="Leads settings"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
        >
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, colors.text]);

  const listRef = useRef<FlatList<api.Lead>>(null);
  const request = useRef(0);

  // Typing in search waits a moment so a fast typist triggers one lookup, not one per letter.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 150);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter or search starts again at page 1.
  useEffect(() => setPage(1), [stage, query, sheet]);

  const localPage = useCallback(
    () => queryLocalLeads({ page, limit: api.PAGE_SIZE, status: stage, search: query, origin: sheet }),
    [page, stage, query, sheet]
  );

  const load = useCallback(
    async (opts: { quiet?: boolean; fresh?: boolean } = {}) => {
      const id = ++request.current;
      if (!opts.quiet) {
        setLoading(true);
        // The copy saved on the phone shows straight away; the server's answer replaces it.
        const local = await localPage().catch(() => null);
        if (id !== request.current) return;
        if (local) {
          setData(local);
          setError(null);
          setLoading(false);
          // Searching, switching stage or list and paging are answered from the phone alone while the
          // saved copy is recent. The 30 s refresh and pull-to-refresh still ask the server.
          if (!opts.fresh && (await isLocalFresh(STORE_REFRESH_MS))) return;
        }
      }
      if (opts.fresh) bypassCacheBriefly();
      try {
        const res = await api.listLeadsPage({ page, status: stage, search: query, origin: sheet });
        if (id !== request.current) return;
        // Deleting/filtering can leave us past the last page; step back.
        if (res.page > res.totalPages && res.totalPages >= 1) {
          setPage(res.totalPages);
          return;
        }
        setData(res);
        setError(null);
        setOffline(false);
        void refreshLeadStoreIfStale(STORE_REFRESH_MS);
      } catch (e) {
        if (id !== request.current) return;
        // Server off or unreachable: carry on from the copy on the phone.
        const local = isUnreachableError(e) ? await localPage().catch(() => null) : null;
        if (id !== request.current) return;
        if (local) {
          setData(local);
          setError(null);
          setOffline(true);
        } else if (!opts.quiet) {
          setError(getApiErrorMessage(e, "We couldn't load your leads."));
        }
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [page, stage, query, sheet, localPage]
  );

  useEffect(() => {
    void load();
  }, [load]);

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
      // Leads are shared: quietly pick up edits made by other people on the same list.
      const timer = setInterval(() => void load({ quiet: true, fresh: true }), 30000);
      return () => clearInterval(timer);
    }, [load])
  );

  useEffect(
    () =>
      onLeadEvent("leadsChanged", () => {
        void load({ quiet: true, fresh: true });
      }),
    [load]
  );

  const loadSheets = useCallback(() => {
    api
      .listOrigins()
      .then(setSheets)
      // Offline: build the options from the copy on the phone.
      .catch(() => void getLocalOrigins().then((list) => list.length && setSheets(list)));
  }, []);

  // New sheets and renames show up whenever this screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      loadSheets();
    }, [loadSheets])
  );

  useEffect(() => {
    void getLocalOrigins().then((list) => list.length && setSheets((cur) => (cur.length ? cur : list)));
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

  const saveSheetRename = async () => {
    const from = renamingSheet;
    const to = sheetNewName.trim();
    if (!from) return;
    if (!to) {
      Alert.alert("Name required");
      return;
    }
    setRenameBusy(true);
    try {
      const { renamed } = await api.renameOrigin(from, to);
      await renameLocalOrigin(from, to);
      if (sheet === from) setSheet(to);
      setRenamingSheet(null);
      loadSheets();
      void load({ quiet: true, fresh: true });
      Alert.alert("Renamed", `${renamed.toLocaleString("en-IN")} lead${renamed === 1 ? "" : "s"} now show "${to}".`);
    } catch (e) {
      Alert.alert("Couldn't rename", getApiErrorMessage(e));
    } finally {
      setRenameBusy(false);
    }
  };

  const saveNewList = async () => {
    const name = newListName.trim();
    if (!name) {
      Alert.alert("Name required");
      return;
    }
    setRenameBusy(true);
    try {
      const made = await api.createList(name);
      setSheets((cur) => (cur.some((s) => s.name === made.name) ? cur : [...cur, { name: made.name, count: 0 }]));
      setSheet(made.name);
      setCreatingList(false);
      setNewListName("");
      loadSheets();
    } catch (e) {
      Alert.alert("Couldn't add list", getApiErrorMessage(e));
    } finally {
      setRenameBusy(false);
    }
  };

  const sheetName = (name: string) => (name === ALL ? "All leads" : name);

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
      if (overlay?.overlay && overlay.phoneState) startCallWatch({ leadId: lead.id, name: lead.name, phone: lead.phone }, callStatusOptions(statusOptions));
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
      setSyncing(false);
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

  const confirmDelete = (lead: api.Lead) => {
    Alert.alert(
      "Delete this lead?",
      `${lead.name || "Unnamed lead"} (${lead.phone}) will be removed for everyone signed in, and won't come back from the sheet.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void api
              .deleteLead(lead.id)
              .then(() => {
                emitLeadEvent("leadsChanged");
                void load({ quiet: true, fresh: true });
              })
              .catch((e) => Alert.alert("Couldn't delete", getApiErrorMessage(e, "Please try again."))),
        },
      ]
    );
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

  const totalAll = data?.totalAll ?? 0;

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h3, { color: colors.text }]}>
            {totalAll.toLocaleString("en-IN")} active lead{totalAll === 1 ? "" : "s"}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Everyone signed in sees and edits the same leads</Text>
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

      {offline ? (
        <View
          accessibilityRole="alert"
          style={[styles.autoRow, { backgroundColor: colors.warningMuted, borderColor: colors.warning, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md }]}
        >
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
          <Text style={[typography.caption, { color: colors.text, flex: 1 }]}>
            Server not reachable. Showing leads saved on this phone; your edits sync when it's back.
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => setPickingSource(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sheet: ${sheetName(sheet)}. Tap to change.`}
        style={[
          styles.dropdown,
          { marginTop: spacing.md, minHeight: touchTarget.min, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md },
        ]}
      >
        <Ionicons name="funnel-outline" size={18} color={colors.primary} />
        <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
          {sheetName(sheet)}
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
            <View style={[styles.stampRow, { marginTop: 2 }]}>
              <Ionicons name="documents-outline" size={12} color={item.origin ? feature.leads.solid : colors.textFaint} />
              <Text
                style={[typography.captionStrong, { color: item.origin ? feature.leads.solid : colors.textFaint }]}
                numberOfLines={1}
                accessibilityLabel={item.origin ? `From ${item.origin}` : "Source not recorded"}
              >
                {item.origin ? `From ${item.origin}` : "Source not recorded"}
              </Text>
            </View>
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
            <Ionicons name="call" size={20} color={colors.onPrimary} />
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
            <Ionicons name="logo-whatsapp" size={20} color={colors.success} />
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
            <Ionicons name="checkmark-done-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => openRename(item)}
            accessibilityRole="button"
            accessibilityLabel={`Edit name and number of ${item.name || "lead"}`}
            hitSlop={4}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, minHeight: touchTarget.min, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="pencil" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => confirmDelete(item)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name || "lead"}`}
            hitSlop={4}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, minHeight: touchTarget.min, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
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
              <View accessibilityLabel="Loading leads" accessibilityRole="progressbar">
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }]}
                  >
                    <Skeleton width="55%" height={18} />
                    <Skeleton width="35%" height={12} style={{ marginTop: spacing.sm }} />
                    <Skeleton width="80%" height={12} style={{ marginTop: spacing.md }} />
                    <Skeleton height={36} style={{ marginTop: spacing.md, borderRadius: radius.pill }} />
                  </View>
                ))}
              </View>
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
        {[{ name: ALL, label: "All leads", count: undefined as number | undefined }, ...sheets.map((x) => ({ name: x.name, label: x.name, count: x.count }))].map((opt) => (
          <Pressable
            key={opt.name}
            onPress={() => {
              setSheet(opt.name);
              setPickingSource(false);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: sheet === opt.name }}
            style={[styles.dropdownRow, { minHeight: touchTarget.min, paddingVertical: spacing.sm }]}
          >
            <Text style={[sheet === opt.name ? typography.bodyStrong : typography.body, { color: colors.text, flex: 1 }]}>{opt.label}</Text>
            {opt.count !== undefined ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>{opt.count.toLocaleString("en-IN")}</Text>
            ) : null}
            {sheet === opt.name ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            {opt.name !== ALL ? (
              <Pressable
                onPress={() => {
                  setPickingSource(false);
                  setSheetNewName(opt.name);
                  setRenamingSheet(opt.name);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Rename ${opt.name}`}
                hitSlop={8}
                style={[styles.renameBtn, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, width: touchTarget.min - 8, height: touchTarget.min - 8 }]}
              >
                <Ionicons name="pencil" size={16} color={colors.text} />
              </Pressable>
            ) : null}
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setPickingSource(false);
            setNewListName("");
            setCreatingList(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add a new list"
          style={[styles.dropdownRow, { minHeight: touchTarget.min, paddingVertical: spacing.sm }]}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={[typography.bodyStrong, { color: colors.primary, flex: 1 }]}>Add a new list</Text>
        </Pressable>
      </BottomSheet>

      <BottomSheet
        visible={creatingList}
        onClose={() => setCreatingList(false)}
        title="Add a new list"
        subtitle="A name to file leads under, like Meta Sheet or Calling Data. You can pick it when adding a lead."
        avoidKeyboard
      >
        <TextField label="List name" value={newListName} onChangeText={setNewListName} placeholder="e.g. Referrals" autoCapitalize="words" />
        <View style={[styles.sheetButtons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setCreatingList(false)} style={{ flex: 1 }} />
          <Button label="Add list" onPress={() => void saveNewList()} loading={renameBusy} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={renamingSheet !== null}
        onClose={() => setRenamingSheet(null)}
        title="Rename sheet"
        subtitle="Every lead under this name is updated. Stages and notes are not touched."
        avoidKeyboard
      >
        <TextField label="New name" value={sheetNewName} onChangeText={setSheetNewName} placeholder="e.g. Calling Data" autoCapitalize="words" />
        <View style={[styles.sheetButtons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setRenamingSheet(null)} style={{ flex: 1 }} />
          <Button label="Rename" onPress={() => void saveSheetRename()} loading={renameBusy} style={{ flex: 1 }} />
        </View>
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
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  iconBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth },
  renameBtn: { alignItems: "center", justifyContent: "center" },
  dropdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pager: { flexDirection: "row", alignItems: "center" },
  sheetButtons: { flexDirection: "row", marginTop: 8 },
});
