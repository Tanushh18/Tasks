import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as financeApi from "../../api/finance";
import { AppHeader } from "../../components/AppHeader";
import { Card } from "../../components/Card";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonList } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { SyncBanner } from "../../components/SyncIndicator";
import type { FinanceStackParamList } from "../../navigation/types";
import { isNetworkFailure } from "../../offline/offlineQueue";
import { loadCache, saveCache } from "../../offline/readCache";
import { subscribeToReconnect } from "../../offline/useOfflineSync";
import { useTheme } from "../../theme/useTheme";
import type { AccountSummary, FinancialSummary } from "../../types/models";
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

const CARD_WIDTH = 220;

export function AccountsListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow, feature } = useTheme();

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [totals, setTotals] = useState<{ cashIn: number; cashOut: number; netFlow: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingOfflineData, setShowingOfflineData] = useState(false);

  const applySummary = useCallback((summary: FinancialSummary) => {
    setAccounts(summary.accounts);
    setTotals({ cashIn: summary.cashIn, cashOut: summary.cashOut, netFlow: summary.netFlow });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const summary = await financeApi.getFinancialSummary();
      applySummary(summary);
      setShowingOfflineData(false);
      void saveCache("finance-summary", summary);
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await loadCache<FinancialSummary>("finance-summary");
        if (cached) {
          applySummary(cached);
          setShowingOfflineData(true);
          setLoading(false);
          return;
        }
      }
      setError(getApiErrorMessage(err, "We couldn't load your money information."));
    } finally {
      setLoading(false);
    }
  }, [applySummary]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useEffect(() => subscribeToReconnect(load), [load]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <AppHeader
        title="Money"
        actions={[
          {
            icon: "people",
            label: "Group expenses — split trip or shared spending",
            onPress: () => navigation.navigate("GroupsList"),
          },
          { icon: "stats-chart", label: "See where your money went", onPress: () => navigation.navigate("Insights") },
        ]}
      />

      <View style={{ paddingHorizontal: spacing.lg }}>
        {showingOfflineData ? (
          <View style={{ marginTop: spacing.lg }}>
            <SyncBanner />
          </View>
        ) : null}

        {/* Money in / out / net — the three figures a family actually checks, no accounting jargon. */}
        <View style={[styles.statRow, { marginTop: spacing.lg, gap: spacing.md }]}>
          <StatCard
            label="Money in"
            value={totals ? formatCurrency(totals.cashIn) : undefined}
            icon="arrow-down-circle"
            tone={colors.success}
            toneMuted={colors.successMuted}
            style={styles.flex}
          />
          <StatCard
            label="Money out"
            value={totals ? formatCurrency(totals.cashOut) : undefined}
            icon="arrow-up-circle"
            tone={colors.danger}
            toneMuted={colors.dangerMuted}
            style={styles.flex}
          />
        </View>
        <StatCard
          label="Net"
          value={totals ? formatCurrency(totals.netFlow) : undefined}
          detail="Money in minus money out"
          icon="wallet"
          tone={feature.finance.solid}
          toneMuted={feature.finance.muted}
          style={{ marginTop: spacing.md }}
        />

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
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : accounts.length === 0 ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Card>
            <EmptyState
              icon="wallet-outline"
              tone={feature.finance.solid}
              toneMuted={feature.finance.muted}
              title="No accounts added"
              subtitle="An account is just a pot to track — like Home, Cash or Savings."
              actionLabel="Add Account"
              onAction={() => navigation.navigate("AccountForm", undefined)}
            />
          </Card>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.accountId}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 96, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("AccountDetail", { accountId: item.accountId })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, balance ${formatCurrency(item.balance)}`}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={[styles.accountCard, shadow.card, { width: CARD_WIDTH, minHeight: touchTarget.large + 40 }]}>
                <View
                  style={[
                    styles.accountIcon,
                    { backgroundColor: feature.finance.muted, borderRadius: radius.md, marginBottom: spacing.md },
                  ]}
                >
                  <Ionicons name={ACCOUNT_ICONS[item.type] ?? "pricetag"} size={20} color={feature.finance.solid} />
                </View>
                <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  style={[
                    typography.h2,
                    { color: item.balance >= 0 ? colors.success : colors.danger, marginTop: 2 },
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(item.balance)}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]} numberOfLines={1}>
                  {formatCurrency(item.cashIn)} in · {formatCurrency(item.cashOut)} out
                </Text>
              </Card>
            </Pressable>
          )}
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
  statRow: { flexDirection: "row" },
  actionRow: { flexDirection: "row" },
  moneyAction: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  accountCard: { justifyContent: "flex-start" },
  accountIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
