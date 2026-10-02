import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as financeApi from "../../api/finance";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { TextField } from "../../components/TextField";
import type { FinanceStackParamList } from "../../navigation/types";
import { scopedKey } from "../../offline/scope";
import { getJson, setJson } from "../../offline/storage";
import { useTheme } from "../../theme/useTheme";
import type { FinanceAccount } from "../../types/models";
import { formatDateLabel, toIsoDate } from "../../utils/date";

type Props = NativeStackScreenProps<FinanceStackParamList, "ExportReport">;

type Preset = "month" | "lastMonth" | "quarter" | "year" | "all" | "custom";

const RECIPIENTS_KEY_BASE = "dt_export_recipients";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "quarter", label: "Last 3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

/** First/last day for a preset, as YYYY-MM-DD (undefined = unbounded). */
function presetRange(preset: Exclude<Preset, "custom">): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(now) };
    case "lastMonth":
      return { from: toIsoDate(new Date(y, m - 1, 1)), to: toIsoDate(new Date(y, m, 0)) };
    case "quarter":
      return { from: toIsoDate(new Date(y, m - 2, 1)), to: toIsoDate(now) };
    case "year":
      return { from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(now) };
    case "all":
      return {};
  }
}

export function ExportReportScreen({ route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [selected, setSelected] = useState<string[]>(route.params?.accountId ? [route.params.accountId] : []);
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState<Date>(new Date());
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [settled, setSettled] = useState<financeApi.SettledMode>("all");
  const [type, setType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"download" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    financeApi
      .listAccounts(true)
      .then(setAccounts)
      .catch((err) => setError(getApiErrorMessage(err, "We couldn't load your accounts.")));
    const key = scopedKey(RECIPIENTS_KEY_BASE);
    if (key) getJson<string>(key).then((saved) => saved && setRecipients(saved));
  }, []);

  const range = useMemo(
    () => (preset === "custom" ? { from: toIsoDate(customFrom), to: toIsoDate(customTo) } : presetRange(preset)),
    [preset, customFrom, customTo]
  );

  function toggleAccount(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function buildOptions(): financeApi.ExportOptions | null {
    if (range.from && range.to && range.from > range.to) {
      setError("The start date must be before the end date.");
      return null;
    }
    return {
      accountIds: selected.length > 0 ? selected : undefined,
      from: range.from,
      to: range.to,
      type: type === "ALL" ? undefined : type,
      settled,
    };
  }

  async function handleDownload() {
    setError(null);
    setNotice(null);
    const options = buildOptions();
    if (!options) return;
    setBusy("download");
    try {
      const result = await financeApi.buildExport(options);
      if (result.entryCount === 0) {
        setNotice("There are no entries for those choices, so the file only has the summary sheet.");
      }
      const uri = `${FileSystem.cacheDirectory}${Date.now()}-${result.fileName}`;
      await FileSystem.writeAsStringAsync(uri, result.base64, { encoding: FileSystem.EncodingType.Base64 });
      if (!(await Sharing.isAvailableAsync())) {
        setError("This device has no app that can open or save the Excel file.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: result.mimeType,
        dialogTitle: "Save or send your money report",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't create the Excel file."));
    } finally {
      setBusy(null);
    }
  }

  async function handleEmail() {
    setError(null);
    setNotice(null);
    if (!recipients.trim()) {
      setError("Enter the email address to send the report to.");
      return;
    }
    const options = buildOptions();
    if (!options) return;
    setBusy("email");
    try {
      const result = await financeApi.emailExport({ ...options, recipients: recipients.trim(), message: message.trim() || undefined });
      const key = scopedKey(RECIPIENTS_KEY_BASE);
      if (key) await setJson(key, recipients.trim());
      Alert.alert("Report sent", `The report (${result.entryCount} entries) was emailed to ${recipients.trim()}.`);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't send the email."));
    } finally {
      setBusy(null);
    }
  }

  const periodText =
    preset === "all"
      ? "Everything, from the first entry"
      : `${range.from ? formatDateLabel(range.from) : "Start"} – ${range.to ? formatDateLabel(range.to) : "Today"}`;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xs }]}>
        Money report
      </Text>
      <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.lg }]}>
        Cash in and cash out with the account, date and settled status — as an Excel file or by email.
      </Text>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Accounts</Text>
      <FilterChipGroup>
        <FilterChip label="All accounts" selected={selected.length === 0} onPress={() => setSelected([])} />
        {accounts.map((account) => (
          <FilterChip
            key={account.id}
            label={account.name}
            selected={selected.includes(account.id)}
            onPress={() => toggleAccount(account.id)}
          />
        ))}
      </FilterChipGroup>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
        Time period
      </Text>
      <FilterChipGroup>
        {PRESETS.map((p) => (
          <FilterChip key={p.value} label={p.label} selected={preset === p.value} onPress={() => setPreset(p.value)} />
        ))}
      </FilterChipGroup>
      {preset === "custom" ? (
        <View style={[styles.row, { marginTop: spacing.md, gap: spacing.md }]}>
          <DateButton label="From" date={customFrom} onPress={() => setPicking("from")} />
          <DateButton label="To" date={customTo} onPress={() => setPicking("to")} />
        </View>
      ) : null}
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>{periodText}</Text>
      {picking ? (
        <DateTimePicker
          value={picking === "from" ? customFrom : customTo}
          mode="date"
          maximumDate={new Date()}
          onChange={(_event, date) => {
            const which = picking;
            setPicking(null);
            if (!date) return;
            if (which === "from") setCustomFrom(date);
            else setCustomTo(date);
          }}
        />
      ) : null}

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
        Include
      </Text>
      <SegmentedControl
        segments={[
          { value: "all", label: "Everything" },
          { value: "exclude", label: "Open only" },
          { value: "only", label: "Settled only" },
        ]}
        value={settled}
        onChange={setSettled}
      />
      <View style={{ height: spacing.md }} />
      <SegmentedControl
        segments={[
          { value: "ALL", label: "In & out" },
          { value: "IN", label: "Cash in" },
          { value: "OUT", label: "Cash out" },
        ]}
        value={type}
        onChange={setType}
      />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.lg }]}>{error}</Text>
      ) : null}
      {notice ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>{notice}</Text>
      ) : null}

      <Button
        label="Download Excel"
        size="large"
        onPress={handleDownload}
        loading={busy === "download"}
        disabled={busy !== null}
        style={{ marginTop: spacing.xl }}
      />

      <Card style={{ marginTop: spacing.xl, borderRadius: radius.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.sm }]}>Email this report</Text>
        <TextField
          label="Send to"
          value={recipients}
          onChangeText={setRecipients}
          placeholder="name@example.com (separate several with commas)"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField label="Message (optional)" value={message} onChangeText={setMessage} placeholder="Add a note" multiline />
        <Button
          label="Send email with Excel"
          variant="secondary"
          onPress={handleEmail}
          loading={busy === "email"}
          disabled={busy !== null}
        />
      </Card>
    </ScreenContainer>
  );
}

function DateButton({ label, date, onPress }: { label: string; date: Date; onPress: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} date ${formatDateLabel(toIsoDate(date))}`}
      style={[
        styles.dateButton,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
      ]}
    >
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatDateLabel(toIsoDate(date))}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  dateButton: { flex: 1, borderWidth: 1 },
});
