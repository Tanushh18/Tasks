import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as contactsApi from "../../api/contacts";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { ContactsStackParamList } from "../../navigation/types";
import { isNetworkFailure } from "../../offline/offlineQueue";
import { loadCache, saveCache } from "../../offline/readCache";
import { subscribeToReconnect } from "../../offline/useOfflineSync";
import { useTheme } from "../../theme/useTheme";
import type { Contact } from "../../types/models";

type Props = NativeStackScreenProps<ContactsStackParamList, "ContactsList">;

const SEARCH_DEBOUNCE_MS = 300;

export function ContactsListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();
  const { user } = useAuth();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactPendingDelete, setContactPendingDelete] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showingOfflineData, setShowingOfflineData] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await contactsApi.listContacts();
      setContacts(result);
      setShowingOfflineData(false);
      void saveCache("contacts", result);
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await loadCache<Contact[]>("contacts");
        if (cached) {
          setContacts(cached);
          setShowingOfflineData(true);
          setLoading(false);
          return;
        }
      }
      setError(getApiErrorMessage(err, "We couldn't load your contacts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useEffect(() => subscribeToReconnect(load), [load]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(term) || c.number.toLowerCase().includes(term)
    );
  }, [contacts, debouncedSearch]);

  const confirmDelete = useCallback(async () => {
    const contact = contactPendingDelete;
    if (!contact) return;
    setDeleting(true);
    try {
      await contactsApi.deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      setContactPendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that contact."));
    } finally {
      setDeleting(false);
    }
  }, [contactPendingDelete]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={styles.rowBetween}>
          <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
            Contacts
          </Text>
          <Pressable
            onPress={() => navigation.navigate("ContactImport")}
            accessibilityRole="button"
            accessibilityLabel="Import contacts from your phone"
            style={({ pressed }) => [
              styles.importButton,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="download-outline" size={16} color={colors.primary} />
            <Text style={[typography.captionStrong, { color: colors.primary, marginLeft: 4 }]}>Import</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              marginTop: spacing.lg,
              minHeight: touchTarget.comfortable,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search contacts"
            style={[styles.searchInput, { color: colors.text, minHeight: touchTarget.comfortable }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showingOfflineData ? (
        <Text
          style={[
            typography.caption,
            {
              color: colors.textMuted,
              backgroundColor: colors.surfaceAlt,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              textAlign: "center",
            },
          ]}
        >
          Showing offline data — will refresh when you're back online
        </Text>
      ) : null}

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={5} />
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isOwner = item.addedBy.id === user?.id;
            return (
              <Pressable
                onPress={() => navigation.navigate("ContactForm", { contactId: item.id })}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <Card style={styles.card}>
                  <View style={styles.flex}>
                    <View style={styles.rowBetween}>
                      <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                      {!isOwner ? <Badge label={`Shared by ${item.addedBy.name}`} tone="primary" /> : null}
                    </View>
                    <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>{item.number}</Text>
                    {item.description ? (
                      <Text
                        style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  {isOwner ? (
                    <Pressable
                      onPress={() => setContactPendingDelete(item)}
                      hitSlop={8}
                      style={{ marginLeft: spacing.sm }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.name}`}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                    </Pressable>
                  ) : null}
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            debouncedSearch.trim() ? (
              <EmptyState title="Nothing matched that" subtitle={`No contacts found for "${debouncedSearch.trim()}".`} actionLabel="Clear search" onAction={() => setSearch("")} />
            ) : (
              <EmptyState
                title="No contacts yet"
                subtitle="Add the people you want to keep track of."
                actionLabel="Add contact"
                onAction={() => navigation.navigate("ContactForm", undefined)}
              />
            )
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("ContactForm", undefined)}
        accessibilityRole="button"
        accessibilityLabel="Add contact"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: colors.primary,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add contact</Text>
      </Pressable>

      <ConfirmationSheet
        visible={contactPendingDelete !== null}
        title="Delete this contact?"
        message="This can't be undone."
        details={contactPendingDelete ? [{ label: "Name", value: contactPendingDelete.name }] : undefined}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setContactPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  card: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  importButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6 },
});
