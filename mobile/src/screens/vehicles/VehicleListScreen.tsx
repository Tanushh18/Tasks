import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as vehiclesApi from "../../api/vehicles";
import type { Vehicle } from "../../api/vehicles";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { VehicleStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<VehicleStackParamList, "VehicleList">;

export function VehicleListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await vehiclesApi.listVehicles();
      setVehicles(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your vehicles."));
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
    const vehicle = pendingDelete;
    if (!vehicle) return;
    setDeleting(true);
    try {
      await vehiclesApi.deleteVehicle(vehicle.id);
      setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));
      setPendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that vehicle."));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Vehicle Management
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
      ) : vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          subtitle="Add a vehicle to track its documents, expiry dates, and reminders."
          icon="car-outline"
          tone={colors.primary}
          toneMuted={colors.primaryMuted}
          actionLabel="Add vehicle"
          onAction={() => navigation.navigate("VehicleForm", undefined)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}>
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} style={[styles.card, { marginBottom: spacing.md }]}>
              <Pressable
                onPress={() => navigation.navigate("VehicleDetail", { vehicleId: vehicle.id, name: vehicle.name })}
                style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Open vehicle ${vehicle.name}`}
              >
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{vehicle.name}</Text>
                {vehicle.sharedWith.length > 0 ? (
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    Shared with {vehicle.sharedWith.length} {vehicle.sharedWith.length === 1 ? "person" : "people"}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable
                onPress={() => setPendingDelete(vehicle)}
                hitSlop={8}
                style={{ marginLeft: spacing.sm, minWidth: touchTarget.min, alignItems: "center" }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${vehicle.name}`}
              >
                <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
              </Pressable>
            </Card>
          ))}
        </ScrollView>
      )}

      {vehicles.length > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("VehicleForm", undefined)}
          accessibilityRole="button"
          accessibilityLabel="Add vehicle"
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
        title="Delete this vehicle?"
        message="This can't be undone. Its documents will be deleted too."
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
