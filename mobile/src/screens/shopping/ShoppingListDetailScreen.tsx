import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as shoppingApi from "../../api/shoppingLists";
import type { ShoppingItem, ShoppingList } from "../../api/shoppingLists";
import type { UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonLines } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import { UserPicker } from "../../components/UserPicker";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "ShoppingListDetail">;

export function ShoppingListDetailScreen({ route }: Props) {
  const { colors, feature, spacing, radius, typography, touchTarget } = useTheme();
  const { user } = useAuth();
  const { listId } = route.params;

  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await shoppingApi.getList(listId);
      setList(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load this list."));
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function handleAddItem() {
    const text = newItemText.trim();
    if (!text || !list) return;
    setAdding(true);
    try {
      const updated = await shoppingApi.addItem(list.id, text);
      setList(updated);
      setNewItemText("");
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't add that item."));
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(item: ShoppingItem) {
    if (!list) return;
    // Optimistic toggle so tapping a checkbox feels instant, matching the notes checklist pattern.
    const nextItems = list.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i));
    setList({ ...list, items: nextItems });
    try {
      const updated = await shoppingApi.setItemChecked(list.id, item.id, !item.checked);
      setList(updated);
    } catch (err) {
      setList((prev) => (prev ? { ...prev, items: list.items } : prev));
      setError(getApiErrorMessage(err, "We couldn't update that item."));
    }
  }

  async function removeItem(item: ShoppingItem) {
    if (!list) return;
    const previous = list;
    setList({ ...list, items: list.items.filter((i) => i.id !== item.id) });
    try {
      const updated = await shoppingApi.removeItem(list.id, item.id);
      setList(updated);
    } catch (err) {
      setList(previous);
      setError(getApiErrorMessage(err, "We couldn't remove that item."));
    }
  }

  async function updateShared(people: UserSearchResult[]) {
    if (!list) return;
    const previous = list;
    setList({ ...list, sharedWith: people });
    try {
      const updated = await shoppingApi.updateList(list.id, { sharedWithIds: people.map((p) => p.id) });
      setList(updated);
    } catch (err) {
      setList(previous);
      setError(getApiErrorMessage(err, "We couldn't update sharing."));
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <SkeletonLines count={6} />
      </ScreenContainer>
    );
  }

  if (error && !list) {
    return (
      <ScreenContainer>
        <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
      </ScreenContainer>
    );
  }

  if (!list) return null;

  const isOwner = list.createdBy?.id === user?.id;
  const checkedCount = list.items.filter((i) => i.checked).length;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
        {list.name}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg }]}>
        {checkedCount}/{list.items.length} checked
      </Text>

      <View
        style={[
          styles.addRow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.md,
            marginBottom: spacing.lg,
            minHeight: touchTarget.comfortable,
          },
        ]}
      >
        <TextInput
          value={newItemText}
          onChangeText={setNewItemText}
          placeholder="Add an item"
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
          accessibilityLabel="New item text"
          style={[styles.addInput, { color: colors.text, minHeight: touchTarget.comfortable }]}
        />
        <Pressable
          onPress={handleAddItem}
          disabled={adding || !newItemText.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add item"
          hitSlop={8}
          style={{ opacity: adding || !newItemText.trim() ? 0.4 : 1, marginRight: spacing.sm }}
        >
          <Ionicons name="add-circle" size={28} color={feature.notes.solid} />
        </Pressable>
      </View>

      {list.items.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.lg }]}>
          No items yet. Add your first one above.
        </Text>
      ) : (
        list.items.map((item) => (
          <View key={item.id} style={[styles.itemRow, { marginBottom: spacing.sm }]}>
            <Pressable
              onPress={() => toggleItem(item)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
              accessibilityLabel={`${item.checked ? "Mark not bought" : "Mark bought"}: ${item.text}`}
              hitSlop={8}
              style={styles.itemPressArea}
            >
              <Ionicons
                name={item.checked ? "checkbox" : "square-outline"}
                size={22}
                color={item.checked ? feature.notes.solid : colors.textFaint}
              />
              <Text
                style={[
                  typography.body,
                  {
                    color: item.checked ? colors.textFaint : colors.text,
                    textDecorationLine: item.checked ? "line-through" : "none",
                    marginLeft: spacing.sm,
                    flexShrink: 1,
                  },
                ]}
              >
                {item.text}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => removeItem(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.text}`}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
        ))
      )}

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>{error}</Text>
      ) : null}

      {isOwner ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            Shared with
          </Text>
          <UserPicker
            mode="multi"
            value={list.sharedWith}
            onChange={updateShared}
            placeholder="Search people by name"
            excludeIds={user ? [user.id] : []}
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingLeft: 12 },
  addInput: { flex: 1, fontSize: 16 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemPressArea: { flexDirection: "row", alignItems: "center", flex: 1 },
});
