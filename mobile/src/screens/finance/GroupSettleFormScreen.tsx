import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as groupExpenseApi from "../../api/groupExpenses";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import type { FinanceStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatDateLabel, toIsoDate } from "../../utils/date";

type Props = NativeStackScreenProps<FinanceStackParamList, "GroupSettleForm">;

export function GroupSettleFormScreen({ route, navigation }: Props) {
  const { groupId, fromUserId, toUserId, amount: suggestedAmount } = route.params;
  const { colors, spacing, radius, typography } = useTheme();

  const [members, setMembers] = useState<groupExpenseApi.GroupMember[]>([]);
  const [fromUser, setFromUser] = useState(fromUserId ?? "");
  const [toUser, setToUser] = useState(toUserId ?? "");
  const [amount, setAmount] = useState(suggestedAmount ? String(suggestedAmount) : "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Settle up" });
  }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        const group = await groupExpenseApi.getGroup(groupId);
        setMembers(group.members);
        if (!fromUserId && group.members[0]) setFromUser(group.members[0].id);
        if (!toUserId && group.members[1]) setToUser(group.members[1].id);
      } catch {
        // The chip pickers just come up empty; the form still works once members are chosen.
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, fromUserId, toUserId]);

  async function handleSave() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert("Enter an amount", "The amount must be a positive number.");
      return;
    }
    if (!fromUser || !toUser) {
      Alert.alert("Choose both people", "Pick who paid and who received it.");
      return;
    }
    if (fromUser === toUser) {
      Alert.alert("Choose two different people", "A settlement needs a payer and a receiver.");
      return;
    }

    setSaving(true);
    try {
      await groupExpenseApi.addSettlement(groupId, {
        fromUser,
        toUser,
        amount: parsed,
        date: toIsoDate(date),
        note: note.trim(),
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert("We couldn't record that payment", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading group…" />;

  return (
    <ScreenContainer>
      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        Who paid
      </Text>
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {members.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => setFromUser(m.id)}
            style={[styles.chip, { backgroundColor: fromUser === m.id ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill }]}
          >
            <Text style={{ color: fromUser === m.id ? colors.onPrimary : colors.textMuted, fontWeight: "600" }}>{m.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        Who received it
      </Text>
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {members.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => setToUser(m.id)}
            style={[styles.chip, { backgroundColor: toUser === m.id ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill }]}
          >
            <Text style={{ color: toUser === m.id ? colors.onPrimary : colors.textMuted, fontWeight: "600" }}>{m.name}</Text>
          </Pressable>
        ))}
      </View>

      <TextField label="Amount" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" />
      <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" />

      <Pressable
        onPress={() => setShowDatePicker(true)}
        style={[
          styles.pickerChip,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.xl },
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

      <Button label="Record payment" onPress={handleSave} loading={saving} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pickerChip: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10 },
});
