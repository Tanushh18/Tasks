import React, { useEffect, useState } from "react";
import { Alert, Image, Linking, StyleSheet, Text, View } from "react-native";
import type { WhatsAppTemplate } from "../../api/leads";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { fillTemplate, shareTemplateImage, whatsappUrl } from "../../leads/whatsapp";
import { useTheme } from "../../theme/useTheme";

interface Props {
  visible: boolean;
  onClose: () => void;
  template: WhatsAppTemplate | null;
  /** The lead being messaged. */
  lead: { name: string; digits: string } | null;
  /** Called once Send is pressed. We can't see whether WhatsApp delivered it, so this only means "marked as sent". */
  onSent: (template: WhatsAppTemplate) => void;
}

/**
 * Editable preview shown before a templated WhatsApp message. The text can be changed for this one send; the image is the
 * template's fixed image. Send opens the chat with the text prefilled. WhatsApp can't be handed text and an image together
 * from this app, so the image goes as a second step ("Send image") through the phone's share sheet.
 */
export function WhatsAppPreviewSheet({ visible, onClose, template, lead, onSent }: Props) {
  const { colors, spacing, typography, radius } = useTheme();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible && template && lead) {
      setText(fillTemplate(template.text, lead.name));
      setSent(false);
      setBusy(false);
    }
    // Re-seed only when the sheet opens for a different lead / template.
  }, [visible, template?.id, lead?.digits]);

  if (!template || !lead) return null;

  const send = async () => {
    try {
      await Linking.openURL(whatsappUrl(lead.digits, text.trim()));
    } catch {
      Alert.alert("Unable to open WhatsApp");
      return;
    }
    setSent(true);
    onSent(template);
  };

  const imageOnly = !fillTemplate(template.text, lead.name) && !!template.imageUrl;

  const sendImage = async () => {
    setBusy(true);
    try {
      await shareTemplateImage(template.imageUrl);
      // An image-only template has no text step, so sharing the picture is the send.
      if (imageOnly && !sent) {
        setSent(true);
        onSent(template);
      }
    } catch {
      Alert.alert("Couldn't share the image", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="WhatsApp message" subtitle={`Template: ${template.name}`} avoidKeyboard>
      {imageOnly ? null : (
        <TextField label="Message (you can edit it for this lead)" value={text} onChangeText={setText} multiline autoCapitalize="sentences" />
      )}
      {template.imageUrl ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>Image</Text>
          <Image
            source={{ uri: template.imageUrl }}
            accessibilityLabel="Template image preview"
            style={[styles.thumb, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]}
            resizeMode="cover"
          />
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
            {imageOnly
              ? 'This template sends only the image. Tap "Send image" and pick WhatsApp and this chat.'
              : 'WhatsApp can\'t take text and an image together from this app. Send the text first, then tap "Send image" to share the picture to the same chat.'}
          </Text>
        </View>
      ) : null}
      {sent ? (
        <Text style={[typography.caption, { color: colors.success, marginBottom: spacing.sm }]}>
          Marked as sent. This is recorded when you press Send; we can't see whether WhatsApp delivered it.
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <Button label="Close" variant="secondary" onPress={onClose} style={{ flex: 1, marginRight: 8 }} />
        {template.imageUrl && (sent || imageOnly) ? (
          <Button label={busy ? "Opening…" : "Send image"} variant="secondary" onPress={() => void sendImage()} disabled={busy} style={{ flex: 1, marginRight: 8 }} />
        ) : null}
        {imageOnly ? null : <Button label={sent ? "Send again" : "Send"} onPress={() => void send()} disabled={!text.trim()} style={{ flex: 1 }} />}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 120, height: 120 },
  buttons: { flexDirection: "row", marginTop: 8 },
});
