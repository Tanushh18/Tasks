import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as notesApi from "../../api/notes";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { NotesStackParamList } from "../../navigation/types";
import { isNetworkFailure } from "../../offline/offlineQueue";
import { loadCache, saveCache } from "../../offline/readCache";
import { subscribeToReconnect } from "../../offline/useOfflineSync";
import { useTheme } from "../../theme/useTheme";
import type { Note, NoteColor } from "../../types/models";

type Props = NativeStackScreenProps<NotesStackParamList, "NotesList">;

const SEARCH_DEBOUNCE_MS = 300;

/** Soft pastel tints blended over the app's warm surface, one per allowed note color. */
const COLOR_TINTS: Record<NoteColor, string | undefined> = {
  default: undefined,
  peach: "#FBE3D3",
  sage: "#E1EBD9",
  sky: "#DDEAF3",
  lavender: "#E7E1F2",
  sand: "#F1E9D8",
};

export function NotesListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow, feature } = useTheme();
  const { user } = useAuth();

  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notePendingDelete, setNotePendingDelete] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showingOfflineData, setShowingOfflineData] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await notesApi.listNotes();
      setNotes(result);
      setShowingOfflineData(false);
      void saveCache("notes", result);
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await loadCache<Note[]>("notes");
        if (cached) {
          setNotes(cached);
          setShowingOfflineData(true);
          setLoading(false);
          return;
        }
      }
      setError(getApiErrorMessage(err, "We couldn't load your notes."));
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
    const base = !term
      ? notes
      : notes.filter(
          (n) => n.title.toLowerCase().includes(term) || n.body.toLowerCase().includes(term)
        );
    const pinned = base.filter((n) => n.pinned);
    const rest = base.filter((n) => !n.pinned);
    return { pinned, rest };
  }, [notes, debouncedSearch]);

  const toggleChecklistItem = useCallback(async (note: Note, itemIndex: number) => {
    const nextItems = note.items.map((item, idx) =>
      idx === itemIndex ? { ...item, done: !item.done } : item
    );
    // Optimistic update so tapping a checkbox in the list feels instant.
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, items: nextItems } : n)));
    try {
      await notesApi.updateNote(note.id, { items: nextItems });
    } catch (err) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, items: note.items } : n)));
      setError(getApiErrorMessage(err, "We couldn't update that checklist item."));
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    const note = notePendingDelete;
    if (!note) return;
    setDeleting(true);
    try {
      await notesApi.deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setNotePendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that note."));
    } finally {
      setDeleting(false);
    }
  }, [notePendingDelete]);

  function handleAddPress() {
    Alert.alert("Add a note", "Choose a note type.", [
      { text: "Text note", onPress: () => navigation.navigate("NoteForm", { type: "text" }) },
      { text: "Checklist", onPress: () => navigation.navigate("NoteForm", { type: "checklist" }) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function renderNote(item: Note) {
    const isOwner = item.ownerId.id === user?.id;
    const doneCount = item.items.filter((i) => i.done).length;
    const tint = COLOR_TINTS[item.color];
    const isPinned = item.pinned;
    const previewItems = item.type === "checklist" ? item.items.slice(0, 3) : [];
    return (
      <Card
        key={item.id}
        style={[styles.card, tint ? { backgroundColor: tint, borderColor: "transparent" } : null]}
      >
        <Pressable
          onPress={() => navigation.navigate("NoteForm", { noteId: item.id })}
          style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Open note ${item.title || "Untitled"}`}
        >
          <View style={styles.rowBetween}>
            <View style={[styles.rowBetween, { flex: 1, justifyContent: "flex-start", gap: 4 }]}>
              {isPinned ? <Ionicons name="pin" size={14} color={colors.primary} /> : null}
              <Text style={[typography.bodyStrong, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                {item.title || "Untitled"}
              </Text>
            </View>
            {!isOwner ? <Badge label={`Shared by ${item.ownerId.name}`} tone="primary" /> : null}
          </View>
          {item.type === "checklist" ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              {doneCount}/{item.items.length} done
            </Text>
          ) : item.body ? (
            <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}
        </Pressable>
        {isOwner ? (
          <Pressable
            onPress={() => setNotePendingDelete(item)}
            hitSlop={8}
            style={{ marginLeft: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.title || "note"}`}
          >
            <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}

        {previewItems.length > 0 ? (
          <View style={{ width: "100%", marginTop: spacing.sm, gap: 6 }}>
            {previewItems.map((checkItem, idx) => (
              <Pressable
                key={idx}
                onPress={() => toggleChecklistItem(item, idx)}
                style={({ pressed }) => [styles.checklistRow, { opacity: pressed ? 0.7 : 1 }]}
                hitSlop={4}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checkItem.done }}
                accessibilityLabel={`${checkItem.done ? "Mark incomplete" : "Mark complete"}: ${checkItem.text}`}
              >
                <Ionicons
                  name={checkItem.done ? "checkbox" : "square-outline"}
                  size={18}
                  color={checkItem.done ? colors.primary : colors.textFaint}
                />
                <Text
                  style={[
                    typography.caption,
                    {
                      color: checkItem.done ? colors.textFaint : colors.text,
                      textDecorationLine: checkItem.done ? "line-through" : "none",
                      marginLeft: 6,
                      flexShrink: 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {checkItem.text}
                </Text>
              </Pressable>
            ))}
            {item.items.length > previewItems.length ? (
              <Text style={[typography.caption, { color: colors.textFaint }]}>
                +{item.items.length - previewItems.length} more
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Notes
        </Text>

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
            placeholder="Search notes"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search notes"
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
      ) : filtered.pinned.length === 0 && filtered.rest.length === 0 ? (
        debouncedSearch.trim() ? (
          <EmptyState
            title="Nothing matched that"
            subtitle={`No notes found for "${debouncedSearch.trim()}".`}
            icon="search-outline"
            tone={feature.notes.solid}
            toneMuted={feature.notes.muted}
            actionLabel="Clear search"
            onAction={() => setSearch("")}
          />
        ) : (
          <EmptyState
            title="No notes yet"
            subtitle="Jot something down or make a checklist."
            icon="document-text-outline"
            tone={feature.notes.solid}
            toneMuted={feature.notes.muted}
            actionLabel="Add note"
            onAction={handleAddPress}
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.pinned.length > 0 ? (
            <>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                PINNED
              </Text>
              {filtered.pinned.map(renderNote)}
              <View style={{ height: spacing.md }} />
            </>
          ) : null}
          {filtered.rest.map(renderNote)}
        </ScrollView>
      )}

      <Pressable
        onPress={handleAddPress}
        accessibilityRole="button"
        accessibilityLabel="Add note"
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
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add note</Text>
      </Pressable>

      <ConfirmationSheet
        visible={notePendingDelete !== null}
        title="Delete this note?"
        message="This can't be undone."
        details={notePendingDelete ? [{ label: "Title", value: notePendingDelete.title || "Untitled" }] : undefined}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setNotePendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  card: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  checklistRow: { flexDirection: "row", alignItems: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
