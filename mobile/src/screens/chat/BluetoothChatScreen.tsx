import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { ChatBubble } from "../../components/ChatBubble";
import { Badge } from "../../components/Badge";
import { useTheme } from "../../theme/useTheme";
import { bluetoothMeshService, MeshStatus } from "../../bluetoothMesh/BluetoothMeshService";
import { getBroadcastMessages, useMesh } from "../../bluetoothMesh/useMesh";

function statusLabel(status: MeshStatus): string {
  switch (status) {
    case "running":
      return "Mesh active";
    case "starting":
      return "Starting…";
    case "bluetooth-off":
      return "Turn on Bluetooth";
    case "permission-denied":
      return "Bluetooth permission needed";
    case "unsupported":
      return "Not supported on this device";
    default:
      return "Off";
  }
}

/**
 * Group chat that never touches Wi-Fi, mobile data, or the internet — every
 * message travels phone-to-phone over Bluetooth (BLE), hopping through
 * nearby devices to reach people out of direct range. Works fully offline
 * for a group of family/friends in the same building or event.
 */
export function BluetoothChatScreen() {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const { user } = useAuth();
  const { status, peers, myDeviceId, messagesVersion } = useMesh();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const messages = useMemo(() => getBroadcastMessages(), [messagesVersion]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setSending(true);
    try {
      await bluetoothMeshService.broadcast(text);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } finally {
      setSending(false);
    }
  }, [draft]);

  const isReady = status === "running";

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["left", "right", "bottom"]}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm }]}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isReady ? colors.success : colors.textFaint },
            ]}
          />
          <Text style={[typography.caption, { color: colors.textMuted, marginLeft: 6 }]}>{statusLabel(status)}</Text>
          <View style={{ marginLeft: spacing.sm }}>
            <Badge label={`${peers.length} nearby`} tone="neutral" />
          </View>
        </View>
        <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}>
          No internet, Wi-Fi or mobile signal used — messages hop over Bluetooth between nearby phones.
        </Text>
      </View>

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
            <View style={{ marginBottom: 4 }}>
              {item.fromDeviceId !== myDeviceId ? (
                <Text style={[typography.caption, { color: colors.textFaint, marginLeft: 4 }]}>{item.fromName}</Text>
              ) : null}
              <ChatBubble role={item.fromDeviceId === myDeviceId ? "user" : "assistant"} text={item.text} />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <Text style={[typography.body, { color: colors.textMuted, textAlign: "center" }]}>
                {isReady
                  ? "No messages yet. Anyone nearby with the app open will get this the moment your phones connect."
                  : "Enable Bluetooth to start chatting offline."}
              </Text>
            </View>
          }
        />

        {peers.length > 0 ? (
          <View style={[styles.peerStrip, { borderTopColor: colors.border, paddingHorizontal: spacing.lg }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
              Nearby: {peers.map((p) => p.name).join(", ")}
            </Text>
          </View>
        ) : null}

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
            placeholder="Message everyone nearby"
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
            onPress={send}
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
  header: { gap: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  emptyCenter: { alignItems: "center", justifyContent: "center", paddingTop: 48, paddingHorizontal: 24 },
  peerStrip: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, paddingHorizontal: 14, fontSize: 16 },
  sendButton: { alignItems: "center", justifyContent: "center" },
});
