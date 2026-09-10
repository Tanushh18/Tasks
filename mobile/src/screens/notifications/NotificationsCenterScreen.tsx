import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as chatApi from "../../api/chat";
import * as tasksApi from "../../api/tasks";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState, LoadingState } from "../../components/StateViews";
import { listFailed } from "../../offline/offlineQueue";
import { useTheme } from "../../theme/useTheme";
import type { HomeStackParamList, MainTabParamList } from "../../navigation/types";
import { formatDateLabel, formatTimeLabel } from "../../utils/date";

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "NotificationsCenter">,
  BottomTabNavigationProp<MainTabParamList>
>;

type Props = NativeStackScreenProps<HomeStackParamList, "NotificationsCenter"> & { navigation: Nav };

type Category = "Tasks" | "Chat" | "System";

interface NotificationItem {
  id: string;
  category: Category;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tone: string;
  toneMuted: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
}

export function NotificationsCenterScreen({ navigation }: Props) {
  const { colors, spacing, typography, feature } = useTheme();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  const load = useCallback(async () => {
    const [overdueTasks, reminders, conversations, failedSyncs] = await Promise.all([
      tasksApi.listTasks({ status: "overdue" }).catch(() => []),
      tasksApi.getUpcomingReminders().catch(() => []),
      chatApi.listConversations().catch(() => []),
      listFailed().catch(() => []),
    ]);

    const result: NotificationItem[] = [];

    for (const task of overdueTasks) {
      result.push({
        id: `overdue-${task.id}`,
        category: "Tasks",
        icon: "alert-circle",
        tone: colors.danger,
        toneMuted: colors.dangerMuted,
        title: task.title,
        subtitle: `Overdue since ${formatDateLabel(task.date)} at ${formatTimeLabel(task.time)}`,
        onPress: () => navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId: task.id } }),
      });
    }

    for (const task of reminders) {
      // Overdue reminders are already covered above — don't say the same task twice.
      if (task.overdue) continue;
      result.push({
        id: `reminder-${task.id}`,
        category: "Tasks",
        icon: "notifications-outline",
        tone: feature.tasks.solid,
        toneMuted: feature.tasks.muted,
        title: task.title,
        subtitle: `Reminder: ${formatDateLabel(task.date)} at ${formatTimeLabel(task.time)}`,
        onPress: () => navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId: task.id } }),
      });
    }

    for (const conversation of conversations) {
      if (conversation.unreadCount === 0) continue;
      result.push({
        id: `chat-${conversation.userId}`,
        category: "Chat",
        icon: "chatbubble-ellipses",
        tone: feature.chat.solid,
        toneMuted: feature.chat.muted,
        title: conversation.name,
        subtitle: `${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? "" : "s"}: ${conversation.lastMessage}`,
        onPress: () =>
          navigation.navigate("FamilyTab", { screen: "ChatThread", params: { userId: conversation.userId, name: conversation.name } }),
      });
    }

    for (const failed of failedSyncs) {
      result.push({
        id: `sync-failed-${failed.item.id}`,
        category: "System",
        icon: "cloud-offline-outline",
        tone: colors.danger,
        toneMuted: colors.dangerMuted,
        title: "A change couldn't be synced",
        subtitle: failed.reason,
        onPress: () => navigation.navigate("MoreTab", { screen: "SyncCenter", params: undefined }),
      });
    }

    if (failedSyncs.length === 0 && result.length === 0) {
      result.push({
        id: "welcome",
        category: "System",
        icon: "home-outline",
        tone: feature.tasks.solid,
        toneMuted: feature.tasks.muted,
        title: "Welcome to We Three",
        subtitle: "You're all caught up — notifications about tasks, chat and syncing will show up here.",
      });
    }

    setItems(result);
  }, [colors, feature, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const categories: Category[] = ["Tasks", "Chat", "System"];

  return (
    <ScreenContainer onRefresh={load} refreshing={false} edges={["left", "right"]}>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.xl }]}>
        Notifications
      </Text>

      {items === null ? (
        <LoadingState label="Loading notifications…" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="notifications-off-outline"
            title="Nothing to show"
            subtitle="You're all caught up."
          />
        </Card>
      ) : (
        categories.map((category) => {
          const categoryItems = items.filter((item) => item.category === category);
          if (categoryItems.length === 0) return null;
          return (
            <View key={category} style={{ marginBottom: spacing.xl }}>
              <SectionHeader title={category} subtitle={`${categoryItems.length}`} />
              {categoryItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={item.onPress}
                  disabled={!item.onPress}
                  accessibilityRole={item.onPress ? "button" : undefined}
                  accessibilityLabel={item.onPress ? `${item.title}. ${item.subtitle}` : undefined}
                  style={({ pressed }) => [{ opacity: pressed && item.onPress ? 0.85 : 1, marginBottom: spacing.sm }]}
                >
                  <Card>
                    <View style={styles.row}>
                      <View
                        style={[styles.icon, { backgroundColor: item.toneMuted, borderRadius: 20 }]}
                        accessibilityElementsHidden
                      >
                        <Ionicons name={item.icon} size={18} color={item.tone} />
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                          {item.subtitle}
                        </Text>
                      </View>
                      {item.onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
