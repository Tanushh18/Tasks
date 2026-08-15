import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, formatTimeLabel } from "../../utils/date";
import type { FinanceAccount, Transaction } from "../../types/models";
import type { FinanceStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<FinanceStackParamList, "AccountDetail">;

export function AccountDetailScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { accountId } = route.params;

  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accounts, txns] = await Promise.all([
        financeApi.listAccounts(true),
        financeApi.listTransactions({ accountId, limit: 100 }),
      ]);
      const found = accounts.find((a) => a.id === accountId) ?? null;
      setAccount(found);
      setTransactions(txns);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load this account."));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: account?.name ?? "Account",
      headerRight: () =>
        account ? (
          <Pressable onPress={() => navigation.navigate("AccountForm", { accountId })} hitSlop={8}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null,
    });
  }, [navigation, account, accountId, colors.primary]);

  function handleDeleteTransaction(transaction: Transaction) {
    Alert.alert("Delete transaction", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await financeApi.deleteTransaction(transaction.id);
            setTransactions((prev) => prev.filter((t) => t.id !== transaction.id));
          } catch (err) {
            Alert.alert("Couldn't delete transaction", getApiErrorMessage(err));
          }
        },
      },
    ]);
  }

  if (loading) return <LoadingState label="Loading account…" />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;
  if (!account) return <EmptyState title="Account not found" />;

  const cashIn = transactions.filter((t) => t.type === "IN").reduce((sum, t) => sum + t.amount, 0);
  const cashOut = transactions.filter((t) => t.type === "OUT").reduce((sum, t) => sum + t.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.totalsRow}>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Cash In</Text>
              <Text style={[typography.h3, { color: colors.success }]}>{formatCurrency(cashIn)}</Text>
            </View>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Cash Out</Text>
              <Text style={[typography.h3, { color: colors.danger }]}>{formatCurrency(cashOut)}</Text>
            </View>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Balance</Text>
              <Text style={[typography.h3, { color: colors.text }]}>{formatCurrency(cashIn - cashOut)}</Text>
            </View>
          </View>
        </Card>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, flexGrow: 1 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("TransactionForm", { accountId, transactionId: item.id })}
            onLongPress={() => handleDeleteTransaction(item)}
          >
            <Card style={styles.txnCard}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.category}</Text>
                {item.description ? (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{item.description}</Text>
                ) : null}
                <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}>
                  {formatDateLabel(item.date)} · {formatTimeLabel(item.time)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[typography.bodyStrong, { color: item.type === "IN" ? colors.success : colors.danger }]}>
                  {item.type === "IN" ? "+" : "-"}
                  {formatCurrency(item.amount)}
                </Text>
                <Badge label={item.type} tone={item.type === "IN" ? "success" : "danger"} />
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState title="No transactions yet" subtitle="Add your first cash in or cash out below." />
        }
      />

      <View style={[styles.actionRow, { padding: spacing.lg, backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => navigation.navigate("TransactionForm", { accountId, type: "IN" })}
          style={[styles.actionButton, { backgroundColor: colors.successMuted, borderRadius: radius.md }]}
        >
          <Ionicons name="arrow-down-circle" size={20} color={colors.success} />
          <Text style={[typography.bodyStrong, { color: colors.success, marginLeft: spacing.xs }]}>Cash In</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("TransactionForm", { accountId, type: "OUT" })}
          style={[styles.actionButton, { backgroundColor: colors.dangerMuted, borderRadius: radius.md }]}
        >
          <Ionicons name="arrow-up-circle" size={20} color={colors.danger} />
          <Text style={[typography.bodyStrong, { color: colors.danger, marginLeft: spacing.xs }]}>Cash Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  txnCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", height: 48 },
});
