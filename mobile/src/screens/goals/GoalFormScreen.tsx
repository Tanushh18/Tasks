import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as familyGoalsApi from "../../api/familyGoals";
import type { UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "GoalForm">;

export function GoalFormScreen({ route, navigation }: Props) {
  const { goalId } = route.params ?? {};
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sharedWith, setSharedWith] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(Boolean(goalId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: goalId ? "Edit goal" : "New goal" });
  }, [navigation, goalId]);

  useEffect(() => {
    if (!goalId) return;
    (async () => {
      try {
        const goal = await familyGoalsApi.getGoal(goalId);
        setName(goal.name);
        setTargetAmount(String(goal.targetAmount));
        setDeadline(goal.deadline ?? "");
        setSharedWith(goal.sharedWith.filter((m) => m.id !== user?.id));
      } catch (err) {
        setError(getApiErrorMessage(err, "We couldn't load this goal."));
      } finally {
        setLoading(false);
      }
    })();
  }, [goalId, user?.id]);

  async function handleSave() {
    const trimmedName = name.trim();
    const parsedTarget = Number(targetAmount);
    if (!trimmedName) {
      Alert.alert("Give the goal a name", 'For example, "Goa Trip" or "Emergency Fund".');
      return;
    }
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      Alert.alert("Enter a valid target amount", "The target must be a positive number.");
      return;
    }
    const trimmedDeadline = deadline.trim();
    if (trimmedDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDeadline)) {
      Alert.alert("Enter a valid deadline", "Use the format YYYY-MM-DD, or leave it blank.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        name: trimmedName,
        targetAmount: parsedTarget,
        sharedWith: sharedWith.map((m) => m.id),
        deadline: trimmedDeadline || null,
      };
      if (goalId) {
        await familyGoalsApi.updateGoal(goalId, input);
      } else {
        await familyGoalsApi.createGoal(input);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("We couldn't save this goal", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading goal…" />;

  return (
    <ScreenContainer>
      <TextField label="Goal name" value={name} onChangeText={setName} placeholder="e.g. Goa Trip" maxLength={80} />
      <TextField
        label="Target amount"
        value={targetAmount}
        onChangeText={setTargetAmount}
        placeholder="e.g. 50000"
        keyboardType="numeric"
      />
      <TextField
        label="Deadline (optional, YYYY-MM-DD)"
        value={deadline}
        onChangeText={setDeadline}
        placeholder="2026-12-01"
      />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>
        Share with (optional)
      </Text>
      <UserPicker
        mode="multi"
        value={sharedWith}
        onChange={setSharedWith}
        excludeIds={user ? [user.id] : []}
        placeholder="Add family members"
      />

      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>{error}</Text> : null}

      <Button
        label={goalId ? "Save changes" : "Create goal"}
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.xl }}
      />
    </ScreenContainer>
  );
}
