import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as recurringPaymentsApi from "../../api/recurringPayments";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, todayIso } from "../../utils/date";

type Props = NativeStackScreenProps<MoreStackParamList, "RecurringPaymentsList">;

const STATUS_TONE: Record<recurringPaymentsApi.RecurringPaymentStatus, "danger" | "warning" | "neutral" | "success"> = {
  overdue: "danger",
  "due-soon": "warning",
  upcoming: "neutral",
  paid: "success",
};

const STATUS_LABEL: Record<recurringPaymentsApi.RecurringPaymentStatus, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  upcoming: "Upcoming",
  paid: "Inactive",
};

export function RecurringPaymentsListScreen({ navigation }: Props) {
  const { colors, feature, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [payments, setPayments] = useState<recurringPaymentsApi.RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPayments(await recurringPaymentsApi.listPayments());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your recurring payments."));
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

  async function handleMarkPaid(payment: recurringPaymentsApi.RecurringPayment) {
    Alert.alert(
      `Mark "${payment.name}" as paid?`,
      "This is tracking only — no payment is actually sent. It just records that the bill was paid and moves the due date forward.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark paid",
          onPress: async () => {
            setMarkingId(payment.id);
            try {
              await recurringPaymentsApi.markPaid(payment.id, { date: todayIso() });
              load();
            } catch (err) {
              Alert.alert("We couldn't record this payment", getApiErrorMessage(err));
            } finally {
              setMarkingId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Recurring Payments
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>
          Track rent, bills and subscriptions. This is tracking only — nothing is paid automatically.
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={4} />
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <Pressable
                onPress={() => navigation.navigate("RecurringPaymentForm", { paymentId: item.id })}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.name}`}
              >
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      {item.category} · {item.frequency} · due {formatDateLabel(item.nextDueDate)}
                    </Text>
                  </View>
                  <Text style={[typography.bodyStrong, { color: feature.finance.solid }]}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
                <Badge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
                <Pressable
                  onPress={() => handleMarkPaid(item)}
                  disabled={markingId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${item.name} as paid`}
                  style={({ pressed }) => [
                    styles.markPaidButton,
                    {
                      backgroundColor: feature.finance.muted,
                      borderRadius: radius.pill,
                      minHeight: touchTarget.comfortable,
                      opacity: pressed || markingId === item.id ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={feature.finance.solid} />
                  <Text style={[typography.captionStrong, { color: feature.finance.solid, marginLeft: 6 }]}>
                    Mark paid
                  </Text>
                </Pressable>
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No recurring payments yet"
              subtitle="Add rent, electricity, or a subscription to keep track of when it's due."
              actionLabel="Add a recurring payment"
              onAction={() => navigation.navigate("RecurringPaymentForm", undefined)}
              icon="repeat-outline"
              tone={feature.finance.solid}
              toneMuted={feature.finance.muted}
            />
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("RecurringPaymentForm", undefined)}
        accessibilityRole="button"
        accessibilityLabel="New recurring payment"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: feature.finance.solid,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>New payment</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  markPaidButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
