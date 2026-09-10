import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as shoppingApi from "../../api/shoppingLists";
import type { ShoppingList } from "../../api/shoppingLists";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "ShoppingLists">;

export function ShoppingListsScreen({ navigation }: Props) {
  const { colors, feature, spacing, radius, typography, touchTarget, shadow } = useTheme();
  const { user } = useAuth();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShoppingList | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [savingNewList, setSavingNewList] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await shoppingApi.listLists();
      setLists(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your shopping lists."));
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

  function handleAddPress() {
    setCreateError(null);
    setNewListName("");
    setCreating(true);
  }

  async function handleCreateList() {
    const trimmed = newListName.trim();
    if (!trimmed) {
      setCreateError("Give this list a name.");
      return;
    }
    setSavingNewList(true);
    setCreateError(null);
    try {
      const created = await shoppingApi.createList({ name: trimmed });
      setCreating(false);
      navigation.navigate("ShoppingListDetail", { listId: created.id, name: created.name });
    } catch (err) {
      setCreateError(getApiErrorMessage(err, "Could not create this list."));
    } finally {
      setSavingNewList(false);
    }
  }

  async function confirmDelete() {
    const list = pendingDelete;
    if (!list) return;
    setDeleting(true);
    try {
      await shoppingApi.deleteList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      setPendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that list."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={["left", "right"]}>
      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={5} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, flexGrow: 1 }}
          renderItem={({ item }) => {
            const isOwner = item.createdBy?.id === user?.id;
            const doneCount = item.items.filter((i) => i.checked).length;
            return (
              <Card style={styles.card}>
                <Pressable
                  onPress={() => navigation.navigate("ShoppingListDetail", { listId: item.id, name: item.name })}
                  style={({ pressed }) => [styles.flex, styles.row, { opacity: pressed ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open list ${item.name}`}
                >
                  <View
                    style={[styles.iconTile, { backgroundColor: feature.notes.muted, marginRight: spacing.md }]}
                    accessibilityElementsHidden
                  >
                    <Ionicons name="cart-outline" size={20} color={feature.notes.solid} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      {doneCount}/{item.items.length} checked
                    </Text>
                  </View>
                </Pressable>
                {isOwner ? (
                  <Pressable
                    onPress={() => setPendingDelete(item)}
                    hitSlop={8}
                    style={{ marginLeft: spacing.sm }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.name}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No shopping lists yet"
              subtitle="Create a list and start adding items."
              actionLabel="New list"
              onAction={handleAddPress}
              icon="cart-outline"
              tone={feature.notes.solid}
              toneMuted={feature.notes.muted}
            />
          }
        />
      )}

      <Pressable
        onPress={handleAddPress}
        accessibilityRole="button"
        accessibilityLabel="New list"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: feature.notes.solid,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
        <Text style={[typography.bodyStrong, { color: "#FFFFFF", marginLeft: spacing.xs }]}>New list</Text>
      </Pressable>

      {creating ? (
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreating(false)} accessibilityLabel="Dismiss" accessibilityRole="button" />
          <Card style={{ margin: spacing.lg }}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>New list</Text>
            <TextField
              label="Name"
              value={newListName}
              onChangeText={setNewListName}
              placeholder="e.g. Grocery, Travel"
              error={createError ?? undefined}
            />
            <Button label="Create" onPress={handleCreateList} loading={savingNewList} />
            <Button label="Cancel" variant="ghost" onPress={() => setCreating(false)} disabled={savingNewList} style={{ marginTop: spacing.sm }} />
          </Card>
        </View>
      ) : null}

      <ConfirmationSheet
        visible={pendingDelete !== null}
        title="Delete this list?"
        message="This can't be undone."
        details={pendingDelete ? [{ label: "Name", value: pendingDelete.name }] : undefined}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  card: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  iconTile: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center" },
});
