import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import { listFamilyMembers, type UserSearchResult } from "../../api/users";
import * as vehiclesApi from "../../api/vehicles";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import type { VehicleStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<VehicleStackParamList, "VehicleForm">;

export function VehicleFormScreen({ navigation, route }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();
  const { vehicleId } = route.params ?? {};
  const isEditing = Boolean(vehicleId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sharedWith, setSharedWith] = useState<UserSearchResult[]>([]);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    (async () => {
      try {
        const [existing, members] = await Promise.all([
          vehiclesApi.getVehicle(vehicleId),
          listFamilyMembers().catch(() => []),
        ]);
        setName(existing.name);
        const byId = new Map(members.map((m) => [m.id, m]));
        setSharedWith(existing.sharedWith.map((id) => byId.get(id)).filter(Boolean) as UserSearchResult[]);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [vehicleId]);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    const input = { name: name.trim(), sharedWith: sharedWith.map((u) => u.id) };
    try {
      if (isEditing && vehicleId) {
        await vehiclesApi.updateVehicle(vehicleId, input);
      } else {
        await vehiclesApi.createVehicle(input);
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this vehicle."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!vehicleId) return;
    setDeleting(true);
    try {
      await vehiclesApi.deleteVehicle(vehicleId);
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this vehicle."));
    } finally {
      setDeleting(false);
      setPendingDeleteConfirm(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit vehicle" : "Add vehicle"}
      </Text>

      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Kiger Car" />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        Share with family
      </Text>
      <UserPicker
        mode="multi"
        value={sharedWith}
        onChange={setSharedWith}
        placeholder="Search people by name"
        excludeIds={user ? [user.id] : []}
      />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      <Button
        label={isEditing ? "Save changes" : "Add vehicle"}
        size="large"
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.lg }}
      />

      {isEditing ? (
        <Button
          label="Delete vehicle"
          variant="danger"
          onPress={() => setPendingDeleteConfirm(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <ConfirmationSheet
        visible={pendingDeleteConfirm}
        title="Delete this vehicle?"
        message="This can't be undone. Its documents will be deleted too."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteConfirm(false)}
      />
    </ScreenContainer>
  );
}
