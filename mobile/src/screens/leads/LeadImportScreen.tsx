import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { Button } from "../../components/Button";
import { ErrorState, LoadingState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";

interface Row {
  key: string;
  name: string;
  number: string;
}

type Phase = "loading" | "denied" | "ready" | "importing" | "done";

export function LeadImportScreen({ navigation }: any) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<api.ImportResult | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setPhase("denied");
        return;
      }
      try {
        const res = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          sort: Contacts.SortTypes.FirstName,
        });
        const seen = new Set<string>();
        const list: Row[] = [];
        for (const contact of res.data) {
          const name = contact.name?.trim();
          if (!name) continue;
          for (const p of contact.phoneNumbers ?? []) {
            const number = p.number?.replace(/[^\d+]/g, "").trim();
            if (!number || seen.has(number)) continue;
            seen.add(number);
            list.push({ key: `${contact.id}:${number}`, name, number });
          }
        }
        setRows(list);
      } catch (e) {
        setError(getApiErrorMessage(e, "We couldn't read your contacts."));
      }
      setPhase("ready");
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? rows.filter((r) => r.name.toLowerCase().includes(term) || r.number.includes(term)) : rows;
  }, [rows, search]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.key));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (allVisibleSelected) next.delete(r.key);
        else next.add(r.key);
      }
      return next;
    });

  const doImport = async () => {
    const chosen = rows.filter((r) => selected.has(r.key));
    if (chosen.length === 0) return;
    setPhase("importing");
    setError(null);
    try {
      setResult(await api.importLeads(chosen.map((r) => ({ name: r.name, phone: r.number }))));
      setPhase("done");
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't import those contacts."));
      setPhase("ready");
    }
  };

  const shell = (child: React.ReactNode) => (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
      {child}
    </SafeAreaView>
  );

  if (phase === "loading") return shell(<LoadingState label="Reading your contacts…" />);
  if (phase === "denied") {
    return shell(
      <ErrorState message="Allow contacts access in your phone's Settings for We Three to import leads from your contacts." />
    );
  }
  if (phase === "done" && result) {
    return shell(
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={48} color={colors.success} />
        <Text style={[typography.h3, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
          {result.added} lead{result.added === 1 ? "" : "s"} added
        </Text>
        {result.existing > 0 ? (
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs, textAlign: "center" }]}>
            {result.existing} already in your leads, skipped.
          </Text>
        ) : null}
        {result.invalid > 0 ? (
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs, textAlign: "center" }]}>
            {result.invalid} skipped (not a valid 10-digit Indian mobile number).
          </Text>
        ) : null}
        <Button label="Done" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl, alignSelf: "stretch" }} />
      </View>
    );
  }

  return shell(
    <>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Pick contacts to track as leads. They go into your "My contacts" list, which you can share like a sheet.
        </Text>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md, minHeight: touchTarget.comfortable },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your contacts"
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        <Pressable onPress={toggleAllVisible} style={{ paddingVertical: spacing.sm }}>
          <Text style={[typography.captionStrong, { color: colors.primary }]}>
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </Text>
        </Pressable>
        {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text> : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const on = selected.has(item.key);
          return (
            <Pressable
              onPress={() => toggle(item.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[styles.row, { borderBottomColor: colors.border, paddingVertical: spacing.md }]}
            >
              <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.textFaint} />
              <View style={{ marginLeft: spacing.md, flex: 1 }}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{item.number}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl }]}>
            No contacts found.
          </Text>
        }
      />

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, padding: spacing.lg }]}>
        <Button
          label={`Add ${selected.size} as leads`}
          onPress={doImport}
          disabled={selected.size === 0 || phase === "importing"}
          loading={phase === "importing"}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
});
