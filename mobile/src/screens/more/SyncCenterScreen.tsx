import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/StateViews";
import { SyncIndicator } from "../../components/SyncIndicator";
import type { MoreStackParamList } from "../../navigation/types";
import {
  describeQueuedItem,
  discardFailedItem,
  flushQueue,
  listFailed,
  listPending,
  retryFailedItem,
  subscribeToQueueChanges,
  type FailedItem,
  type QueuedItem,
} from "../../offline/offlineQueue";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "SyncCenter">;

export function SyncCenterScreen({ navigation }: Props) {
  const { colors, spacing, typography, feature, touchTarget } = useTheme();
  const [pending, setPending] = useState<QueuedItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(() => {
    void listPending().then(setPending);
    void listFailed().then(setFailed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // The queue can also change from a background flush (e.g. reconnecting while this
      // screen is open) — stay live rather than only refreshing on focus.
      const unsubscribe = subscribeToQueueChanges(refresh);
      return unsubscribe;
    }, [refresh])
  );

  const handleRetryNow = useCallback(async () => {
    setRetrying(true);
    try {
      await flushQueue();
    } finally {
      setRetrying(false);
      refresh();
    }
  }, [refresh]);

  const handleRetryOne = useCallback(
    async (id: string) => {
      await retryFailedItem(id);
      refresh();
    },
    [refresh]
  );

  const handleDiscardOne = useCallback(
    async (id: string) => {
      await discardFailedItem(id);
      refresh();
    },
    [refresh]
  );

  return (
    <ScreenContainer onRefresh={refresh} refreshing={false} edges={["left", "right"]}>
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Sync Center
        </Text>
        <View style={{ marginTop: spacing.sm }}>
          <SyncIndicator />
        </View>
      </View>

      <Button
        label={retrying ? "Retrying…" : "Retry now"}
        onPress={handleRetryNow}
        loading={retrying}
        disabled={pending.length === 0}
        accessibilityLabel="Retry syncing now"
        accessibilityHint="Attempts to send every waiting change to the server immediately"
        style={{ marginBottom: spacing.xl }}
      />

      <SectionHeader title="Waiting to sync" subtitle={`${pending.length} change${pending.length === 1 ? "" : "s"}`} />
      {pending.length === 0 ? (
        <Card style={{ marginBottom: spacing.xl }}>
          <EmptyState
            icon="checkmark-done-outline"
            tone={feature.tasks.solid}
            toneMuted={feature.tasks.muted}
            title="Nothing waiting"
            subtitle="Every change has been sent to the server."
          />
        </Card>
      ) : (
        <View style={{ marginBottom: spacing.xl }}>
          {pending.map((item) => (
            <Card key={item.id} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <Ionicons name="time-outline" size={18} color={colors.warning} />
                <Text style={[typography.body, { color: colors.text, marginLeft: spacing.sm, flex: 1 }]}>
                  {describeQueuedItem(item)}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {failed.length > 0 ? (
        <View>
          <SectionHeader title="Failed" subtitle={`${failed.length} couldn't be sent`} />
          {failed.map(({ item, reason }) => (
            <Card key={item.id} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[typography.body, { color: colors.text }]}>{describeQueuedItem(item)}</Text>
                  <Text style={[typography.caption, { color: colors.danger, marginTop: 2 }]}>Failed: {reason}</Text>
                </View>
              </View>
              <View style={[styles.actions, { marginTop: spacing.sm, gap: spacing.lg }]}>
                <Pressable
                  onPress={() => handleRetryOne(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retry: ${describeQueuedItem(item)}`}
                  style={{ minHeight: touchTarget.min, justifyContent: "center" }}
                >
                  <Text style={[typography.captionStrong, { color: colors.primary }]}>Retry</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDiscardOne(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Discard: ${describeQueuedItem(item)}`}
                  style={{ minHeight: touchTarget.min, justifyContent: "center" }}
                >
                  <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Discard</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row" },
});
