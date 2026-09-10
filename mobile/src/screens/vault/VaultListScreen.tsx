import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as vaultApi from "../../api/vaultDocuments";
import type { VaultDocument } from "../../api/vaultDocuments";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { VaultStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<VaultStackParamList, "VaultList">;

const CATEGORY_LABELS: Record<VaultDocument["category"], string> = {
  insurance: "Insurance",
  warranty: "Warranty",
  vehicle: "Vehicle",
  property: "Property",
  other: "Other",
};

function formatExpiry(expiresAt: string | null): { label: string; soon: boolean } | null {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: "Expired", soon: true };
  if (days <= 30) return { label: `Expires in ${days}d`, soon: true };
  return { label: `Expires ${new Date(expiresAt).toLocaleDateString()}`, soon: false };
}

export function VaultListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VaultDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await vaultApi.listVaultDocuments();
      setDocuments(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your documents."));
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
    const doc = pendingDelete;
    if (!doc) return;
    setDeleting(true);
    try {
      await vaultApi.deleteVaultDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setPendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that document."));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Document Vault
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
          subtitle="Store insurance papers, warranties, and other important documents here."
          icon="folder-outline"
          tone={colors.primary}
          toneMuted={colors.primaryMuted}
          actionLabel="Add document"
          onAction={() => navigation.navigate("VaultForm", undefined)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}>
          {documents.map((doc) => {
            const expiry = formatExpiry(doc.expiresAt);
            return (
              <Card key={doc.id} style={[styles.card, { marginBottom: spacing.md }]}>
                <Pressable
                  onPress={() => navigation.navigate("VaultForm", { documentId: doc.id })}
                  style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open document ${doc.title}`}
                >
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{doc.title}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {CATEGORY_LABELS[doc.category]}
                  </Text>
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
                </Pressable>
                <Pressable
                  onPress={() => setPendingDelete(doc)}
                  hitSlop={8}
                  style={{ marginLeft: spacing.sm, minWidth: touchTarget.min, alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${doc.title}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                </Pressable>
              </Card>
            );
          })}
        </ScrollView>
      )}

      {documents.length > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("VaultForm", undefined)}
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
          <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add</Text>
        </Pressable>
      ) : null}

      <ConfirmationSheet
        visible={pendingDelete !== null}
        title="Delete this document?"
        message="This can't be undone."
        details={pendingDelete ? [{ label: "Title", value: pendingDelete.title }] : undefined}
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
