import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as adminApi from "../../api/admin";
import { getApiErrorMessage } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";

export function AdminUsersScreen() {
  const { colors, spacing, typography } = useTheme();

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

  async function confirmToggle() {
    const target = pendingToggle;
    if (!target) return;
    setBusyId(target.id);
    try {
      const updated = target.blocked ? await adminApi.unblockUser(target.id) : await adminApi.blockUser(target.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
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
          ListEmptyComponent={<EmptyState title="No users found" />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.mobileNumber}</Text>
                </View>
                {item.blocked ? <Badge label="Blocked" tone="danger" /> : null}
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
