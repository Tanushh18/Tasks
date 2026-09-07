import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as chatApi from "../../api/chat";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ChatBubble } from "../../components/ChatBubble";
import type { ChatStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { Ionicons } from "@expo/vector-icons";

type Props = NativeStackScreenProps<ChatStackParamList, "ChatThread">;

const POLL_INTERVAL_MS = 4000;

export function ChatThreadScreen({ route, navigation }: Props) {
  const { userId, name } = route.params;
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const { user } = useAuth();

  const [messages, setMessages] = useState<chatApi.ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const lastTimestamp = useRef<string | undefined>(undefined);
  const listRef = useRef<FlatList<chatApi.ChatMessage>>(null);

  useEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  const poll = useCallback(async () => {
    try {
      const fetched = await chatApi.listMessages(userId, lastTimestamp.current);
      if (fetched.length > 0) {
        lastTimestamp.current = fetched[fetched.length - 1].createdAt;
        setMessages((prev) => [...prev, ...fetched]);
      }
    } catch {
      // Silent — the next poll retries.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      // Reset on entering a fresh thread so switching between chats doesn't mix history.
      setMessages([]);
      lastTimestamp.current = undefined;
      setLoading(true);
      poll();
      const interval = setInterval(poll, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [poll])
  );

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setSending(true);
    try {
      const message = await chatApi.sendMessage(userId, text);
      lastTimestamp.current = message.createdAt;
      setMessages((prev) => [...prev, message]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setDraft(text);
      // eslint-disable-next-line no-alert
      console.warn(getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <ChatBubble role={item.fromUserId === user?.id ? "user" : "assistant"} text={item.text} />
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyCenter}>
                <Text style={[typography.body, { color: colors.textMuted }]}>Say hello to {name}.</Text>
              </View>
            ) : null
          }
        />

        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Message"
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.pill,
                color: colors.text,
                minHeight: touchTarget.comfortable,
              },
            ]}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
                minWidth: touchTarget.comfortable,
                minHeight: touchTarget.comfortable,
                opacity: !draft.trim() || sending ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyCenter: { alignItems: "center", justifyContent: "center", paddingTop: 48 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, paddingHorizontal: 14, fontSize: 16 },
  sendButton: { alignItems: "center", justifyContent: "center" },
});
