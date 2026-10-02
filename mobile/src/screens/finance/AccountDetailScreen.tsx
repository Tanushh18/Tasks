import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import type { UserSearchResult } from "../../api/users";
import { enqueueTransactionDelete, isNetworkFailure } from "../../offline/offlineQueue";
import { AssignSheet } from "../../components/AssignSheet";
import { Badge } from "../../components/Badge";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, formatTimeLabel, toIsoDate } from "../../utils/date";
import type { FinanceAccount, Transaction } from "../../types/models";
import type { FinanceStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<FinanceStackParamList, "AccountDetail">;

export function AccountDetailScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography, feature } = useTheme();
  const { accountId } = route.params;

  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionPendingShare, setTransactionPendingShare] = useState<Transaction | null>(null);
  const [sharing, setSharing] = useState(false);
  // Settled (archived) entries: closed for edits, tucked into a dropdown, still viewable.
  const [settledTransactions, setSettledTransactions] = useState<Transaction[]>([]);
  const [showSettled, setShowSettled] = useState(false);
  const [settleSheetOpen, setSettleSheetOpen] = useState(false);
  const [settleDate, setSettleDate] = useState<Date>(new Date());
  const [pickingSettleDate, setPickingSettleDate] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accounts, txns] = await Promise.all([
        financeApi.listAccounts(true),
        financeApi.listTransactions({ accountId, limit: 100, settled: "exclude" }),
      ]);
      const found = accounts.find((a) => a.id === accountId) ?? null;
      setAccount(found);
      setTransactions(txns);
      setSettledTransactions(
        found?.settledUpTo ? await financeApi.listTransactions({ accountId, limit: 200, settled: "only" }) : []
      );
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
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate("ExportReport", { accountId })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Export or email this account's report"
            >
              <Ionicons name="download-outline" size={22} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("AccountForm", { accountId })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit account"
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          </View>
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
            if (isNetworkFailure(err)) {
              await enqueueTransactionDelete(transaction.id);
              setTransactions((prev) => prev.filter((t) => t.id !== transaction.id));
              return;
            }
            Alert.alert("Couldn't delete transaction", getApiErrorMessage(err));
          }
        },
      },
    ]);
  }

  async function handleShare(user: UserSearchResult) {
    const transaction = transactionPendingShare;
    if (!transaction) return;
    setSharing(true);
    try {
      await financeApi.assignTransaction(transaction.id, user.id);
      setTransactionPendingShare(null);
      Alert.alert("Shared", `Shared a copy with ${user.name}`);
    } catch (err) {
      Alert.alert("We couldn't share that transaction", getApiErrorMessage(err));
    } finally {
      setSharing(false);
    }
  }

  async function handleSettle(upTo: string | null) {
    setSettling(true);
    setSettleError(null);
    try {
      await financeApi.settleAccount(accountId, upTo);
      setSettleSheetOpen(false);
      setShowSettled(false);
      await load();
    } catch (err) {
      setSettleError(getApiErrorMessage(err, "We couldn't update the settled date."));
    } finally {
      setSettling(false);
    }
  }

  function confirmReopen() {
    Alert.alert(
      "Reopen settled entries?",
      "Every settled entry becomes open again and can be edited.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reopen", onPress: () => void handleSettle(null) },
      ]
    );
  }

  if (loading) return <LoadingState label="Loading account…" />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;
  if (!account)
    return (
      <EmptyState
        title="Account not found"
        icon="alert-circle-outline"
        tone={colors.danger}
        toneMuted={colors.dangerMuted}
      />
    );

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
              <Text style={[typography.caption, { color: colors.textMuted }]}>{account.settledUpTo ? "Open balance" : "Balance"}</Text>
              <Text style={[typography.h3, { color: colors.text }]}>{formatCurrency(cashIn - cashOut)}</Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.settleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Settled till</Text>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>
                {account.settledUpTo ? formatDateLabel(account.settledUpTo) : "Nothing settled yet"}
              </Text>
            </View>
            {account.settledUpTo ? (
              <Button label="Reopen" variant="secondary" onPress={confirmReopen} disabled={settling} />
            ) : null}
            <Button
              label={account.settledUpTo ? "Settle more" : "Settle up"}
              onPress={() => {
                setSettleError(null);
                setSettleDate(new Date());
                setSettleSheetOpen(true);
              }}
              style={{ marginLeft: spacing.sm }}
            />
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
                {item.assignedBy ? (
                  <Badge label={`Shared by ${item.assignedBy.name}`} tone="primary" />
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[typography.bodyStrong, { color: item.type === "IN" ? colors.success : colors.danger }]}>
                  {item.type === "IN" ? "+" : "-"}
                  {formatCurrency(item.amount)}
                </Text>
                <Badge label={item.type} tone={item.type === "IN" ? "success" : "danger"} />
                <Pressable
                  onPress={() => setTransactionPendingShare(item)}
                  hitSlop={8}
                  style={{ marginTop: spacing.xs }}
                  accessibilityRole="button"
                  accessibilityLabel="Share this transaction"
                >
                  <Ionicons name="share-outline" size={18} color={colors.textFaint} />
                </Pressable>
              </View>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          account.settledUpTo ? (
            <View style={{ marginTop: spacing.md }}>
              <Pressable
                onPress={() => setShowSettled((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showSettled }}
                accessibilityLabel={`Settled entries, ${settledTransactions.length}`}
                style={[
                  styles.dropdown,
                  { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
                ]}
              >
                <Ionicons name="archive-outline" size={18} color={colors.textMuted} />
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1, marginLeft: spacing.sm }]}>
                  Settled · {settledTransactions.length} {settledTransactions.length === 1 ? "entry" : "entries"}
                </Text>
                <Ionicons name={showSettled ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
              </Pressable>
              {showSettled
                ? settledTransactions.map((item) => (
                    <Card key={item.id} style={[styles.txnCard, { marginTop: spacing.sm, opacity: 0.75 }]}>
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
                        <Badge label="Settled" tone="neutral" />
                      </View>
                    </Card>
                  ))
                : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title={account.settledUpTo ? "Nothing open" : "No transactions yet"}
            subtitle={
              account.settledUpTo
                ? "Everything so far is settled. New cash in or out will show up here."
                : "Add your first cash in or cash out below."
            }
            icon="receipt-outline"
            tone={feature.finance.solid}
            toneMuted={feature.finance.muted}
          />
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

      <BottomSheet
        visible={settleSheetOpen}
        onClose={() => setSettleSheetOpen(false)}
        title="Settle up"
        subtitle="Entries on or before this date are closed and moved to the Settled list."
        scrollable={false}
      >
        <Pressable
          onPress={() => setPickingSettleDate(true)}
          accessibilityRole="button"
          accessibilityLabel={`Settled till ${formatDateLabel(toIsoDate(settleDate))}. Change date`}
          style={[
            styles.dateField,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
          ]}
        >
          <Text style={[typography.caption, { color: colors.textMuted }]}>Settled till</Text>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatDateLabel(toIsoDate(settleDate))}</Text>
        </Pressable>
        {pickingSettleDate ? (
          <DateTimePicker
            value={settleDate}
            mode="date"
            maximumDate={new Date()}
            onChange={(_event, date) => {
              setPickingSettleDate(false);
              if (date) setSettleDate(date);
            }}
          />
        ) : null}
        {settleError ? (
          <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>{settleError}</Text>
        ) : null}
        <Button
          label="Settle till this date"
          size="large"
          onPress={() => void handleSettle(toIsoDate(settleDate))}
          loading={settling}
          style={{ marginTop: spacing.lg }}
        />
      </BottomSheet>

      <AssignSheet
        visible={transactionPendingShare !== null}
        title={transactionPendingShare ? `Share "${transactionPendingShare.category}"` : "Share transaction"}
        busy={sharing}
        onShare={handleShare}
        onCancel={() => setTransactionPendingShare(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  settleRow: { flexDirection: "row", alignItems: "center" },
  dropdown: { flexDirection: "row", alignItems: "center" },
  dateField: { borderWidth: 1 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  txnCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", height: 48 },
});
