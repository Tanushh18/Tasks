import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { enqueueTransactionCreate, enqueueTransactionUpdate, isNetworkFailure } from "../../offline/offlineQueue";
import { useTheme } from "../../theme/useTheme";
import { formatDateLabel, formatTimeLabel, toHm, toIsoDate } from "../../utils/date";
import type { FinanceAccount, TransactionType } from "../../types/models";
import type { FinanceStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<FinanceStackParamList, "TransactionForm">;

export function TransactionFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { transactionId } = route.params ?? {};
  const isEditing = Boolean(transactionId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>(route.params?.accountId);
  const [type, setType] = useState<TransactionType>(route.params?.type ?? "OUT");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (!accountId) {
          const list = await financeApi.listAccounts();
          setAccounts(list);
          if (list.length === 1) setAccountId(list[0].id);
        }
        if (transactionId) {
          const existing = await financeApi.getTransaction(transactionId);
          setAccountId(existing.accountId);
          setType(existing.type);
          setAmount(String(existing.amount));
          setCategory(existing.category);
          setDescription(existing.description);
          setDate(new Date(`${existing.date}T${existing.time}:00`));
          setTime(new Date(`${existing.date}T${existing.time}:00`));
          setNotes(existing.notes);
        }
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  async function handleSave() {
    const numericAmount = Number(amount);
    if (!accountId) {
      setError("Choose an account");
      return;
    }
    if (!numericAmount || numericAmount <= 0) {
      setError("Enter a valid amount greater than 0");
      return;
    }
    setError(null);
    setSaving(true);

    const input = {
      accountId,
      type,
      amount: numericAmount,
      category: category.trim() || "General",
      description,
      date: toIsoDate(date),
      time: toHm(time),
      notes,
    };

    try {
      if (isEditing && transactionId) {
        await financeApi.updateTransaction(transactionId, input);
      } else {
        await financeApi.createTransaction(input);
      }
      navigation.goBack();
    } catch (err) {
      if (isNetworkFailure(err)) {
        // No connection reached the server — queue it locally so the entry isn't lost; it syncs
        // automatically (and safely, via its idempotency key for a new one) once you're back online.
        if (isEditing && transactionId) {
          await enqueueTransactionUpdate(transactionId, input);
        } else {
          await enqueueTransactionCreate(input);
        }
        Alert.alert("Saved offline", "No connection right now — this will sync automatically once you're back online.");
        navigation.goBack();
        return;
      }
      setError(getApiErrorMessage(err, "Could not save this transaction."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit Transaction" : "New Transaction"}
      </Text>

      {!route.params?.accountId && accounts.length > 1 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Account</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {accounts.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAccountId(a.id)}
                style={[
                  styles.chip,
                  { backgroundColor: accountId === a.id ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill },
                ]}
              >
                <Text style={{ color: accountId === a.id ? "#FFFFFF" : colors.textMuted, fontWeight: "600" }}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
        <Pressable
          onPress={() => setType("IN")}
          style={[styles.typeButton, { backgroundColor: type === "IN" ? colors.successMuted : colors.surfaceAlt, borderRadius: radius.md }]}
        >
          <Text style={{ color: type === "IN" ? colors.success : colors.textMuted, fontWeight: "700" }}>Cash In</Text>
        </Pressable>
        <Pressable
          onPress={() => setType("OUT")}
          style={[styles.typeButton, { backgroundColor: type === "OUT" ? colors.dangerMuted : colors.surfaceAlt, borderRadius: radius.md }]}
        >
          <Text style={{ color: type === "OUT" ? colors.danger : colors.textMuted, fontWeight: "700" }}>Cash Out</Text>
        </Pressable>
      </View>

      <TextField label="Amount (₹)" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="numeric" />
      <TextField label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Salary, Utilities, Groceries" />
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />

      <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg }}>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[styles.pickerChip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Date</Text>
          <Text style={[typography.body, { color: colors.text }]}>{formatDateLabel(toIsoDate(date))}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowTimePicker(true)}
          style={[styles.pickerChip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Time</Text>
          <Text style={[typography.body, { color: colors.text }]}>{formatTimeLabel(toHm(time))}</Text>
        </Pressable>
      </View>

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
      {showTimePicker ? (
        <DateTimePicker
          value={time}
          mode="time"
          onChange={(_e, selected) => {
            setShowTimePicker(false);
            if (selected) setTime(selected);
          }}
        />
      ) : null}

      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline />

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={isEditing ? "Save changes" : "Save transaction"} onPress={handleSave} loading={saving} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center" },
  typeButton: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  pickerChip: { flex: 1, borderWidth: 1, padding: 12 },
});
