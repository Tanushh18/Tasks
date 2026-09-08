import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as groupExpenseApi from "../../api/groupExpenses";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import type { FinanceStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, toIsoDate } from "../../utils/date";

type Props = NativeStackScreenProps<FinanceStackParamList, "GroupExpenseForm">;

export function GroupExpenseFormScreen({ route, navigation }: Props) {
  const { groupId, expenseId } = route.params;
  const { colors, spacing, radius, typography } = useTheme();
  const { user } = useAuth();

  const [members, setMembers] = useState<groupExpenseApi.GroupMember[]>([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [paidBy, setPaidBy] = useState<string>("");
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: expenseId ? "Edit expense" : "Add expense" });
  }, [navigation, expenseId]);

  useEffect(() => {
    (async () => {
      try {
        const group = await groupExpenseApi.getGroup(groupId);
        setMembers(group.members);
        setPaidBy(user && group.members.some((m) => m.id === user.id) ? user.id : group.members[0]?.id ?? "");

        if (expenseId) {
          const expenses = await groupExpenseApi.listExpenses(groupId);
          const existing = expenses.find((e) => e.id === expenseId);
          if (existing) {
            setAmount(String(existing.amount));
            setDescription(existing.description);
            setCategory(existing.category);
            setDate(new Date(`${existing.date}T00:00:00`));
            if (existing.paidBy) setPaidBy(existing.paidBy.id);
            setSplitType("custom");
            const splits: Record<string, string> = {};
            for (const split of existing.splits) {
              if (split.user) splits[split.user.id] = String(split.amount);
            }
            setCustomSplits(splits);
          }
        }
      } catch (err) {
        setError(getApiErrorMessage(err, "We couldn't load this group."));
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, expenseId, user]);

  const parsedAmount = parseFloat(amount);
  const customTotal = members.reduce((sum, m) => sum + (parseFloat(customSplits[m.id]) || 0), 0);

  async function handleSave() {
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("Enter an amount", "The amount must be a positive number.");
      return;
    }
    if (!paidBy) {
      Alert.alert("Who paid?", "Choose who paid for this expense.");
      return;
    }

    setSaving(true);
    try {
      const input: groupExpenseApi.ExpenseInput = {
        paidBy,
        amount: parsedAmount,
        description: description.trim(),
        category: category.trim() || "General",
        date: toIsoDate(date),
        splitType,
        splits:
          splitType === "custom"
            ? members
                .filter((m) => (parseFloat(customSplits[m.id]) || 0) > 0)
                .map((m) => ({ userId: m.id, amount: parseFloat(customSplits[m.id]) || 0 }))
            : undefined,
      };

      if (expenseId) {
        await groupExpenseApi.updateExpense(groupId, expenseId, input);
      } else {
        await groupExpenseApi.addExpense(groupId, input);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("We couldn't save this expense", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading group…" />;

  return (
    <ScreenContainer>
      <TextField
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        keyboardType="decimal-pad"
      />
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Dinner" />
      <TextField label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Food" />

      <Pressable
        onPress={() => setShowDatePicker(true)}
        style={[
          styles.pickerChip,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.lg },
        ]}
      >
        <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Date</Text>
        <Text style={[typography.body, { color: colors.text }]}>{formatDateLabel(toIsoDate(date))}</Text>
      </Pressable>
      {showDatePicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={(_e, selected) => {
            setShowDatePicker(false);
            if (selected) setDate(selected);
          }}
        />
      ) : null}

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Paid by</Text>
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {members.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => setPaidBy(m.id)}
            style={[
              styles.chip,
              { backgroundColor: paidBy === m.id ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill },
            ]}
          >
            <Text style={{ color: paidBy === m.id ? colors.onPrimary : colors.textMuted, fontWeight: "600" }}>
              {m.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        Split
      </Text>
      <View style={[styles.chipRow, { marginBottom: spacing.md }]}>
        {(["equal", "custom"] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => setSplitType(option)}
            style={[
              styles.chip,
              { backgroundColor: splitType === option ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill },
            ]}
          >
            <Text style={{ color: splitType === option ? colors.onPrimary : colors.textMuted, fontWeight: "600" }}>
              {option === "equal" ? "Split equally" : "Custom amounts"}
            </Text>
          </Pressable>
        ))}
      </View>

      {splitType === "equal" ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.lg }]}>
          {members.length > 0 && parsedAmount > 0
            ? `${formatCurrency(parsedAmount / members.length)} each across ${members.length} people`
            : "Divided equally across everyone in the group"}
        </Text>
      ) : (
        <View style={{ marginBottom: spacing.lg }}>
          {members.map((m) => (
            <View key={m.id} style={[styles.splitRow, { marginBottom: spacing.sm }]}>
              <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{m.name}</Text>
              <TextInput
                value={customSplits[m.id] ?? ""}
                onChangeText={(text) => setCustomSplits((prev) => ({ ...prev, [m.id]: text }))}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textFaint}
                style={[
                  styles.splitInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text },
                ]}
              />
            </View>
          ))}
          <Text
            style={[
              typography.caption,
              { color: Math.abs(customTotal - (parsedAmount || 0)) > 0.01 ? colors.danger : colors.textMuted, marginTop: spacing.xs },
            ]}
          >
            {formatCurrency(customTotal)} of {formatCurrency(parsedAmount || 0)} assigned
          </Text>
        </View>
      )}

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={expenseId ? "Save changes" : "Add expense"} onPress={handleSave} loading={saving} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pickerChip: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10 },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  splitInput: { width: 100, height: 44, paddingHorizontal: 12, borderWidth: 1, fontSize: 16, textAlign: "right" },
});
