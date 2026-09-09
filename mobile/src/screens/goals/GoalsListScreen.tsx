import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as familyGoalsApi from "../../api/familyGoals";
import { Card } from "../../components/Card";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";

type Props = NativeStackScreenProps<MoreStackParamList, "GoalsList">;

export function GoalsListScreen({ navigation }: Props) {
  const { colors, feature, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [goals, setGoals] = useState<familyGoalsApi.FamilyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGoals(await familyGoalsApi.listGoals());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your goals."));
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
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Family Goals
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>
          Save together toward a trip, a fund, or anything else your family wants.
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
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
          data={goals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, flexGrow: 1 }}
          renderItem={({ item }) => {
            const pct = Math.max(0, Math.min(1, item.progress));
            return (
              <Pressable
                onPress={() => navigation.navigate("GoalDetail", { goalId: item.id, name: item.name })}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${formatCurrency(item.savedAmount)} of ${formatCurrency(item.targetAmount)}`}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.rowBetween}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  </View>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {formatCurrency(item.savedAmount)} of {formatCurrency(item.targetAmount)} ({Math.round(pct * 100)}%)
                  </Text>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: feature.finance.muted, borderRadius: radius.pill, marginTop: spacing.sm },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${pct * 100}%`, backgroundColor: feature.finance.solid, borderRadius: radius.pill },
                      ]}
                    />
                  </View>
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No goals yet"
              subtitle="Start a savings goal for a trip, an emergency fund, or anything your family is saving toward."
              actionLabel="New goal"
              onAction={() => navigation.navigate("GoalForm", undefined)}
              icon="flag-outline"
              tone={feature.finance.solid}
              toneMuted={feature.finance.muted}
            />
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("GoalForm", undefined)}
        accessibilityRole="button"
        accessibilityLabel="New goal"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: feature.finance.solid,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>New goal</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  progressTrack: { height: 8, width: "100%", overflow: "hidden" },
  progressFill: { height: 8 },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
