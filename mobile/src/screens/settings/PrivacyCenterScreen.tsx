import React from "react";
import { Text, View } from "react-native";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { useTheme } from "../../theme/useTheme";

/**
 * Plain-language explanation of what happens to a family's data. Every claim
 * here is checked against the actual backend behaviour (models/services)
 * rather than aspirational copy, since an inaccurate privacy screen is worse
 * than none at all.
 */
export function PrivacyCenterScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        Privacy Center
      </Text>

      <SectionHeader title="Your data" />
      <InfoCard spacing={spacing}>
        <Text style={[typography.body, { color: colors.text }]}>
          Everything you add — tasks, notes, contacts and money records — is private to your family. No one outside
          your registered family members can see it.
        </Text>
      </InfoCard>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Location" />
      </View>
      <InfoCard spacing={spacing}>
        <Text style={[typography.body, { color: colors.text }]}>
          Sharing your location is always your choice, and you can turn it on or off at any time. It's controlled
          from the Family tab, not from here — look for Location Sharing there.
        </Text>
      </InfoCard>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Shared content" />
      </View>
      <InfoCard spacing={spacing}>
        <Text style={[typography.body, { color: colors.text }]}>
          Contacts, notes and tasks stay private by default. You can explicitly share individual items with specific
          family members, and only the people you choose can see the ones you've shared.
        </Text>
      </InfoCard>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Devices" />
      </View>
      <InfoCard spacing={spacing}>
        <Text style={[typography.body, { color: colors.text }]}>
          This app keeps you signed in on one device at a time. Signing in on a new phone signs you out of any other
          device automatically — a simple way to know only you are logged in.
        </Text>
      </InfoCard>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="AI assistant" />
      </View>
      <InfoCard spacing={spacing}>
        <Text style={[typography.body, { color: colors.text }]}>
          The assistant can only take a specific set of actions you've effectively approved by asking it to — like
          adding a task or logging a transaction. It never has open-ended access to your data.
        </Text>
        <Text style={[typography.body, { color: colors.text, marginTop: spacing.md }]}>
          Anything involving money is treated with extra care: by default, the assistant will always ask you to
          confirm before it saves a transaction. You can turn this confirmation off in Settings if you'd rather it
          act right away.
        </Text>
      </InfoCard>
    </ScreenContainer>
  );
}

function InfoCard({ spacing, children }: { spacing: ReturnType<typeof useTheme>["spacing"]; children: React.ReactNode }) {
  return <Card style={{ marginBottom: spacing.md }}>{children}</Card>;
}
