import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as familyGoalsApi from "../../api/familyGoals";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonLines } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, todayIso } from "../../utils/date";

type Props = NativeStackScreenProps<MoreStackParamList, "GoalDetail">;

export function GoalDetailScreen({ route, navigation }: Props) {
  const { goalId, name } = route.params;
  const { colors, feature, spacing, radius, typography } = useTheme();

  const [goal, setGoal] = useState<familyGoalsApi.FamilyGoal | null>(null);
  const [contributions, setContributions] = useState<familyGoalsApi.GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contributeVisible, setContributeVisible] = useState(false);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributing, setContributing] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: name,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("GoalForm", { goalId })}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit goal"
        >
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, name, goalId, colors.primary]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [goalData, contributionList] = await Promise.all([
        familyGoalsApi.getGoal(goalId),
        familyGoalsApi.listContributions(goalId),
      ]);
      setGoal(goalData);
      setContributions(contributionList);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load this goal."));
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function handleContribute() {
    const parsed = Number(contributeAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert("Enter a valid amount", "The contribution must be a positive number.");
      return;
    }
    setContributing(true);
    try {
      await familyGoalsApi.addContribution(goalId, { amount: parsed, date: todayIso() });
      setContributeVisible(false);
      setContributeAmount("");
      load();
    } catch (err) {
      Alert.alert("We couldn't add this contribution", getApiErrorMessage(err));
    } finally {
      setContributing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !goal) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
        <ErrorState
          message={error ?? "Something went wrong."}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </SafeAreaView>
    );
  }

  const pct = Math.max(0, Math.min(1, goal.progress));

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.xxl, flex: 1 }}>
        <Card>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Saved so far</Text>
          <Text style={[typography.amount, { color: colors.text, marginTop: 2 }]}>
            {formatCurrency(goal.savedAmount)}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
            of {formatCurrency(goal.targetAmount)} target ({Math.round(pct * 100)}%)
            {goal.deadline ? ` · due ${formatDateLabel(goal.deadline)}` : ""}
          </Text>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: feature.finance.muted, borderRadius: radius.pill, marginTop: spacing.md },
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

        {contributeVisible ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.sm }]}>
              Add a contribution
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md }]}>
              Record money you've set aside toward this goal. This is tracking only — no money is moved.
            </Text>
            <TextField
              label="Amount"
              value={contributeAmount}
              onChangeText={setContributeAmount}
              placeholder="e.g. 2000"
              keyboardType="numeric"
            />
            <View style={styles.row}>
              <Button
                label="Add contribution"
                onPress={handleContribute}
                loading={contributing}
                style={styles.flex}
              />
              <Button
                label="Cancel"
                variant="ghost"
                disabled={contributing}
                onPress={() => {
                  setContributeVisible(false);
                  setContributeAmount("");
                }}
                style={styles.flex}
              />
            </View>
          </Card>
        ) : (
          <Button
            label="Contribute"
            onPress={() => setContributeVisible(true)}
            style={{ marginTop: spacing.lg }}
            accessibilityHint="Add money you've saved toward this goal"
          />
        )}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Contributions" subtitle={`${contributions.length} logged`} />
        </View>
        {contributions.length === 0 ? (
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
            No contributions yet. Add the first one above.
          </Text>
        ) : (
          contributions.map((contribution) => (
            <Card key={contribution.id} style={{ marginTop: spacing.sm }}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>
                    {contribution.contributedBy?.name ?? "Someone"}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {formatDateLabel(contribution.date)}
                    {contribution.note ? ` · ${contribution.note}` : ""}
                  </Text>
                </View>
                <Text style={[typography.bodyStrong, { color: feature.finance.solid }]}>
                  {formatCurrency(contribution.amount)}
                </Text>
              </View>
            </Card>
          ))
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  progressTrack: { height: 8, width: "100%", overflow: "hidden" },
  progressFill: { height: 8 },
});
