import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { UserSearchResult } from "../api/users";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";
import { UserPicker } from "./UserPicker";

interface Props {
  visible: boolean;
  title: string;
  busy?: boolean;
  onShare: (user: UserSearchResult) => void | Promise<void>;
  onCancel: () => void;
}

/** Bottom sheet for sharing a copy of a task or transaction with another registered user. */
export function AssignSheet({ visible, title, busy = false, onShare, onCancel }: Props) {
  const { colors, spacing, radius, typography, shadow } = useTheme();
  const [selected, setSelected] = useState<UserSearchResult | null>(null);

  function handleClose() {
    setSelected(null);
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={handleClose}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              shadow.raised,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                padding: spacing.xl,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border, marginBottom: spacing.lg }]} accessibilityElementsHidden />

            <Text accessibilityRole="header" style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>
              {title}
            </Text>

            <View style={{ marginBottom: spacing.lg }}>
              <UserPicker mode="single" value={selected} onChange={setSelected} placeholder="Search people by name" />
            </View>

            <Button
              label="Share"
              size="large"
              loading={busy}
              disabled={!selected}
              onPress={async () => {
                if (!selected) return;
                await onShare(selected);
                setSelected(null);
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={handleClose} disabled={busy} style={{ marginTop: spacing.sm }} />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { width: "100%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2 },
});
