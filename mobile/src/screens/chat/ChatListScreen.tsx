import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as chatApi from "../../api/chat";
import { getApiErrorMessage } from "../../api/client";
import type { UserSearchResult } from "../../api/users";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { FamilyAvatar } from "../../components/FamilyAvatar";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { UserPicker } from "../../components/UserPicker";
import type { ChatStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<ChatStackParamList, "ChatList">;

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function ChatListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow, feature } = useTheme();

  const [conversations, setConversations] = useState<chatApi.Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [newChatUser, setNewChatUser] = useState<UserSearchResult | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConversations(await chatApi.listConversations());
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your chats."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  function openThread(userId: string, name: string) {
    navigation.navigate("ChatThread", { userId, name });
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={styles.titleRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to Family"
            hitSlop={8}
            style={{ marginRight: spacing.sm }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
            Chat
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("BluetoothChat")}
          accessibilityRole="button"
          accessibilityLabel="Bluetooth chat, works fully offline"
          style={({ pressed }) => [
            styles.bluetoothButton,
            { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="bluetooth" size={16} color={colors.primary} />
          <Text style={[typography.captionStrong, { color: colors.primary, marginLeft: 4 }]}>Offline chat</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={5} />
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openThread(item.userId, item.name)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.row}>
                  <View style={{ marginRight: spacing.sm }}>
                    <FamilyAvatar name={item.name} size={40} />
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.rowBetween}>
                      <Text style={[typography.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                      {item.unreadCount > 0 ? <Badge label={String(item.unreadCount)} tone="primary" /> : null}
                    </View>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                      {item.lastMessage}
                    </Text>
                  </View>
                  {item.lastMessageAt ? (
                    <Text style={[typography.caption, { color: colors.textFaint, marginLeft: spacing.sm }]}>
                      {formatRelativeTime(item.lastMessageAt)}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No chats yet"
              subtitle="Start a conversation with someone."
              icon="chatbubbles-outline"
              tone={feature.chat.solid}
              toneMuted={feature.chat.muted}
              actionLabel="New chat"
              onAction={() => setNewChatVisible(true)}
            />
          }
        />
      )}

      <Pressable
        onPress={() => setNewChatVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: colors.primary,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>New chat</Text>
      </Pressable>

      <Modal
        visible={newChatVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewChatVisible(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setNewChatVisible(false)}
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
              <Text accessibilityRole="header" style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>
                New chat
              </Text>
              <View style={{ marginBottom: spacing.lg }}>
                <UserPicker mode="single" value={newChatUser} onChange={setNewChatUser} placeholder="Search people by name" />
              </View>
              <Button
                label="Start chat"
                size="large"
                disabled={!newChatUser}
                onPress={() => {
                  if (!newChatUser) return;
                  setNewChatVisible(false);
                  const user = newChatUser;
                  setNewChatUser(null);
                  openThread(user.id, user.name);
                }}
              />
              <Button label="Cancel" variant="ghost" onPress={() => setNewChatVisible(false)} style={{ marginTop: spacing.sm }} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  bluetoothButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { width: "100%" },
});
