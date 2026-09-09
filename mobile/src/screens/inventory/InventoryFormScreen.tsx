import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as inventoryApi from "../../api/inventoryItems";
import type { InventoryItemCategory } from "../../api/inventoryItems";
import { Button } from "../../components/Button";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import type { InventoryStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<InventoryStackParamList, "InventoryForm">;

const CATEGORIES: { key: InventoryItemCategory; label: string }[] = [
  { key: "appliance", label: "Appliance" },
  { key: "electronics", label: "Electronics" },
  { key: "furniture", label: "Furniture" },
  { key: "vehicle", label: "Vehicle" },
  { key: "other", label: "Other" },
];

export function InventoryFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { itemId } = route.params ?? {};
  const isEditing = Boolean(itemId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryItemCategory>("other");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [price, setPrice] = useState("");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    (async () => {
      try {
        const existing = await inventoryApi.getInventoryItem(itemId);
        setName(existing.name);
        setCategory(existing.category);
        setPurchaseDate(existing.purchaseDate ?? "");
        setPrice(existing.price != null ? String(existing.price) : "");
        setWarrantyExpiresAt(existing.warrantyExpiresAt ? existing.warrantyExpiresAt.slice(0, 10) : "");
        setSerialNumber(existing.serialNumber);
        setNotes(existing.notes);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId]);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    // Basic YYYY-MM-DD sanity checks — these fields are plain text inputs rather than a date
    // picker, matching how simple the rest of this form is meant to stay.
    if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      setError("Purchase date must be in YYYY-MM-DD format.");
      return;
    }
    if (warrantyExpiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(warrantyExpiresAt)) {
      setError("Warranty date must be in YYYY-MM-DD format.");
      return;
    }
    setSaving(true);
    const input = {
      name: name.trim(),
      category,
      purchaseDate: purchaseDate || null,
      price: price ? Number(price) : null,
      warrantyExpiresAt: warrantyExpiresAt ? new Date(`${warrantyExpiresAt}T00:00:00Z`).toISOString() : null,
      serialNumber,
      notes,
    };
    try {
      if (isEditing && itemId) {
        await inventoryApi.updateInventoryItem(itemId, input);
      } else {
        await inventoryApi.createInventoryItem(input);
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this item."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemId) return;
    setDeleting(true);
    try {
      await inventoryApi.deleteInventoryItem(itemId);
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this item."));
    } finally {
      setDeleting(false);
      setPendingDeleteConfirm(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit item" : "Add item"}
      </Text>

      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Refrigerator" />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Category</Text>
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: category === c.key }}
            style={[
              styles.chip,
              {
                borderRadius: radius.pill,
                borderColor: category === c.key ? colors.primary : colors.border,
                backgroundColor: category === c.key ? colors.primaryMuted : "transparent",
              },
            ]}
          >
            <Text style={[typography.caption, { color: category === c.key ? colors.primary : colors.textMuted }]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextField
        label="Purchase date"
        value={purchaseDate}
        onChangeText={setPurchaseDate}
        placeholder="YYYY-MM-DD"
      />
      <TextField label="Price" value={price} onChangeText={setPrice} placeholder="Optional" keyboardType="numeric" />
      <TextField
        label="Warranty expires"
        value={warrantyExpiresAt}
        onChangeText={setWarrantyExpiresAt}
        placeholder="YYYY-MM-DD, optional"
      />
      <TextField label="Serial number" value={serialNumber} onChangeText={setSerialNumber} placeholder="Optional" />
      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      <Button
        label={isEditing ? "Save changes" : "Add item"}
        size="large"
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.lg }}
      />

      {isEditing ? (
        <Button
          label="Delete item"
          variant="danger"
          onPress={() => setPendingDeleteConfirm(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <ConfirmationSheet
        visible={pendingDeleteConfirm}
        title="Delete this item?"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteConfirm(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth },
});
