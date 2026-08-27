import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";

export interface ConfirmationDetail {
  label: string;
  value: string;
}

interface Props {
  visible: boolean;
  title: string;
  /** Optional supporting sentence, e.g. what will happen and whether it can be undone. */
  message?: string;
  /** Key facts the user is agreeing to — amount, category, date. */
  details?: ConfirmationDetail[];
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. Use only when something is really being removed. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * One confirmation surface for the whole app, so every "are you sure" moment looks and behaves the
 * same — money being saved, a task being deleted, an account being closed.
 *
 * The facts being confirmed are always shown as `details` rather than folded into prose: someone
 * approving a ₹750 grocery expense should see the amount, the category and the date without having
 * to parse a sentence.
 */
export function ConfirmationSheet({
  visible,
  title,
  message,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { colors, spacing, radius, typography, shadow } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Tapping the dimmed area cancels — but never confirms, so a stray tap can't spend money. */}
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onCancel}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.sheet,
            shadow.raised,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.xl,
            },
          ]}
        >
          <View
            style={[styles.grabber, { backgroundColor: colors.border, marginBottom: spacing.lg }]}
            accessibilityElementsHidden
          />

          <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
            {title}
          </Text>

          {message ? (
            <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>{message}</Text>
          ) : null}

          {details && details.length > 0 ? (
            <View
              style={{
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.md,
                padding: spacing.lg,
                marginTop: spacing.lg,
              }}
            >
              {details.map((detail, index) => (
                <View
                  key={detail.label}
                  style={[styles.detailRow, { marginTop: index === 0 ? 0 : spacing.sm }]}
                >
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{detail.label}</Text>
                  <Text style={[typography.bodyStrong, { color: colors.text, flexShrink: 1, textAlign: "right" }]}>
                    {detail.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: spacing.xl }}>
            <Button
              label={confirmLabel}
              size="large"
              variant={destructive ? "danger" : "primary"}
              loading={busy}
              onPress={onConfirm}
            />
            <Button
              label={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={busy}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { width: "100%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
