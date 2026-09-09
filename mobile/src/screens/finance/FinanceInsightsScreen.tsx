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

/** [thisMonth, lastMonth] as YYYY-MM-DD boundaries, for two separate spending-analysis calls. */
function monthRange(monthsAgo: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

interface CategoryTrend {
  category: string;
  current: number;
  previous: number;
  percentChange: number | null;
}

/** Month-over-month comparison per category, computed client-side from two analysis calls — plain arithmetic, not AI. */
function buildCategoryTrends(current: SpendingAnalysis, previous: SpendingAnalysis): CategoryTrend[] {
  const previousByCategory = new Map(previous.categories.map((c) => [c.category, c.total]));
  return current.categories
    .map((c) => {
      const prevTotal = previousByCategory.get(c.category) ?? 0;
      const percentChange = prevTotal > 0 ? ((c.total - prevTotal) / prevTotal) * 100 : null;
      return { category: c.category, current: c.total, previous: prevTotal, percentChange };
    })
    .filter((t) => t.percentChange !== null && Math.abs(t.percentChange) >= 1)
    .sort((a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0));
}

function trendSentence(trend: CategoryTrend): string {
  const direction = (trend.percentChange ?? 0) >= 0 ? "increased" : "decreased";
  const percent = Math.round(Math.abs(trend.percentChange ?? 0));
  return `${trend.category} ${direction} ${percent}% vs last month`;
}

export function FinanceInsightsScreen() {
  const { colors, spacing, typography } = useTheme();

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);
  const [analysis, setAnalysis] = useState<SpendingAnalysis | null>(null);
  const [categoryTrends, setCategoryTrends] = useState<CategoryTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const thisMonth = monthRange(0);
      const lastMonth = monthRange(1);
      const [summaryRes, trendRes, analysisRes, thisMonthAnalysis, lastMonthAnalysis] = await Promise.all([
        financeApi.getFinancialSummary(),
        financeApi.getMonthlyTrend({ months: 6 }),
        financeApi.getSpendingAnalysis(),
        financeApi.getSpendingAnalysis(thisMonth),
        financeApi.getSpendingAnalysis(lastMonth),
      ]);
      setSummary(summaryRes);
      setTrend(trendRes);
      setAnalysis(analysisRes);
      setCategoryTrends(buildCategoryTrends(thisMonthAnalysis, lastMonthAnalysis));
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

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>
          Spending trends
        </Text>
        {categoryTrends.length > 0 ? (
          categoryTrends.slice(0, 3).map((item) => (
            <Text
              key={item.category}
              style={[typography.body, { color: colors.text, marginBottom: spacing.xs }]}
            >
              {trendSentence(item)}
            </Text>
          ))
        ) : (
          <Text style={[typography.body, { color: colors.textMuted }]}>
            Not enough history yet to compare month over month.
          </Text>
        )}
      </Card>

      <View style={{ marginBottom: spacing.xl }} />
    </ScreenContainer>
  );
}
