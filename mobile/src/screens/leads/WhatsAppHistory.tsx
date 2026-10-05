import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import type { Lead } from "../../api/leads";
import { useTheme } from "../../theme/useTheme";

/** When WhatsApp messages were sent to a lead, latest first. "Sent" means Send was pressed; delivery can't be verified. */
export function WhatsAppHistory({ entries }: { entries: NonNullable<Lead["whatsappHistory"]> }) {
  const { colors, spacing, typography } = useTheme();
  if (!entries.length) {
    return <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.lg }]}>No WhatsApp message sent to this lead yet.</Text>;
  }
  const latestFirst = [...entries].reverse();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        {`Last sent ${new Date(latestFirst[0].at).toLocaleString()}`}
      </Text>
      {latestFirst.map((e, i) => (
        <View key={`${e.at}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: spacing.xs }}>
          <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { color: colors.text }]}>{new Date(e.at).toLocaleString()}</Text>
            {e.templateName || e.byName ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {[e.templateName && `Template: ${e.templateName}`, e.byName && `by ${e.byName}`].filter(Boolean).join(" • ")}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
