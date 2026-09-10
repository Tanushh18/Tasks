import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as weeklySummaryApi from "../../api/weeklySummary";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonLines } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { ErrorState } from "../../components/StateViews";
import { formatCurrency } from "../../utils/currency";
import { useTheme } from "../../theme/useTheme";

export function WeeklySummaryScreen() {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();

  const [summary, setSummary] = useState<weeklySummaryApi.WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await weeklySummaryApi.getWeeklySummary());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your weekly summary."));
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
    <ScreenContainer edges={["left", "right"]}>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
        Weekly Summary
      </Text>
      {summary ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl }]}>
          {summary.rangeStart} to {summary.rangeEnd}
        </Text>
      ) : (
        <View style={{ marginBottom: spacing.xl }} />
      )}

      {loading ? (
        <SkeletonLines count={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : summary ? (
        <>
          <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
            <StatCard
              label="Tasks completed"
              value={String(summary.tasksCompleted)}
              icon="checkmark-done-outline"
              tone={colors.success}
              toneMuted={colors.successMuted}
              style={{ flex: 1 }}
            />
            <StatCard
              label="Total spent"
              value={formatCurrency(summary.totalExpenses, user?.currency)}
              icon="cash-outline"
              tone={colors.danger}
              toneMuted={colors.dangerMuted}
              style={{ flex: 1 }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
            <StatCard
              label="Upcoming reminders"
              value={String(summary.upcomingReminders)}
              icon="alarm-outline"
              tone={colors.primary}
              toneMuted={colors.primaryMuted}
              style={{ flex: 1 }}
            />
            {summary.groupExpensesTotal !== null ? (
              <StatCard
                label="Group expenses"
                value={formatCurrency(summary.groupExpensesTotal, user?.currency)}
                icon="people-outline"
                style={{ flex: 1 }}
              />
            ) : null}
          </View>

          {summary.unreadMessages !== null ? (
            <StatCard
              label="Unread messages"
              value={String(summary.unreadMessages)}
              icon="chatbubble-ellipses-outline"
              style={{ marginBottom: spacing.md }}
            />
          ) : null}

          {summary.insight ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
              {summary.insight}
            </Text>
          ) : null}
        </>
      ) : null}
    </ScreenContainer>
  );
}
