import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Text, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/Card";
import { ErrorState, LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { HorizontalBarList } from "../../components/charts/HorizontalBarList";
import { TrendLineChart } from "../../components/charts/TrendLineChart";
import { useTheme } from "../../theme/useTheme";
import { bucketTopN } from "../../theme/categoricalPalette";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel } from "../../utils/date";
import type { MonthlyTrendPoint, SpendingAnalysis } from "../../api/finance";
import type { FinancialSummary } from "../../types/models";

export function FinanceInsightsScreen() {
  const { colors, spacing, typography } = useTheme();

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);
  const [analysis, setAnalysis] = useState<SpendingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summaryRes, trendRes, analysisRes] = await Promise.all([
        financeApi.getFinancialSummary(),
        financeApi.getMonthlyTrend({ months: 6 }),
        financeApi.getSpendingAnalysis(),
      ]);
      setSummary(summaryRes);
      setTrend(trendRes);
      setAnalysis(analysisRes);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load insights."));
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

  if (loading) return <LoadingState label="Loading insights…" />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const accountBars = bucketTopN(
    summary?.accounts.filter((a) => a.cashOut > 0) ?? [],
    (a) => a.name,
    (a) => a.cashOut,
    6
  );
  const categoryBars = bucketTopN(analysis?.categories ?? [], (c) => c.category, (c) => c.total, 6);

  return (
    <ScreenContainer onRefresh={load}>
      <Text style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>Insights</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>
          Cash flow — last 6 months
        </Text>
        {trend.length > 0 ? <TrendLineChart data={trend} /> : (
          <Text style={[typography.body, { color: colors.textMuted }]}>No transactions yet.</Text>
        )}
      </Card>

      {analysis?.biggestExpense ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Biggest expense</Text>
          <Text style={[typography.h3, { color: colors.text, marginTop: 2 }]}>
            {formatCurrency(analysis.biggestExpense.amount)} · {analysis.biggestExpense.category}
          </Text>
          <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}>
            {formatDateLabel(analysis.biggestExpense.date)}
            {analysis.biggestExpense.description ? ` · ${analysis.biggestExpense.description}` : ""}
          </Text>
        </Card>
      ) : null}

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>
          Spending by category
        </Text>
        <HorizontalBarList data={categoryBars} emptyLabel="No expenses recorded yet." />
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>
          Spending by account
        </Text>
        <HorizontalBarList data={accountBars} emptyLabel="No expenses recorded yet." />
      </Card>

      <View style={{ marginBottom: spacing.xl }} />
    </ScreenContainer>
  );
}
