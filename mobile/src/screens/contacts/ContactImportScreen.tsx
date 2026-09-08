import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as contactsApi from "../../api/contacts";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { ErrorState, LoadingState } from "../../components/StateViews";
import type { ContactsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<ContactsStackParamList, "ContactImport">;

interface DeviceContactRow {
  key: string;
  name: string;
  number: string;
}

type Phase = "requesting-permission" | "denied" | "loading" | "ready" | "importing" | "done";

function dedupeByNumber(rows: DeviceContactRow[]): DeviceContactRow[] {
  const seen = new Set<string>();
  const result: DeviceContactRow[] = [];
  for (const row of rows) {
    if (seen.has(row.number)) continue;
    seen.add(row.number);
    result.push(row);
  }
  return result;
}

export function ContactImportScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();

  const [phase, setPhase] = useState<Phase>("requesting-permission");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DeviceContactRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setPhase("denied");
        return;
      }
      setPhase("loading");
      try {
        const result = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          sort: Contacts.SortTypes.FirstName,
        });
        const flattened: DeviceContactRow[] = [];
        for (const contact of result.data) {
          const name = contact.name?.trim();
          const numbers = contact.phoneNumbers ?? [];
          if (!name || numbers.length === 0) continue;
          for (const phone of numbers) {
            const number = phone.number?.replace(/[^\d+]/g, "").trim();
            if (!number) continue;
            flattened.push({ key: `${contact.id}:${number}`, name, number });
          }
        }
        setRows(dedupeByNumber(flattened));
        setPhase("ready");
      } catch (err) {
        setError(getApiErrorMessage(err, "We couldn't read your contacts."));
        setPhase("ready");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term) || r.number.includes(term));
  }, [rows, search]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = filtered.every((r) => next.has(r.key));
      for (const r of filtered) {
        if (allVisibleSelected) next.delete(r.key);
        else next.add(r.key);
      }
      return next;
    });
  }, [filtered]);

  const importSelected = useCallback(async () => {
    const chosen = rows.filter((r) => selected.has(r.key));
    if (chosen.length === 0) return;
    setPhase("importing");
    setError(null);
    try {
      const result = await contactsApi.bulkCreateContacts(
        chosen.map((r) => ({ name: r.name, number: r.number }))
      );
      setSummary({ imported: result.imported.length, skipped: result.skipped.length });
      setPhase("done");
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't import those contacts."));
      setPhase("ready");
    }
  }, [rows, selected]);

  const importAll = useCallback(async () => {
    if (rows.length === 0) return;
    setPhase("importing");
    setError(null);
    try {
      const result = await contactsApi.bulkCreateContacts(rows.map((r) => ({ name: r.name, number: r.number })));
      setSummary({ imported: result.imported.length, skipped: result.skipped.length });
      setPhase("done");
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't import those contacts."));
      setPhase("ready");
    }
  }, [rows]);

  if (phase === "requesting-permission" || phase === "loading") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <LoadingState label="Reading your contacts…" />
      </SafeAreaView>
    );
  }

  if (phase === "denied") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <ErrorState
          message="We need permission to read your contacts to import them. You can allow this in your phone's Settings for We Three."
        />
      </SafeAreaView>
    );
  }

  if (phase === "done" && summary) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          <Text style={[typography.h3, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
            {summary.imported} contact{summary.imported === 1 ? "" : "s"} imported
          </Text>
          {summary.skipped > 0 ? (
            <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs, textAlign: "center" }]}>
              {summary.skipped} already in your list, skipped.
            </Text>
          ) : null}
          <Button
            label="Done"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.key));

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {rows.length} contact{rows.length === 1 ? "" : "s"} found on this phone.
        </Text>

        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              marginTop: spacing.md,
              minHeight: touchTarget.comfortable,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your contacts"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search your contacts"
            style={[styles.searchInput, { color: colors.text, minHeight: touchTarget.comfortable }]}
          />
        </View>

        <View style={styles.rowBetween}>
          <Pressable onPress={selectAllVisible} accessibilityRole="button" style={{ paddingVertical: spacing.sm }}>
            <Text style={[typography.captionStrong, { color: colors.primary }]}>
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </Text>
          </Pressable>
          <Pressable onPress={importAll} accessibilityRole="button" style={{ paddingVertical: spacing.sm }}>
            <Text style={[typography.captionStrong, { color: colors.primary }]}>Sync all contacts</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = selected.has(item.key);
          return (
            <Pressable
              onPress={() => toggle(item.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${item.name}, ${item.number}`}
              style={[
                styles.row,
                {
                  borderBottomColor: colors.border,
                  paddingVertical: spacing.md,
                },
              ]}
            >
              <Ionicons
                name={isSelected ? "checkbox" : "square-outline"}
                size={22}
                color={isSelected ? colors.primary : colors.textFaint}
              />
              <View style={{ marginLeft: spacing.md, flex: 1 }}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{item.number}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl }]}>
            No contacts matched.
          </Text>
        }
      />

      <View
        style={[
          styles.footer,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
        ]}
      >
        <Button
          label={`Import selected (${selected.size})`}
          onPress={importSelected}
          disabled={selected.size === 0 || phase === "importing"}
          loading={phase === "importing"}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
});
