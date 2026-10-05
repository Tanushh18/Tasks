import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AdminBadge } from "../../components/AdminBadge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { TextField } from "../../components/TextField";
import { ALLOWED_SENDERS_LABEL } from "../../expenses/senderAllowList";
import { hasSmsPermission, requestSmsPermission, smsReaderAvailable } from "../../expenses/smsReader";
import {
  BACKFILL_LABELS,
  cancelUpiBackfill,
  getUpiHistory,
  onUpiSettingsChanged,
  getUpiSettings,
  saveParsedMessage,
  setUpiTrackingEnabled,
  syncUpiExpenses,
  updateUpiSettings,
  type BackfillRange,
  type HistoryItem,
  type SyncProgress,
  type UpiSettings,
} from "../../expenses/upiExpenseSync";
import { clearSmsLog, exportSmsLog, getSmsLogStats } from "../../expenses/upiSmsLog";
import { loadUpiMonths, loadUpiMonthTransactions, type MonthRow } from "../../expenses/upiMonths";
import { parseUpiSms, type ParsedUpiSms } from "../../expenses/upiSmsParser";
import { useTheme } from "../../theme/useTheme";
import type { Transaction } from "../../types/models";
import { formatCurrency } from "../../utils/currency";

export function trackerStatus(p: { available: boolean; enabled: boolean; permission: boolean }): string {
  if (!p.available) return "Not supported in this app version. Install the latest APK to use this.";
  if (!p.enabled) return "Off";
  if (!p.permission) return "Needs SMS permission";
  return "On — watching";
}

const RANGE_SEGMENTS = (Object.keys(BACKFILL_LABELS) as BackfillRange[]).map((value) => ({ value, label: BACKFILL_LABELS[value] }));

function formatWhen(ms?: number): string {
  return ms ? new Date(ms).toLocaleString() : "Never";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpiExpenseTrackerScreen() {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();
  const [settings, setSettings] = useState<UpiSettings | null>(null);
  const [permission, setPermission] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [monthsError, setMonthsError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [openTx, setOpenTx] = useState<Transaction[]>([]);
  const [sample, setSample] = useState("");
  const [tested, setTested] = useState<{ text: string; parsed: ParsedUpiSms | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState({ count: 0, bytes: 0 });

  // The import saves its progress after every batch, so the screen follows it live.
  useEffect(() => onUpiSettingsChanged(setSettings), []);

  const refresh = useCallback(async () => {
    setSettings(await getUpiSettings());
    setPermission(hasSmsPermission());
    setHistory(await getUpiHistory());
    setLog(await getSmsLogStats());
    try {
      setMonths(await loadUpiMonths());
      setMonthsError(null);
    } catch (err) {
      setMonthsError(getApiErrorMessage(err, "Couldn't load the monthly totals."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function run(range?: BackfillRange) {
    setBusy(true);
    setProgress({ scanned: 0, saved: 0 });
    try {
      const summary = await syncUpiExpenses({ backfillRange: range, onProgress: setProgress });
      if (summary?.incomplete) Alert.alert("Not finished", "Couldn't reach the server for some messages. They will be retried next time.");
    } catch (err) {
      Alert.alert("Scan failed", getApiErrorMessage(err));
    } finally {
      setProgress(null);
      setBusy(false);
      await refresh();
    }
  }

  async function toggle(next: boolean) {
    if (!next) {
      setSettings(await setUpiTrackingEnabled(false));
      return;
    }
    let granted = hasSmsPermission();
    if (!granted) granted = await requestSmsPermission();
    setPermission(granted);
    // Turning ON reads the old messages too (range chosen below; default: everything).
    const s = await setUpiTrackingEnabled(true, user?.id);
    setSettings(s);
    if (granted) await run(s.range);
  }

  async function cancelImport() {
    await cancelUpiBackfill();
    await refresh();
  }

  async function exportLog() {
    try {
      const uri = await exportSmsLog();
      if (!uri) Alert.alert("Nothing to export", "The message log is empty.");
    } catch (err) {
      Alert.alert("Couldn't export", getApiErrorMessage(err));
    }
  }

  function confirmClearLog() {
    Alert.alert("Clear message log?", "This deletes the saved message text on this phone. Your Money transactions are not affected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear log",
        style: "destructive",
        onPress: () => {
          void clearSmsLog().then(refresh);
        },
      },
    ]);
  }

  async function grant() {
    setPermission(await requestSmsPermission());
    await refresh();
  }

  async function chooseRange(range: BackfillRange) {
    setSettings(await updateUpiSettings({ range }));
  }

  async function toggleMonth(month: string) {
    if (open === month) {
      setOpen(null);
      return;
    }
    setOpen(month);
    setOpenTx([]);
    try {
      setOpenTx(await loadUpiMonthTransactions(month));
    } catch (err) {
      Alert.alert("Couldn't load", getApiErrorMessage(err));
    }
  }

  function test() {
    setTested({ text: sample, parsed: parseUpiSms(sample, Date.now()) });
  }

  async function saveTested() {
    if (!tested?.parsed) return;
    setSaving(true);
    try {
      const result = await saveParsedMessage(tested.parsed);
      Alert.alert(result === "saved" ? "Saved to Money" : "Already saved", result === "saved" ? "The transaction was added." : "This message was added before.");
      await refresh();
    } catch (err) {
      Alert.alert("Couldn't save", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const enabled = !!settings?.enabled;
  const status = trackerStatus({ available: smsReaderAvailable, enabled, permission });
  const p = tested?.parsed;

  return (
    <ScreenContainer>
      <AdminBadge style={{ marginBottom: spacing.md }} />
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        UPI expense tracking
      </Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Track UPI expenses from SMS</Text>
            <Text testID="upi-status" style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              {status}
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={!smsReaderAvailable || busy}
            onValueChange={(v) => void toggle(v)}
            accessibilityLabel="Track UPI expenses from SMS"
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          {`Reading only ${ALLOWED_SENDERS_LABEL}. Only the amount, date, payee and reference are saved to Money; the message text stays in a log file on this phone (see Message log below).`}
        </Text>
        {smsReaderAvailable && enabled && !permission ? (
          <Button label="Allow SMS access" onPress={grant} style={{ marginTop: spacing.md }} />
        ) : null}
        {smsReaderAvailable ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
              {`Last scan: ${formatWhen(settings?.lastRunAt)} · Saved in total: ${settings?.totalSaved ?? 0}`}
            </Text>
            {progress ? (
              <Text testID="upi-progress" style={[typography.captionStrong, { color: colors.primary, marginTop: spacing.sm }]}>
                {`Scanning… ${progress.scanned} messages read, ${progress.saved} saved`}
              </Text>
            ) : null}
            {settings?.backfill?.active ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text testID="upi-backfill" style={[typography.captionStrong, { color: colors.primary }]}>
                  {busy
                    ? `Import in progress — ${settings.backfill.scanned} messages read, ${settings.backfill.saved} saved`
                    : `Import paused — will continue automatically (${settings.backfill.scanned} read, ${settings.backfill.saved} saved so far)`}
                </Text>
                <Button label="Cancel import" accessibilityLabel="Cancel import" variant="secondary" onPress={() => void cancelImport()} style={{ marginTop: spacing.xs }} />
              </View>
            ) : null}
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs }]}>Old messages to import</Text>
            <SegmentedControl segments={RANGE_SEGMENTS} value={settings?.range ?? "all"} onChange={(v) => void chooseRange(v)} scrollable />
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Button label="Scan now" variant="secondary" onPress={() => run()} disabled={busy || !enabled || !permission} style={{ flex: 1 }} />
              <Button label="Import old messages" variant="secondary" onPress={() => run(settings?.range ?? "all")} disabled={busy || !enabled || !permission} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </Card>

      <SectionHeader title="Month by month" subtitle="UPI transactions grouped per month" />
      {monthsError ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{monthsError}</Text> : null}
      {!monthsError && months.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.lg }]}>Nothing yet.</Text>
      ) : null}
      {months.map((m) => (
        <Card key={m.month} style={{ marginBottom: spacing.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel={m.label} accessibilityState={{ expanded: open === m.month }} onPress={() => void toggleMonth(m.month)}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{m.label}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              {`Out ${formatCurrency(m.cashOut)} · In ${formatCurrency(m.cashIn)} · Net ${formatCurrency(m.net)} · ${m.count} ${m.count === 1 ? "entry" : "entries"}`}
            </Text>
          </Pressable>
          {open === m.month
            ? openTx.map((t) => (
                <View key={t.id} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[typography.body, { color: colors.text }]}>{t.description}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{t.date}</Text>
                  </View>
                  <Text style={[typography.bodyStrong, { color: t.type === "IN" ? colors.success : colors.text }]}>
                    {`${t.type === "IN" ? "+" : "-"}${formatCurrency(t.amount)}`}
                  </Text>
                </View>
              ))
            : null}
        </Card>
      ))}

      <SectionHeader title="Recently added" />
      {history.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.lg }]}>Nothing yet.</Text>
      ) : (
        history.map((h) => (
          <View key={h.key} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[typography.body, { color: colors.text }]}>{h.merchant}</Text>
              <Text style={[typography.caption, { color: h.status === "failed" ? colors.danger : colors.textMuted }]}>
                {h.status === "failed" ? `Not saved: ${h.reason ?? "error"}` : `${h.date}${h.ref ? ` · Ref ${h.ref}` : ""}`}
              </Text>
            </View>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{`${h.type === "IN" ? "+" : "-"}${formatCurrency(h.amount)}`}</Text>
          </View>
        ))
      )}

      <SectionHeader title="Message log" subtitle="Every bank message read, saved as JSON on this phone" />
      <Card style={{ marginBottom: spacing.lg }}>
        <Text testID="upi-log-stats" style={[typography.bodyStrong, { color: colors.text }]}>
          {`${log.count} ${log.count === 1 ? "message" : "messages"} · ${formatBytes(log.bytes)}`}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
          This log is stored only on this phone. It contains the full text of each message, including any OTPs the bank sent. It is never uploaded and is shared only when you tap Export.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
          <Button label="Export log (JSON)" accessibilityLabel="Export log (JSON)" variant="secondary" onPress={() => void exportLog()} disabled={log.count === 0} style={{ flex: 1 }} />
          <Button label="Clear log" accessibilityLabel="Clear log" variant="secondary" onPress={confirmClearLog} disabled={log.count === 0} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionHeader title="Test a message" subtitle="Paste a bank SMS to see what is read from it" />
      <TextField label="SMS text" value={sample} onChangeText={setSample} multiline autoCapitalize="none" placeholder="Debited Rs 200.00 from a/c X1234 …" />
      <Button label="Check message" accessibilityLabel="Check message" variant="secondary" onPress={test} disabled={!sample.trim()} />
      {tested ? (
        <Card style={{ marginTop: spacing.md }}>
          {p ? (
            <>
              <Text testID="upi-parsed" style={[typography.bodyStrong, { color: colors.text }]}>
                {`${p.type === "OUT" ? "Paid" : "Received"} ${formatCurrency(p.amount)} ${p.type === "OUT" ? "to" : "from"} ${p.merchant}`}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {`${p.date} ${p.time}${p.ref ? ` · Ref ${p.ref}` : " · no reference number"}${p.accountLast4 ? ` · a/c X${p.accountLast4}` : ""}`}
              </Text>
              <Button label="Save it" accessibilityLabel="Save it" onPress={saveTested} loading={saving} style={{ marginTop: spacing.md }} />
            </>
          ) : (
            <Text testID="upi-not-parsed" style={[typography.body, { color: colors.textMuted }]}>
              This doesn't look like a completed UPI payment, so it would be ignored.
            </Text>
          )}
        </Card>
      ) : null}
    </ScreenContainer>
  );
}
