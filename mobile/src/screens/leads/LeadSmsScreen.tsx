import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";

const n = (v: number) => v.toLocaleString("en-IN");

const STATE: Record<api.SmsRunState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  sending: { label: "Sending now", tone: "success" },
  waiting: { label: "Waiting for the next sending time", tone: "warning" },
  paused: { label: "Paused", tone: "danger" },
  idle: { label: "Nothing to send", tone: "neutral" },
};

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const { typography, spacing } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: spacing.sm }}>
      <Text style={[typography.h3, { color }]} accessibilityLabel={`${label} ${n(value)}`}>
        {n(value)}
      </Text>
      <Text style={[typography.caption, { color: "#8A8A8A" }]}>{label}</Text>
    </View>
  );
}

function Bar({ done, failed, total }: { done: number; failed: number; total: number }) {
  const { colors, radius } = useTheme();
  const pct = (v: number) => (total ? Math.min(100, (v / total) * 100) : 0);
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: "hidden", flexDirection: "row" }}>
      <View style={{ width: `${pct(done)}%`, backgroundColor: colors.success }} />
      <View style={{ width: `${pct(failed)}%`, backgroundColor: colors.danger }} />
    </View>
  );
}

/**
 * SMS status for the Leads tab: the consolidated numbers and one card per sheet. Read-only: the messages, the sending
 * times and the Auto-send switches are managed on the SMS Service website.
 */
export function LeadSmsScreen() {
  const { colors, spacing, typography } = useTheme();
  const [data, setData] = useState<api.SmsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getSmsSummary());
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 20000);
      return () => clearInterval(t);
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (error && !data) {
    return (
      <ScreenContainer>
        <ErrorState message={error} onRetry={() => void load()} />
      </ScreenContainer>
    );
  }
  if (!data) {
    return (
      <ScreenContainer>
        <LoadingState />
      </ScreenContainer>
    );
  }

  const t = data.totals;
  const state = STATE[data.state];
  const reached = t.sent + t.delivered;
  const pct = t.total ? Math.round((reached / t.total) * 100) : 0;

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <Text style={[typography.h3, { color: colors.text }]}>SMS overview</Text>
          <Badge label={state.label} tone={state.tone} />
        </View>
        <View style={{ flexDirection: "row" }}>
          <Stat label="Sent" value={reached} color={colors.success} />
          <Stat label="Delivered" value={t.delivered} color={colors.primary} />
          <Stat label="Failed" value={t.failed + t.invalid} color={t.failed + t.invalid ? colors.danger : colors.textMuted} />
          <Stat label="Left" value={t.remaining} color={colors.text} />
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Bar done={reached} failed={t.failed + t.invalid} total={t.total} />
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
            {`${n(reached)} of ${n(t.total)} leads texted (${pct}%)${data.etaDays ? ` · about ${data.etaDays} day${data.etaDays === 1 ? "" : "s"} left` : ""}`}
          </Text>
        </View>
        <View style={{ marginTop: spacing.md, gap: 2 }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {`Today: ${n(data.sentToday)} sent (limit ${n(data.dailyLimit)} per phone per day)`}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{`Sending times: ${data.lunch} and ${data.night}`}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {data.lastSentAt ? `Last SMS: ${new Date(data.lastSentAt).toLocaleString()}` : "No SMS sent yet"}
          </Text>
        </View>
      </Card>

      <Text style={[typography.bodyStrong, { color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm }]}>By sheet</Text>
      {data.sheets.length === 0 ? (
        <EmptyState title="No sheet is sending SMS yet" subtitle="Switch on Auto-send for a sheet on the SMS Service website." />
      ) : (
        data.sheets.map((s) => {
          const done = s.sent + s.delivered;
          const bad = s.failed + s.invalid;
          return (
            <Card key={s.sheet} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {s.sheet}
                </Text>
                <Badge label={s.auto ? "Auto-send on" : "Auto-send off"} tone={s.auto ? "success" : "neutral"} />
              </View>
              <Bar done={done} failed={bad} total={s.total} />
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
                {[
                  `Sent ${n(done)} of ${n(s.total)}`,
                  s.delivered ? `${n(s.delivered)} delivered` : null,
                  bad ? `${n(bad)} failed` : null,
                  `${n(s.remaining)} left`,
                  s.auto && s.etaDays ? `~${s.etaDays} day${s.etaDays === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Card>
          );
        })
      )}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
          Read-only. The messages, sending times and Auto-send switches are managed on the SMS Service website.
        </Text>
      </View>
    </ScreenContainer>
  );
}
