import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import * as adminApi from "../../api/admin";
import { getApiErrorMessage } from "../../api/client";
import { AdminBadge } from "../../components/AdminBadge";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonLines } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function DatabaseStorageScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const [status, setStatus] = useState<adminApi.StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await adminApi.getStorageStatus());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load the database storage."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const barColor =
    status?.warning === "critical" ? colors.danger : status?.warning === "warn" ? colors.warning : colors.primary;
  const pct = Math.max(0, Math.min(100, status?.percentUsed ?? 0));
  const largest = status?.perCollection[0]?.totalSize || 1;

  return (
    <ScreenContainer
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      <AdminBadge style={{ marginBottom: spacing.md }} />
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        Database storage
      </Text>

      {loading ? (
        <SkeletonLines count={5} />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : status ? (
        <>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h2, { color: colors.text }]}>
              {formatBytes(status.usedBytes)} of {formatBytes(status.limitBytes)} used
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
              style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: "hidden", marginVertical: spacing.md }}
            >
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: barColor }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[typography.bodyStrong, { color: barColor }]}>{status.percentUsed}% used</Text>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatBytes(status.freeBytes)} left</Text>
            </View>
            {status.warning !== "ok" ? (
              <Text style={[typography.caption, { color: barColor, marginTop: spacing.sm }]}>
                {status.warning === "critical" ? "Storage almost full. Free up space or upgrade the cluster." : "Storage is getting full."}
              </Text>
            ) : null}
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
              {status.quotaSource === "default"
                ? `Limit assumed ${formatBytes(status.limitBytes)} (set MONGODB_STORAGE_LIMIT_MB on the server).`
                : `Limit ${formatBytes(status.limitBytes)} (from MONGODB_STORAGE_LIMIT_MB).`}
            </Text>
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <StatRow label="Data" value={formatBytes(status.dataSize)} />
            <StatRow label="Storage (on disk)" value={formatBytes(status.storageSize)} />
            <StatRow label="Indexes" value={formatBytes(status.indexSize)} />
            <StatRow label="Documents" value={String(status.objects)} />
            <StatRow label="Collections" value={String(status.collections)} />
          </Card>

          <SectionHeader title="By collection" />
          {status.perCollection.map((c) => (
            <Card key={c.name} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{c.name}</Text>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatBytes(c.totalSize)}</Text>
              </View>
              <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginVertical: 6, overflow: "hidden" }}>
                <View style={{ width: `${Math.max(2, (c.totalSize / largest) * 100)}%`, height: "100%", backgroundColor: colors.primary }} />
              </View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {c.count} docs · data {formatBytes(c.dataSize)} · indexes {formatBytes(c.indexSize)}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );

  function StatRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
        <Text style={[typography.body, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{value}</Text>
      </View>
    );
  }
}
