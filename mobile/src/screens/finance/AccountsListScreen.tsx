import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as financeApi from "../../api/finance";
import { Card } from "../../components/Card";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton, SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { FinanceStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import type { AccountSummary } from "../../types/models";
import { formatCurrency } from "../../utils/currency";

type Props = NativeStackScreenProps<FinanceStackParamList, "AccountsList">;

/** Account types map to a recognisable icon so the list scans visually, not just by name. */
const ACCOUNT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  home: "home",
  office: "briefcase",
  personal: "person",
  travel: "airplane",
  business: "storefront",
  education: "school",
  savings: "wallet",
  custom: "pricetag",
};

export function AccountsListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [totals, setTotals] = useState<{ cashIn: number; cashOut: number; netFlow: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const summary = await financeApi.getFinancialSummary();
      setAccounts(summary.accounts);
      setTotals({ cashIn: summary.cashIn, cashOut: summary.cashOut, netFlow: summary.netFlow });
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your money information."));
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
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={styles.headerRow}>
          <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
            Money
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Insights")}
            accessibilityRole="button"
            accessibilityLabel="See where your money went"
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerAction,
              {
                minWidth: touchTarget.min,
                minHeight: touchTarget.min,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="stats-chart" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Overview. A real balance of zero matters, so nothing is shown until totals arrive. */}
        <Card style={{ marginTop: spacing.lg }}>
          {totals === null ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Loading your balance">
              <Skeleton height={16} width="35%" />
              <Skeleton height={30} width="60%" style={{ marginTop: spacing.sm }} />
              <Skeleton height={16} width="80%" style={{ marginTop: spacing.lg }} />
            </View>
          ) : (
            <>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Balance</Text>
              <Text
                style={[typography.amount, { color: colors.text, marginTop: 2 }]}
                accessibilityLabel={`Balance ${formatCurrency(totals.netFlow)}`}
              >
                {formatCurrency(totals.netFlow)}
              </Text>
              <View style={[styles.totalsRow, { marginTop: spacing.lg }]}>
                <View style={styles.flex}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Money in</Text>
                  <Text style={[typography.h3, { color: colors.success, marginTop: 2 }]}>
                    {formatCurrency(totals.cashIn)}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Money out</Text>
                  <Text style={[typography.h3, { color: colors.danger, marginTop: 2 }]}>
                    {formatCurrency(totals.cashOut)}
                  </Text>
                </View>
              </View>
            </>
          )}
        </Card>

        {/* The two things people open this tab to do. */}
        <View style={[styles.actionRow, { marginTop: spacing.lg, gap: spacing.md }]}>
          <QuickMoneyAction
            icon="arrow-down-circle"
            label="Money In"
            tone={colors.success}
            onPress={() => navigation.navigate("TransactionForm", { type: "IN" })}
          />
          <QuickMoneyAction
            icon="arrow-up-circle"
            label="Add Expense"
            tone={colors.danger}
            onPress={() => navigation.navigate("TransactionForm", { type: "OUT" })}
          />
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Your accounts" subtitle={accounts.length > 0 ? `${accounts.length} in total` : undefined} />
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
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
          data={accounts}
          keyExtractor={(item) => item.accountId}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 96, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("AccountDetail", { accountId: item.accountId })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, balance ${formatCurrency(item.balance)}`}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={{ marginBottom: spacing.md, minHeight: touchTarget.large }}>
                <View style={styles.accountRow}>
                  <View
                    style={[
                      styles.accountIcon,
                      { backgroundColor: colors.primaryMuted, borderRadius: radius.md, marginRight: spacing.md },
                    ]}
                  >
                    <Ionicons name={ACCOUNT_ICONS[item.type] ?? "pricetag"} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      {formatCurrency(item.cashIn)} in · {formatCurrency(item.cashOut)} out
                    </Text>
                  </View>
                  <Text
                    style={[
                      typography.h3,
                      { color: item.balance >= 0 ? colors.success : colors.danger, marginLeft: spacing.sm },
                    ]}
                  >
                    {formatCurrency(item.balance)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No accounts added"
              subtitle="An account is just a pot to track — like Home, Cash or Savings."
              actionLabel="Add Account"
              onAction={() => navigation.navigate("AccountForm", undefined)}
            />
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("AccountForm", undefined)}
        accessibilityRole="button"
        accessibilityLabel="Add account"
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
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add Account</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function QuickMoneyAction({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  tone: string;
  onPress: () => void;
}) {
  const { colors, radius, spacing, typography, touchTarget } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.moneyAction,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          paddingVertical: spacing.lg,
          minHeight: touchTarget.large,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={24} color={tone} />
      <Text style={[typography.captionStrong, { color: colors.text, marginTop: spacing.xs }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerAction: { alignItems: "center", justifyContent: "center" },
  totalsRow: { flexDirection: "row", gap: 16 },
  actionRow: { flexDirection: "row" },
  moneyAction: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  accountRow: { flexDirection: "row", alignItems: "center" },
  accountIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
