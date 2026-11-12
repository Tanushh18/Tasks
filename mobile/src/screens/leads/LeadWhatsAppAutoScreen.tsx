import React, { useEffect } from "react";
import { Text } from "react-native";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { stopBackgroundSender } from "../../leads/whatsappAutoBackground";
import { useTheme } from "../../theme/useTheme";

/**
 * WhatsApp auto send is controlled from Stashr only (the website's "WhatsApp sender" page: the on/off switch, the sheets, the
 * limits and the test buttons). This app no longer starts or stops any sending, so nothing here can send a message. Opening
 * this screen also makes sure the old on-tablet sender from earlier versions is off.
 */
export function LeadWhatsAppAutoScreen() {
  const { spacing, typography, colors } = useTheme();
  useEffect(() => { stopBackgroundSender(); }, []);
  return (
    <ScreenContainer scroll>
      <Card style={{ gap: spacing.sm }}>
        <Text style={typography.h3}>WhatsApp auto send is managed in Stashr</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Turning it on or off, choosing the sheet, the limits, the messages, the pictures and the test messages are all in Stashr: open the website and choose "WhatsApp sender".
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Each message that goes out is marked on the lead here, so the sheets always agree. Nothing in this app starts or stops sending.
        </Text>
      </Card>
    </ScreenContainer>
  );
}
