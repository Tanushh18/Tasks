import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FamilyAvatar } from "./FamilyAvatar";
import { useTheme } from "../theme/useTheme";

interface Props {
  role: "user" | "assistant";
  text: string;
  /** Display name of the other person, used for the avatar next to their messages. */
  senderName?: string;
  /** ISO timestamp shown on long-press since the backend has no delivered/read status. */
  createdAt?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ChatBubble({ role, text, senderName, createdAt }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const isUser = role === "user";
  const [showTimestamp, setShowTimestamp] = useState(false);

  return (
    <View style={[styles.row, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
      {!isUser && senderName ? (
        <View style={{ marginRight: spacing.xs }}>
          <FamilyAvatar name={senderName} size={28} />
        </View>
      ) : null}
      <Pressable
        onLongPress={() => setShowTimestamp((prev) => !prev)}
        disabled={!createdAt}
        accessibilityRole={createdAt ? "button" : undefined}
        accessibilityLabel={createdAt ? `Message sent ${formatTime(createdAt)}. Press and hold to toggle timestamp.` : undefined}
      >
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
        {showTimestamp && createdAt ? (
          <Text
            style={[
              typography.caption,
              {
                color: colors.textFaint,
                textAlign: isUser ? "right" : "left",
                marginTop: 2,
              },
            ]}
          >
            Sent {formatTime(createdAt)}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end" },
  bubble: { maxWidth: "82%", borderWidth: StyleSheet.hairlineWidth },
});
