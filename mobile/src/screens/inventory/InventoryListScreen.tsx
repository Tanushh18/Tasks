import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as inventoryApi from "../../api/inventoryItems";
import type { InventoryItem } from "../../api/inventoryItems";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { InventoryStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<InventoryStackParamList, "InventoryList">;

const CATEGORY_LABELS: Record<InventoryItem["category"], string> = {
  appliance: "Appliance",
  electronics: "Electronics",
  furniture: "Furniture",
  vehicle: "Vehicle",
  other: "Other",
};

function warrantyLabel(warrantyExpiresAt: string | null): { label: string; soon: boolean } | null {
  if (!warrantyExpiresAt) return null;
  const days = Math.ceil((new Date(warrantyExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: "Warranty expired", soon: true };
  if (days <= 30) return { label: `Warranty ends in ${days}d`, soon: true };
  return { label: `Warranty until ${new Date(warrantyExpiresAt).toLocaleDateString()}`, soon: false };
}

export function InventoryListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await inventoryApi.listInventoryItems();
      setItems(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your inventory."));
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

  const confirmDelete = useCallback(async () => {
    const item = pendingDelete;
    if (!item) return;
    setDeleting(true);
    try {
      await inventoryApi.deleteInventoryItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setPendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that item."));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Household Inventory
        </Text>
      </View>

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
      ) : items.length === 0 ? (
        <EmptyState
          title="No items yet"
          subtitle="Track appliances, electronics, and other belongings with purchase and warranty details."
          actionLabel="Add item"
          onAction={() => navigation.navigate("InventoryForm", undefined)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}>
          {items.map((item) => {
            const warranty = warrantyLabel(item.warrantyExpiresAt);
            return (
              <Card key={item.id} style={[styles.card, { marginBottom: spacing.md }]}>
                <Pressable
                  onPress={() => navigation.navigate("InventoryForm", { itemId: item.id })}
                  style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open item ${item.name}`}
                >
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {CATEGORY_LABELS[item.category]}
                    {item.price != null ? ` · ${item.price}` : ""}
                  </Text>
                  {warranty ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: warranty.soon ? colors.danger : colors.textFaint, marginTop: 2 },
                      ]}
                    >
                      {warranty.label}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => setPendingDelete(item)}
                  hitSlop={8}
                  style={{ marginLeft: spacing.sm, minWidth: touchTarget.min, alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.name}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                </Pressable>
              </Card>
            );
          })}
        </ScrollView>
      )}

      {items.length > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("InventoryForm", undefined)}
          accessibilityRole="button"
          accessibilityLabel="Add item"
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
          <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add</Text>
        </Pressable>
      ) : null}

      <ConfirmationSheet
        visible={pendingDelete !== null}
        title="Delete this item?"
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
  card: { flexDirection: "row", alignItems: "flex-start" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
