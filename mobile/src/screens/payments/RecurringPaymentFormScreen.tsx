import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as recurringPaymentsApi from "../../api/recurringPayments";
import type { UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { todayIso } from "../../utils/date";

type Props = NativeStackScreenProps<MoreStackParamList, "RecurringPaymentForm">;

type Frequency = "weekly" | "monthly" | "yearly";
const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];

export function RecurringPaymentFormScreen({ route, navigation }: Props) {
  const { paymentId } = route.params ?? {};
  const { colors, feature, spacing, radius, typography } = useTheme();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextDueDate, setNextDueDate] = useState(todayIso());
  const [sharedWith, setSharedWith] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(Boolean(paymentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: paymentId ? "Edit recurring payment" : "New recurring payment" });
  }, [navigation, paymentId]);

  useEffect(() => {
    if (!paymentId) return;
    (async () => {
      try {
        const payment = await recurringPaymentsApi.getPayment(paymentId);
        setName(payment.name);
        setAmount(String(payment.amount));
        setCategory(payment.category);
        setFrequency(payment.frequency);
        setNextDueDate(payment.nextDueDate);
        setSharedWith(payment.sharedWith.filter((m) => m.id !== user?.id));
      } catch (err) {
        setError(getApiErrorMessage(err, "We couldn't load this payment."));
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentId, user?.id]);

  async function handleSave() {
    const trimmedName = name.trim();
    const parsedAmount = Number(amount);
    if (!trimmedName) {
      Alert.alert("Give this payment a name", 'For example, "Rent" or "Electricity".');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Enter a valid amount", "The amount must be a positive number.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      Alert.alert("Enter a valid due date", "Use the format YYYY-MM-DD.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        name: trimmedName,
        amount: parsedAmount,
        category: category.trim() || "General",
        frequency,
        nextDueDate,
        sharedWith: sharedWith.map((m) => m.id),
      };
      if (paymentId) {
        await recurringPaymentsApi.updatePayment(paymentId, input);
      } else {
        await recurringPaymentsApi.createPayment(input);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("We couldn't save this payment", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading payment…" />;

  return (
    <ScreenContainer>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.lg }]}>
        This is a tracking tool only — no money is actually moved or charged. It just reminds your
        family when a recurring bill is due.
      </Text>

      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Rent" maxLength={80} />
      <TextField
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="e.g. 15000"
        keyboardType="numeric"
      />
      <TextField
        label="Category"
        value={category}
        onChangeText={setCategory}
        placeholder="e.g. Housing"
        maxLength={60}
      />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>Frequency</Text>
      <View style={[styles.row, { marginBottom: spacing.lg }]}>
        {FREQUENCIES.map((freq) => {
          const selected = frequency === freq;
          return (
            <Pressable
              key={freq}
              onPress={() => setFrequency(freq)}
              accessibilityRole="button"
              accessibilityLabel={`Frequency: ${freq}`}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? feature.finance.solid : feature.finance.muted,
                  borderRadius: radius.pill,
                },
              ]}
            >
              <Text style={[typography.captionStrong, { color: selected ? colors.onPrimary : feature.finance.solid }]}>
                {freq[0].toUpperCase() + freq.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Next due date (YYYY-MM-DD)"
        value={nextDueDate}
        onChangeText={setNextDueDate}
        placeholder="2026-01-05"
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
        label={paymentId ? "Save changes" : "Add recurring payment"}
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.xl }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16 },
});
