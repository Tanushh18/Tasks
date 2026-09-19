import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as vehicleDocumentsApi from "../../api/vehicleDocuments";
import type { VehicleDocument, VehicleDocumentType } from "../../api/vehicleDocuments";
import { Card } from "../../components/Card";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { VehicleStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<VehicleStackParamList, "VehicleDetail">;

const TYPE_LABELS: Record<VehicleDocumentType, string> = {
  pollution: "Pollution",
  insurance: "Insurance",
  registration: "Registration",
  service: "Service",
  warranty: "Warranty",
  other: "Other",
};

function formatExpiry(expiresAt: string | null): { label: string; soon: boolean } | null {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: "Expired", soon: true };
  if (days <= 30) return { label: `Expires in ${days}d`, soon: true };
  return { label: `Expires ${new Date(expiresAt).toLocaleDateString()}`, soon: false };
}

export function VehicleDetailScreen({ navigation, route }: Props) {
  const { vehicleId, name } = route.params;
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await vehicleDocumentsApi.listVehicleDocuments(vehicleId);
      setDocuments(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load this vehicle's documents."));
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          {name}
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
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          subtitle="Add pollution, insurance, registration and other documents for this vehicle."
          icon="document-text-outline"
          tone={colors.primary}
          toneMuted={colors.primaryMuted}
          actionLabel="Add document"
          onAction={() => navigation.navigate("VehicleDocumentForm", { vehicleId })}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}>
          {documents.map((doc) => {
            const expiry = formatExpiry(doc.expiresAt);
            const label = doc.type === "other" && doc.customLabel ? doc.customLabel : TYPE_LABELS[doc.type];
            return (
              <Pressable
                key={doc.id}
                onPress={() => navigation.navigate("VehicleDocumentForm", { vehicleId, documentId: doc.id })}
                accessibilityRole="button"
                accessibilityLabel={`Open document ${label}`}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <Card style={[styles.card, { marginBottom: spacing.md }]}>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{label}</Text>
                    {expiry ? (
                      <Text
                        style={[
                          typography.caption,
                          { color: expiry.soon ? colors.danger : colors.textFaint, marginTop: 2 },
                        ]}
                      >
                        {expiry.label}
                      </Text>
                    ) : null}
                  </View>
                  {doc.reminderEnabled ? (
                    <Ionicons name="notifications-outline" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
                  ) : null}
                  <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {documents.length > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("VehicleDocumentForm", { vehicleId })}
          accessibilityRole="button"
          accessibilityLabel="Add document"
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
          <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add document</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flexDirection: "row", alignItems: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
