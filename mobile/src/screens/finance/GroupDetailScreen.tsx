import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as groupExpenseApi from "../../api/groupExpenses";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonLines } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import type { FinanceStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel } from "../../utils/date";

type Props = NativeStackScreenProps<FinanceStackParamList, "GroupDetail">;

export function GroupDetailScreen({ route, navigation }: Props) {
  const { groupId, name } = route.params;
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const { user } = useAuth();

  const [summary, setSummary] = useState<groupExpenseApi.GroupBalanceSummary | null>(null);
  const [expenses, setExpenses] = useState<groupExpenseApi.GroupExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: name,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("GroupForm", { groupId })}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit group"
        >
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, name, groupId, colors.primary]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [balanceSummary, expenseList] = await Promise.all([
        groupExpenseApi.getBalances(groupId),
        groupExpenseApi.listExpenses(groupId),
      ]);
      setSummary(balanceSummary);
      setExpenses(expenseList);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load this group's expenses."));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function deleteExpense(expenseId: string) {
    Alert.alert("Delete this expense?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await groupExpenseApi.deleteExpense(groupId, expenseId);
            load();
          } catch (err) {
            Alert.alert("We couldn't delete that expense", getApiErrorMessage(err));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !summary) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <ErrorState
          message={error ?? "Something went wrong."}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Total spent</Text>
          <Text style={[typography.amount, { color: colors.text, marginTop: 2 }]}>
            {formatCurrency(summary.totalSpent)}
          </Text>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Each person's share" />
        </View>
        {summary.balances.map((balance) => {
          const isMe = balance.userId === user?.id;
          return (
            <Card key={balance.userId} style={{ marginTop: spacing.sm }}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>
                    {balance.name}
                    {isMe ? " (you)" : ""}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    Paid {formatCurrency(balance.paid)} · Share {formatCurrency(balance.owed)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      typography.h3,
                      { color: balance.net > 0.005 ? colors.success : balance.net < -0.005 ? colors.danger : colors.textMuted },
                    ]}
                  >
                    {balance.net > 0.005 ? "+" : ""}
                    {formatCurrency(balance.net)}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textFaint }]}>
                    {balance.net > 0.005 ? "is owed" : balance.net < -0.005 ? "owes" : "settled up"}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title="Who pays whom"
            subtitle={summary.transfers.length === 0 ? "Everyone is settled up" : `${summary.transfers.length} payment${summary.transfers.length === 1 ? "" : "s"} to settle up`}
          />
        </View>
        {summary.transfers.map((transfer, index) => (
          <Card key={`${transfer.from.id}-${transfer.to.id}-${index}`} style={{ marginTop: spacing.sm }}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={[typography.body, { color: colors.text }]}>
                  <Text style={typography.bodyStrong}>{transfer.from.name}</Text> owes{" "}
                  <Text style={typography.bodyStrong}>{transfer.to.name}</Text>
                </Text>
                <Text style={[typography.h3, { color: colors.text, marginTop: 2 }]}>
                  {formatCurrency(transfer.amount)}
                </Text>
              </View>
              <Button
                label="Settle"
                size="regular"
                variant="secondary"
                onPress={() =>
                  navigation.navigate("GroupSettleForm", {
                    groupId,
                    fromUserId: transfer.from.id,
                    toUserId: transfer.to.id,
                    amount: transfer.amount,
                  })
                }
              />
            </View>
          </Card>
        ))}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Expenses" subtitle={`${expenses.length} logged`} />
        </View>
        {expenses.length === 0 ? (
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
            No expenses logged yet. Add the first one below.
          </Text>
        ) : (
          expenses.map((expense) => (
            <Card key={expense.id} style={{ marginTop: spacing.sm }}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <View style={styles.rowBetween}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {expense.description || expense.category}
                    </Text>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>
                      {formatCurrency(expense.amount)}
                    </Text>
                  </View>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    Paid by {expense.paidBy?.name ?? "someone removed"} · {formatDateLabel(expense.date)}
                  </Text>
                  <View style={[styles.splitRow, { marginTop: spacing.xs }]}>
                    {expense.splits.map((split, i) => (
                      <Badge
                        key={`${split.user?.id ?? i}`}
                        label={`${split.user?.name ?? "?"} ${formatCurrency(split.amount)}`}
                        tone="neutral"
                      />
                    ))}
                  </View>
                </View>
                <Pressable onPress={() => deleteExpense(expense.id)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
                  <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                </Pressable>
              </View>
            </Card>
          ))
        )}
      </View>

      <View
        style={[
          styles.footer,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
        ]}
      >
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Button
            label="Add expense"
            onPress={() => navigation.navigate("GroupExpenseForm", { groupId })}
            style={{ flex: 1 }}
          />
          <Button
            label="Settle up"
            variant="secondary"
            onPress={() => navigation.navigate("GroupSettleForm", { groupId })}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  splitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
