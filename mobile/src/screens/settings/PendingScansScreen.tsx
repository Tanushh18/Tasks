import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { EmptyState } from "../../components/StateViews";
import { scanImageWithFallback } from "../../localServer/ocrWithFallback";
import { listPendingScans, removePendingScan, type PendingScan } from "../../localServer/pendingScans";
import { subscribeToReconnect } from "../../offline/useOfflineSync";
import type { SettingsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<SettingsStackParamList, "PendingScans">;

function formatCapturedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function PendingScansScreen({}: Props) {
  const { colors, spacing, typography } = useTheme();
  const [scans, setScans] = useState<PendingScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setScans(await listPendingScans());
  }, []);

  // Silently retry everything pending once connectivity is back, and again whenever this screen
  // is opened — no per-item alert, just an updated list.
  const attemptAll = useCallback(async () => {
    const pending = await listPendingScans();
    for (const scan of pending) {
      try {
        const base64 = await FileSystem.readAsStringAsync(scan.uri, { encoding: FileSystem.EncodingType.Base64 });
        if (scan.target === "contact") await scanImageWithFallback(base64, "contact");
        else await scanImageWithFallback(base64, "receipt");
        await removePendingScan(scan.id);
      } catch {
        // Still unreachable, or a genuine error — leave it queued and try the rest.
      }
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
      void attemptAll();
    })();
    const unsubscribe = subscribeToReconnect(() => void attemptAll());
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleProcessNow(scan: PendingScan) {
    setProcessingId(scan.id);
    try {
      const base64 = await FileSystem.readAsStringAsync(scan.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (scan.target === "contact") {
        const found = await scanImageWithFallback(base64, "contact");
        await removePendingScan(scan.id);
        await refresh();
        Alert.alert(
          "Found in the photo",
          `Name: ${found.name || "—"}\nNumber: ${found.number || "—"}\n\nOpen "Add contact" to save these.`
        );
      } else {
        const found = await scanImageWithFallback(base64, "receipt");
        await removePendingScan(scan.id);
        await refresh();
        Alert.alert(
          "Found in the photo",
          `Amount: ${found.amount ?? "—"}\nMerchant: ${found.merchant || "—"}\nDate: ${found.date || "—"}\nCategory: ${found.category || "—"}\n\nOpen "Add expense" to save these.`
        );
      }
    } catch {
      Alert.alert("Still couldn't process this", "We'll keep it saved and try again automatically once you're back online.");
    } finally {
      setProcessingId(null);
    }
  }

  if (!loading && scans.length === 0) {
    return (
      <ScreenContainer>
        <EmptyState title="Nothing pending" subtitle="Photos scanned while offline will show up here." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        Pending scans
      </Text>
      <FlatList
        data={scans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Image source={{ uri: item.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>
                {item.target === "contact" ? "Contact card" : "Receipt"}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                Captured {formatCapturedAt(item.createdAt)}
              </Text>
            </View>
            {processingId === item.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Button label="Process now" variant="secondary" onPress={() => handleProcessNow(item)} />
            )}
          </Card>
        )}
      />
    </ScreenContainer>
  );
}
