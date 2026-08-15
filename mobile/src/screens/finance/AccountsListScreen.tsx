import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import type { AccountSummary } from "../../types/models";
import type { FinanceStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<FinanceStackParamList, "AccountsList">;

export function AccountsListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [totals, setTotals] = useState({ cashIn: 0, cashOut: 0, netFlow: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const summary = await financeApi.getFinancialSummary();
      setAccounts(summary.accounts);
      setTotals({ cashIn: summary.cashIn, cashOut: summary.cashOut, netFlow: summary.netFlow });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load your accounts."));
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <Text style={[typography.h1, { color: colors.text }]}>Finance</Text>
          <Pressable onPress={() => navigation.navigate("Insights")} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="bar-chart-outline" size={24} color={colors.textMuted} />
          </Pressable>
        </View>

        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.totalsRow}>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Cash In</Text>
              <Text style={[typography.h3, { color: colors.success }]}>{formatCurrency(totals.cashIn)}</Text>
            </View>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Cash Out</Text>
              <Text style={[typography.h3, { color: colors.danger }]}>{formatCurrency(totals.cashOut)}</Text>
            </View>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Net Flow</Text>
              <Text style={[typography.h3, { color: colors.text }]}>{formatCurrency(totals.netFlow)}</Text>
            </View>
          </View>
        </Card>
      </View>

      {loading ? (
        <LoadingState label="Loading accounts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.accountId}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate("AccountDetail", { accountId: item.accountId })}>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.accountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      In {formatCurrency(item.cashIn)} · Out {formatCurrency(item.cashOut)}
                    </Text>
                  </View>
                  <Text style={[typography.h3, { color: item.balance >= 0 ? colors.success : colors.danger }]}>
                    {formatCurrency(item.balance)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState title="No accounts yet" subtitle="Create an account like Home or Office Expenses to get started." />
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("AccountForm", undefined)}
        style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.pill }]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  accountRow: { flexDirection: "row", alignItems: "center" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
