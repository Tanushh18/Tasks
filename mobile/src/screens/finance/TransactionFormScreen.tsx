import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import * as ocrApi from "../../api/ocr";
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

/** Everyday categories, so the common case is one tap rather than typing. */
const EXPENSE_CATEGORIES = ["Groceries", "Bills", "Travel", "Food", "Health", "Shopping"];
const INCOME_CATEGORIES = ["Salary", "Refund", "Gift", "Interest"];

export function TransactionFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
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
  const [scanning, setScanning] = useState(false);

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
      setError("Choose which account this belongs to.");
      return;
    }
    if (!numericAmount || numericAmount <= 0) {
      setError("Enter an amount greater than zero.");
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
        Alert.alert(
          "Saved on this phone",
          "You're offline, so this hasn't reached your account yet. We'll sync it automatically when you're back online."
        );
        navigation.goBack();
        return;
      }
      setError(getApiErrorMessage(err, "Could not save this transaction."));
    } finally {
      setSaving(false);
    }
  }

  async function scanFrom(source: "camera" | "library") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access so we can scan the receipt.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setScanning(true);
    try {
      const scanned = await ocrApi.scanImage(result.assets[0].base64, "receipt");
      if (scanned.amount) setAmount(String(scanned.amount));
      if (scanned.category) setCategory(scanned.category);
      if (scanned.merchant) setDescription(scanned.merchant);
      if (scanned.date) {
        const parsed = new Date(`${scanned.date}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) setDate(parsed);
      }
    } catch (err) {
      Alert.alert("Couldn't read that image", getApiErrorMessage(err, "Please try again or enter the details manually."));
    } finally {
      setScanning(false);
    }
  }

  function handleScanPress() {
    Alert.alert("Scan a receipt", "Choose a photo source.", [
      { text: "Take Photo", onPress: () => scanFrom("camera") },
      { text: "Choose from Library", onPress: () => scanFrom("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          {isEditing ? "Edit entry" : type === "IN" ? "Money received" : "Add expense"}
        </Text>
        <Pressable
          onPress={handleScanPress}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt"
          hitSlop={8}
        >
          {scanning ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="camera-outline" size={26} color={colors.primary} />}
        </Pressable>
      </View>

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
          accessibilityRole="button"
          accessibilityState={{ selected: type === "IN" }}
          style={[styles.typeButton, { backgroundColor: type === "IN" ? colors.successMuted : colors.surfaceAlt, borderRadius: radius.md }]}
        >
          <Text style={{ color: type === "IN" ? colors.success : colors.textMuted, fontWeight: "700" }}>
            Money in
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setType("OUT")}
          accessibilityRole="button"
          accessibilityState={{ selected: type === "OUT" }}
          style={[styles.typeButton, { backgroundColor: type === "OUT" ? colors.dangerMuted : colors.surfaceAlt, borderRadius: radius.md }]}
        >
          <Text style={{ color: type === "OUT" ? colors.danger : colors.textMuted, fontWeight: "700" }}>
            Expense
          </Text>
        </Pressable>
      </View>

      {/* The amount is the point of this screen, so it gets its own oversized field. */}
      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>Amount</Text>
      <View
        style={[
          styles.amountRow,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.lg },
        ]}
      >
        <Text style={[typography.amount, { color: colors.textMuted }]}>₹</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          accessibilityLabel="Amount"
          style={[typography.amount, styles.amountInput, { color: colors.text }]}
        />
      </View>

      <TextField label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Groceries" />
      {/* One tap beats typing a category that is almost always one of a handful (spec §69). */}
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {(type === "IN" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((suggestion) => {
          const active = category.trim().toLowerCase() === suggestion.toLowerCase();
          return (
            <Pressable
              key={suggestion}
              onPress={() => setCategory(suggestion)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.surfaceAlt,
                  borderRadius: radius.pill,
                  minHeight: touchTarget.min,
                },
              ]}
            >
              <Text style={[typography.caption, { color: active ? colors.onPrimary : colors.textMuted }]}>
                {suggestion}
              </Text>
            </Pressable>
          );
        })}
      </View>
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

      <Button
        label={isEditing ? "Save changes" : type === "IN" ? "Save Money In" : "Save Expense"}
        size="large"
        onPress={handleSave}
        loading={saving}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amountRow: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  amountInput: { flex: 1, padding: 0 },
  typeButton: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  pickerChip: { flex: 1, borderWidth: 1, padding: 12 },
});
