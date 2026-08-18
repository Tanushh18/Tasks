import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as assistantApi from "../../api/assistant";
import * as authApi from "../../api/auth";
import { getApiErrorMessage, isRequestCanceled } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ChatBubble } from "../../components/ChatBubble";
import { useTheme } from "../../theme/useTheme";
import { speak, stopSpeaking } from "../../voice/tts";
import { useVoiceInput } from "../../voice/useVoiceInput";
import type { MainTabParamList } from "../../navigation/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What are my tasks for tomorrow?",
  "How much did I spend this month?",
  "Remind me to pay the electricity bill tomorrow at 8 PM",
  "I spent 500 on groceries from Personal",
];

let messageIdCounter = 0;
function nextId(): string {
  messageIdCounter += 1;
  return `m${messageIdCounter}`;
}

type Props = BottomTabScreenProps<MainTabParamList, "AssistantTab">;

const VOICE_LANGUAGES = [
  { code: "en-US", label: "EN" },
  { code: "hi-IN", label: "हिं" },
];

export function AssistantScreen({ route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { user, updateUser } = useAuth();
  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [interactionId, setInteractionId] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<assistantApi.PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [voiceLang, setVoiceLang] = useState(VOICE_LANGUAGES[0].code);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { isListening, transcript, error: voiceError, start, stop, clearTranscript } = useVoiceInput();

  async function handleToggleSpeak() {
    if (!user) return;
    const next = !user.speakAssistantReplies;
    if (!next) stopSpeaking();
    updateUser({ ...user, speakAssistantReplies: next });
    try {
      const updated = await authApi.updateSettings({ speakAssistantReplies: next });
      updateUser(updated);
    } catch {
      updateUser({ ...user, speakAssistantReplies: !next });
    }
  }

  const appendMessage = useCallback((role: Message["role"], text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role, text }]);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      appendMessage("user", trimmed);
      setInput("");
      setSending(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const result = await assistantApi.sendAssistantMessage(trimmed, interactionId, controller.signal);
        appendMessage("assistant", result.reply);
        setInteractionId(result.interactionId);
        setPendingAction(result.pendingAction);
        if (user?.speakAssistantReplies) speak(result.speech);
      } catch (err) {
        if (!isRequestCanceled(err)) {
          appendMessage("assistant", getApiErrorMessage(err, "Sorry, I couldn't process that."));
        }
      } finally {
        abortControllerRef.current = null;
        setSending(false);
      }
    },
    [sending, interactionId, appendMessage, user?.speakAssistantReplies]
  );

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  useEffect(() => {
    if (!isListening && transcript.trim()) {
      const text = transcript.trim();
      clearTranscript();
      handleSend(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  useEffect(() => {
    if (route.params?.autoListen) {
      start(voiceLang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoListen]);

  async function handleConfirmation(confirmed: boolean) {
    if (!pendingAction || !interactionId) return;
    setConfirming(true);
    try {
      const result = await assistantApi.respondToConfirmation({
        interactionId,
        callId: pendingAction.callId,
        name: pendingAction.name,
        arguments: pendingAction.arguments,
        confirmed,
      });
      appendMessage("assistant", result.reply);
      setInteractionId(result.interactionId);
      setPendingAction(result.pendingAction);
      if (user?.speakAssistantReplies) speak(result.speech);
    } catch (err) {
      appendMessage("assistant", getApiErrorMessage(err, "Sorry, something went wrong with that."));
    } finally {
      setConfirming(false);
    }
  }

  function handleMicPress() {
    stopSpeaking();
    if (isListening) {
      stop();
    } else {
      start(voiceLang);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[typography.h1, { color: colors.text }]}>Assistant</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Ask about tasks or finances, or use a command.</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flexDirection: "row", borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: "hidden" }}>
              {VOICE_LANGUAGES.map((l) => (
                <Pressable
                  key={l.code}
                  onPress={() => setVoiceLang(l.code)}
                  style={[styles.langChip, { backgroundColor: voiceLang === l.code ? colors.primary : "transparent" }]}
                >
                  <Text style={{ color: voiceLang === l.code ? "#FFFFFF" : colors.textMuted, fontWeight: "600", fontSize: 12 }}>
                    {l.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={handleToggleSpeak} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons
                name={user?.speakAssistantReplies ? "volume-high" : "volume-mute"}
                size={22}
                color={user?.speakAssistantReplies ? colors.primary : colors.textFaint}
              />
            </Pressable>
          </View>
        </View>

        {messages.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.lg, flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.sm }]}>Try asking:</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => handleSend(s)}
                style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}
              >
                <Text style={[typography.body, { color: colors.text }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.md }}
            renderItem={({ item }) => <ChatBubble role={item.role} text={item.text} />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {pendingAction ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
            <Card>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                Confirmation needed
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Cancel" variant="secondary" onPress={() => handleConfirmation(false)} loading={confirming} style={{ flex: 1 }} />
                <Button label="Confirm" onPress={() => handleConfirmation(true)} loading={confirming} style={{ flex: 1 }} />
              </View>
            </Card>
          </View>
        ) : null}

        {isListening ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xs }}>
            <Text style={[typography.caption, { color: colors.primary }]}>
              Listening… {transcript}
            </Text>
          </View>
        ) : voiceError ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xs }}>
            <Text style={[typography.caption, { color: colors.danger }]}>{voiceError}</Text>
          </View>
        ) : null}

        <View style={[styles.inputRow, { padding: spacing.lg, borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleMicPress}
            style={[
              styles.micButton,
              { backgroundColor: isListening ? colors.dangerMuted : colors.primaryMuted, borderRadius: radius.pill },
            ]}
          >
            <Ionicons name={isListening ? "stop" : "mic"} size={20} color={isListening ? colors.danger : colors.primary} />
          </Pressable>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a message…"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text }]}
            onSubmitEditing={() => handleSend(input)}
            editable={!sending}
          />

          {sending ? (
            <Pressable
              onPress={handleStop}
              style={[styles.sendButton, { backgroundColor: colors.danger, borderRadius: radius.pill }]}
            >
              <Ionicons name="stop" size={18} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => handleSend(input)}
              disabled={!input.trim()}
              style={[styles.sendButton, { backgroundColor: colors.primary, borderRadius: radius.pill, opacity: input.trim() ? 1 : 0.5 }]}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  suggestion: { borderWidth: 1, padding: 12, marginBottom: 8 },
  langChip: { paddingHorizontal: 10, height: 28, alignItems: "center", justifyContent: "center" },
  inputRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  micButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, height: 44, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  sendButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
