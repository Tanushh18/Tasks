import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as adminApi from "../../api/admin";
import { getApiErrorMessage } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { FamilyAvatar } from "../../components/FamilyAvatar";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonLines } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000; // "active" = signed in within the last day

function lastActiveLabel(iso: string | null): string {
  if (!iso) return "Never signed in";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 5) return "Active now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Active ${days}d ago`;
}

export function AdminUsersScreen() {
  const { colors, spacing, typography, feature } = useTheme();

  const [users, setUsers] = useState<adminApi.AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<adminApi.AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await adminApi.listUsers());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load users."));
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

  // listUsers deliberately excludes the caller, so the family total includes "you" (+1).
  const overview = useMemo(() => {
    const totalUsers = users.length + 1;
    const blockedUsers = users.filter((u) => u.blocked).length;
    const activeUsers =
      users.filter((u) => u.lastLoginAt && Date.now() - new Date(u.lastLoginAt).getTime() < ACTIVE_WINDOW_MS).length +
      1; // you're using the app right now
    return { totalUsers, activeUsers, blockedUsers };
  }, [users]);

  async function confirmToggle() {
    const target = pendingToggle;
    if (!target) return;
    setBusyId(target.id);
    try {
      const updated = target.blocked ? await adminApi.unblockUser(target.id) : await adminApi.blockUser(target.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setPendingToggle(null);
    } catch (err) {
      Alert.alert("Couldn't update that account", getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetMpin(target: adminApi.AdminUser) {
    setBusyId(target.id);
    try {
      const { mpin } = await adminApi.resetMpin(target.id);
      Alert.alert("New MPIN", `New MPIN for ${target.name}: ${mpin}\n\nShare this with them securely.`);
    } catch (err) {
      Alert.alert("Couldn't reset MPIN", getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["left", "right", "bottom"]}>
      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={5} />
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
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.lg }}>
              <SectionHeader title="Family Overview" subtitle="No enterprise roles here — every account is equal except who's admin." />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <StatCard label="People" value={String(overview.totalUsers)} icon="people" tone={colors.primary} toneMuted={colors.primaryMuted} style={{ flex: 1 }} />
                <StatCard label="Active today" value={String(overview.activeUsers)} icon="pulse" tone={colors.success} toneMuted={colors.successMuted} style={{ flex: 1 }} />
                <StatCard label="Blocked" value={String(overview.blockedUsers)} icon="ban" tone={colors.danger} toneMuted={colors.dangerMuted} style={{ flex: 1 }} />
              </View>
              <View style={{ marginTop: spacing.xl }}>
                <SectionHeader title="Everyone" />
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState title="No other family members yet" icon="people-outline" tone={feature.contacts.solid} toneMuted={feature.contacts.muted} />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <FamilyAvatar name={item.name} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                    {item.isAdmin ? <Badge label="Admin" tone="primary" /> : null}
                    {item.blocked ? <Badge label="Blocked" tone="danger" /> : null}
                  </View>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.mobileNumber}</Text>
                  <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}>
                    {lastActiveLabel(item.lastLoginAt)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  label={item.blocked ? "Unblock" : "Block"}
                  variant={item.blocked ? "secondary" : "danger"}
                  loading={busyId === item.id && pendingToggle?.id === item.id}
                  onPress={() => setPendingToggle(item)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Reset MPIN"
                  variant="secondary"
                  loading={busyId === item.id && pendingToggle === null}
                  onPress={() => handleResetMpin(item)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          )}
        />
      )}

      <ConfirmationSheet
        visible={pendingToggle !== null}
        title={pendingToggle?.blocked ? "Unblock this user?" : "Block this user?"}
        message={
          pendingToggle?.blocked
            ? "They'll be able to sign in again."
            : "They won't be able to sign in until unblocked."
        }
        details={pendingToggle ? [{ label: "Name", value: pendingToggle.name }] : undefined}
        confirmLabel={pendingToggle?.blocked ? "Unblock" : "Block"}
        destructive={!pendingToggle?.blocked}
        busy={busyId === pendingToggle?.id}
        onConfirm={confirmToggle}
        onCancel={() => setPendingToggle(null)}
      />
    </SafeAreaView>
  );
}
