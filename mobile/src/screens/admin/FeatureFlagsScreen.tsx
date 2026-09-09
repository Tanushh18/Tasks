import React, { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import * as adminApi from "../../api/admin";
import { getApiErrorMessage } from "../../api/client";
import type { FeatureFlags } from "../../api/features";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonLines } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import { useFeatureFlags } from "../../features/FeatureFlagsContext";
import { useTheme } from "../../theme/useTheme";

const FLAG_LABELS: { key: keyof FeatureFlags; label: string; detail: string }[] = [
  { key: "contacts", label: "Contacts", detail: "The Contacts tab and its data" },
  { key: "chat", label: "Chat", detail: "The Chat tab and messaging" },
  { key: "ocr", label: "OCR scanning", detail: "Camera scan buttons on contact and money forms" },
  { key: "location", label: "Location Sharing", detail: "Sharing and viewing live locations" },
  { key: "assistant", label: "Assistant", detail: "The voice assistant" },
  { key: "notes", label: "Notes", detail: "The Notes feature" },
  { key: "groupExpenses", label: "Group Expenses", detail: "Trip/group expense splitting and settle-up" },
  { key: "recurringPayments", label: "Recurring Payments", detail: "Recurring bill tracking and due-date reminders" },
  { key: "familyGoals", label: "Family Goals", detail: "Shared savings goals and contributions" },
];

export function FeatureFlagsScreen() {
  const { colors, spacing, typography } = useTheme();
  const { refresh } = useFeatureFlags();

  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setFlags(await adminApi.getFeatureFlags());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load the feature flags."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(key: keyof FeatureFlags, next: boolean) {
    if (!flags) return;
    const previous = flags;
    setFlags({ ...flags, [key]: next });
    try {
      const updated = await adminApi.updateFeatureFlags({ [key]: next });
      setFlags(updated);
      void refresh();
    } catch (err) {
      setFlags(previous);
      Alert.alert("We couldn't save that change", getApiErrorMessage(err));
    }
  }

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        Feature Flags
      </Text>

      {loading ? (
        <SkeletonLines count={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : flags ? (
        FLAG_LABELS.map(({ key, label, detail }) => (
          <Card key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{label}</Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{detail}</Text>
            </View>
            <Switch
              value={flags[key]}
              onValueChange={(next) => toggle(key, next)}
              accessibilityLabel={label}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </Card>
        ))
      ) : null}
    </ScreenContainer>
  );
}
