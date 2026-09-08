import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Caps the sheet height and scrolls inside it. Off for short option menus. */
  scrollable?: boolean;
}

/**
 * General-purpose bottom sheet for content that isn't a yes/no decision —
 * a day's agenda, a long-press action menu, a filter panel.
 *
 * `ConfirmationSheet` stays the surface for "are you sure" moments; keeping
 * them separate means a destructive confirm can never be dismissed by the
 * same casual backdrop tap that closes a browsing sheet.
 */
export function BottomSheet({ visible, onClose, title, subtitle, children, scrollable = true }: Props) {
  const { colors, spacing, radius, typography, shadow, touchTarget } = useTheme();

  const content = (
    <>
      {title ? (
        <View style={[styles.header, { marginBottom: spacing.lg, gap: spacing.md }]}>
          <View style={styles.titleBlock}>
            <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={({ pressed }) => [
              styles.close,
              {
                minWidth: touchTarget.min,
                minHeight: touchTarget.min,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
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
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.lg,
              paddingBottom: spacing.xxl,
            },
          ]}
        >
          <View
            style={[styles.grabber, { backgroundColor: colors.border, marginBottom: spacing.lg }]}
            accessibilityElementsHidden
          />
          {scrollable ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {content}
            </ScrollView>
          ) : (
            content
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface SheetAction {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/** Standard long-press menu rows — Reply, React, Edit, Delete. */
export function SheetActionList({ actions }: { actions: SheetAction[] }) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();

  return (
    <View>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.actionRow,
            {
              minHeight: touchTarget.comfortable,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              backgroundColor: pressed ? colors.surfaceAlt : "transparent",
            },
          ]}
        >
          <Ionicons
            name={action.icon}
            size={20}
            color={action.destructive ? colors.danger : colors.textMuted}
          />
          <Text
            style={[
              typography.body,
              { color: action.destructive ? colors.danger : colors.text, marginLeft: spacing.md },
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { width: "100%", maxHeight: "85%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  titleBlock: { flexShrink: 1 },
  close: { alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", alignItems: "center" },
});
