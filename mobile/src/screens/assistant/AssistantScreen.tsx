import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import type { MainTabParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { onSpeakingChange, speak, stopSpeaking } from "../../voice/tts";
import { openDeviceSettings, useVoiceInput } from "../../voice/useVoiceInput";
import { isMicrophoneActive, statusLabel } from "../../voice/voiceState";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** Phrased the way someone would actually speak, not as feature names. */
const SUGGESTIONS = [
  "Add a task",
  "Remind me to call the doctor tomorrow at 10",
  "Show today's tasks",
  "How much did I spend this month?",
  "I spent 450 on groceries",
  "Show my balance",
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
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();
  const { user, updateUser } = useAuth();
  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [interactionId, setInteractionId] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<assistantApi.PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [voiceLang, setVoiceLang] = useState(VOICE_LANGUAGES[0].code);
  const [speaking, setSpeaking] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const voice = useVoiceInput();
  const { state: voiceStatus, markInterpreting, markNeedsConfirmation, markSucceeded, markFailed, reset } = voice;

  // Mirrors the speech engine so the Stop control only appears while something is audible.
  useEffect(() => onSpeakingChange(setSpeaking), []);

  // Nothing should still be talking after leaving the screen.
  useEffect(() => () => stopSpeaking(), []);

  const appendMessage = useCallback((role: Message["role"], text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role, text }]);
  }, []);

  async function handleToggleSpeak() {
    if (!user) return;
    const next = !user.speakAssistantReplies;
    if (!next) stopSpeaking();
    updateUser({ ...user, speakAssistantReplies: next });
    try {
      updateUser(await authApi.updateSettings({ speakAssistantReplies: next }));
    } catch {
      updateUser({ ...user, speakAssistantReplies: !next });
    }
  }

  const handleSend = useCallback(
    async (text: string, fromVoice = false) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      // A new request always silences the previous answer (spec §28).
      stopSpeaking();
      appendMessage("user", trimmed);
      setInput("");
      setSending(true);
      if (fromVoice) markInterpreting();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const result = await assistantApi.sendAssistantMessage(trimmed, interactionId, controller.signal);
        appendMessage("assistant", result.reply);
        setInteractionId(result.interactionId);
        setPendingAction(result.pendingAction);

        if (fromVoice) {
          if (result.pendingAction) markNeedsConfirmation();
          else markSucceeded(result.speech || result.reply);
        }
        if (user?.speakAssistantReplies) speak(result.speech);
      } catch (err) {
        if (!isRequestCanceled(err)) {
          const message = getApiErrorMessage(err, "I couldn't do that just now. Please try again.");
          appendMessage("assistant", message);
          if (fromVoice) markFailed(message);
        } else if (fromVoice) {
          reset();
        }
      } finally {
        abortControllerRef.current = null;
        setSending(false);
      }
    },
    [
      sending,
      interactionId,
      appendMessage,
      user?.speakAssistantReplies,
      markInterpreting,
      markNeedsConfirmation,
      markSucceeded,
      markFailed,
      reset,
    ]
  );

  // A finished transcript is sent once, and only when it actually said something — the state
  // machine has already rejected phrases that stopped halfway.
  const sentTranscriptRef = useRef<string | null>(null);
  useEffect(() => {
    if (voiceStatus.status !== "processing") return;
    const text = voiceStatus.transcript.trim();
    if (!text || sentTranscriptRef.current === text) return;
    sentTranscriptRef.current = text;
    void handleSend(text, true);
  }, [voiceStatus.status, voiceStatus.transcript, handleSend]);

  useEffect(() => {
    if (voiceStatus.status === "idle") sentTranscriptRef.current = null;
  }, [voiceStatus.status]);

  useEffect(() => {
    if (route.params?.autoListen) void voice.start(voiceLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoListen]);

  async function handleConfirmation(confirmed: boolean) {
    if (!pendingAction || !interactionId) return;
    setConfirming(true);
    stopSpeaking();
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
      markSucceeded(result.speech || result.reply);
      if (user?.speakAssistantReplies) speak(result.speech);
    } catch (err) {
      const message = getApiErrorMessage(err, "That wasn't saved. Nothing was changed.");
      appendMessage("assistant", message);
      markFailed(message);
    } finally {
      setConfirming(false);
    }
  }

  function handleMicPress() {
    stopSpeaking();
    if (isMicrophoneActive(voiceStatus.status)) voice.finish();
    else void voice.start(voiceLang);
  }

  const listening = isMicrophoneActive(voiceStatus.status);
  const showVoicePanel = voiceStatus.status !== "idle" && voiceStatus.status !== "cancelled";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
              How can I help?
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              You can type or just speak.
            </Text>
          </View>

          <View style={[styles.headerControls, { gap: spacing.sm }]}>
            <View style={[styles.langGroup, { borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }]}>
              {VOICE_LANGUAGES.map((lang) => {
                const active = voiceLang === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => setVoiceLang(lang.code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={lang.code === "en-US" ? "Speak in English" : "Speak in Hindi"}
                    style={[styles.langChip, { backgroundColor: active ? colors.primary : "transparent" }]}
                  >
                    <Text
                      style={[
                        typography.captionStrong,
                        { color: active ? colors.onPrimary : colors.textMuted, fontSize: 12 },
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleToggleSpeak}
              accessibilityRole="switch"
              accessibilityState={{ checked: Boolean(user?.speakAssistantReplies) }}
              accessibilityLabel="Speak replies out loud"
              hitSlop={8}
              style={{ minWidth: touchTarget.min, minHeight: touchTarget.min, alignItems: "center", justifyContent: "center" }}
            >
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
            <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
              Try saying
            </Text>
            {SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => handleSend(suggestion)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.suggestion,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    minHeight: touchTarget.comfortable,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[typography.body, { color: colors.text }]}>{suggestion}</Text>
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

        {/* Voice panel — one place that always says what the microphone is doing. */}
        {showVoicePanel ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
            <Card>
              <View style={styles.rowCentered}>
                {listening ? (
                  <View
                    style={[
                      styles.pulse,
                      { backgroundColor: colors.dangerMuted, borderRadius: radius.pill, marginRight: spacing.md },
                    ]}
                  >
                    <Ionicons name="mic" size={20} color={colors.danger} />
                  </View>
                ) : null}
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]}>
                  {statusLabel(voiceStatus)}
                </Text>
                {voiceStatus.status === "interpreting" || voiceStatus.status === "executing" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : null}
              </View>

              {voiceStatus.transcript ? (
                <Text
                  style={[
                    typography.body,
                    {
                      color: voiceStatus.partial ? colors.textMuted : colors.text,
                      fontStyle: voiceStatus.partial ? "italic" : "normal",
                      marginTop: spacing.sm,
                    },
                  ]}
                >
                  {voiceStatus.transcript}
                </Text>
              ) : null}

              {listening ? (
                <View style={[styles.buttonRow, { marginTop: spacing.lg, gap: spacing.sm }]}>
                  <Button label="Done" onPress={voice.finish} style={styles.flex} />
                  <Button label="Cancel" variant="secondary" onPress={voice.cancel} style={styles.flex} />
                </View>
              ) : null}

              {voiceStatus.status === "permission_denied" ? (
                <View style={[styles.buttonRow, { marginTop: spacing.lg, gap: spacing.sm }]}>
                  <Button label="Open Settings" onPress={openDeviceSettings} style={styles.flex} />
                  <Button label="Type instead" variant="secondary" onPress={reset} style={styles.flex} />
                </View>
              ) : null}

              {voiceStatus.status === "error" ? (
                <View style={[styles.buttonRow, { marginTop: spacing.lg, gap: spacing.sm }]}>
                  <Button label="Try again" onPress={() => void voice.start(voiceLang)} style={styles.flex} />
                  <Button label="Type instead" variant="secondary" onPress={reset} style={styles.flex} />
                </View>
              ) : null}

              {voiceStatus.status === "unsupported" ? (
                <Button label="Type instead" variant="secondary" onPress={reset} style={{ marginTop: spacing.lg }} />
              ) : null}

              {voiceStatus.status === "success" ? (
                <Button label="Done" variant="ghost" onPress={reset} style={{ marginTop: spacing.sm }} />
              ) : null}
            </Card>
          </View>
        ) : null}

        {pendingAction ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
            <Card style={{ borderColor: colors.primary }}>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.md }]}>
                Just checking before I save this
              </Text>
              <View style={[styles.buttonRow, { gap: spacing.sm }]}>
                <Button
                  label="Confirm"
                  onPress={() => handleConfirmation(true)}
                  loading={confirming}
                  style={styles.flex}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => handleConfirmation(false)}
                  disabled={confirming}
                  style={styles.flex}
                />
              </View>
            </Card>
          </View>
        ) : null}

        {speaking ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
            <Button label="Stop speaking" variant="secondary" onPress={stopSpeaking} />
          </View>
        ) : null}

        <View style={[styles.inputRow, { padding: spacing.lg, borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleMicPress}
            accessibilityRole="button"
            accessibilityLabel={listening ? "Stop listening" : "Speak your request"}
            style={[
              styles.micButton,
              shadow.card,
              {
                backgroundColor: listening ? colors.danger : colors.primary,
                borderRadius: radius.pill,
                width: touchTarget.large,
                height: touchTarget.large,
              },
            ]}
          >
            <Ionicons name={listening ? "stop" : "mic"} size={24} color={colors.onPrimary} />
          </Pressable>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type what you need…"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Message the assistant"
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.md,
                color: colors.text,
                minHeight: touchTarget.comfortable,
              },
            ]}
            onSubmitEditing={() => handleSend(input)}
            editable={!sending}
          />

          <Pressable
            onPress={sending ? () => abortControllerRef.current?.abort() : () => handleSend(input)}
            disabled={!sending && !input.trim()}
            accessibilityRole="button"
            accessibilityLabel={sending ? "Stop" : "Send"}
            style={[
              styles.sendButton,
              {
                backgroundColor: sending ? colors.danger : colors.primary,
                borderRadius: radius.pill,
                width: touchTarget.comfortable,
                height: touchTarget.comfortable,
                opacity: sending || input.trim() ? 1 : 0.5,
              },
            ]}
          >
            <Ionicons name={sending ? "stop" : "send"} size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerControls: { flexDirection: "row", alignItems: "center" },
  langGroup: { flexDirection: "row", overflow: "hidden" },
  langChip: { paddingHorizontal: 12, height: 32, alignItems: "center", justifyContent: "center" },
  suggestion: { borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 8, justifyContent: "center" },
  rowCentered: { flexDirection: "row", alignItems: "center" },
  buttonRow: { flexDirection: "row" },
  pulse: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inputRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  micButton: { alignItems: "center", justifyContent: "center" },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  sendButton: { alignItems: "center", justifyContent: "center" },
});
