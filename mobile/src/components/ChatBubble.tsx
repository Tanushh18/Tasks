import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  role: "user" | "assistant";
  text: string;
}

export function ChatBubble({ role, text }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const isUser = role === "user";

  return (
    <View style={[styles.row, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.primary : colors.surface,
            borderColor: isUser ? colors.primary : colors.border,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <Text style={[typography.body, { color: isUser ? "#FFFFFF" : colors.text }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 10 },
  bubble: { maxWidth: "82%", borderWidth: StyleSheet.hairlineWidth },
});
