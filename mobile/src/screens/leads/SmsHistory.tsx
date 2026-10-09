import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import type { Lead } from "../../api/leads";
import { useTheme } from "../../theme/useTheme";

const STATUS: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; tone: "success" | "danger" | "warning" | "muted" }> = {
  delivered: { label: "Delivered", icon: "checkmark-done", tone: "success" },
  sent: { label: "Sent", icon: "checkmark", tone: "success" },
  sending: { label: "Sending", icon: "time-outline", tone: "warning" },
  failed: { label: "Failed", icon: "close-circle", tone: "danger" },
  invalid: { label: "Bad number", icon: "alert-circle", tone: "danger" },
};

/** The automatic SMS sent to a lead, latest first. Read-only: sending is run from the SMS Service website. */
export function SmsHistory({ lead }: { lead: Pick<Lead, "smsState" | "smsSentAt" | "smsError" | "smsHistory"> | null | undefined }) {
  const { colors, spacing, typography } = useTheme();
  const entries = [...(lead?.smsHistory ?? [])].reverse();
  const state = lead?.smsState ?? "";
  const current = STATUS[state];
  const tone = (t: "success" | "danger" | "warning" | "muted") => (t === "muted" ? colors.textMuted : colors[t]);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>SMS</Text>
      {current ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: spacing.xs }}>
          <Ionicons name={current.icon} size={16} color={tone(current.tone)} />
          <Text style={[typography.bodyStrong, { color: tone(current.tone) }]}>{current.label}</Text>
          {lead?.smsSentAt ? <Text style={[typography.caption, { color: colors.textMuted }]}>{new Date(lead.smsSentAt).toLocaleString()}</Text> : null}
        </View>
      ) : (
        <Text style={[typography.body, { color: colors.textMuted }]}>No SMS sent to this lead yet.</Text>
      )}
      {lead?.smsError && (state === "failed" || state === "invalid") ? (
        <Text style={[typography.caption, { color: colors.danger }]}>{lead.smsError}</Text>
      ) : null}
      {entries.length > 1
        ? entries.map((e, i) => (
            <Text key={`${e.at}-${i}`} style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              {[new Date(e.at).toLocaleString(), e.sheet && `Sheet: ${e.sheet}`, e.deviceName && `from ${e.deviceName}`].filter(Boolean).join(" • ")}
            </Text>
          ))
        : null}
    </View>
  );
}
