import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import * as tasksApi from "../../api/tasks";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { OfflineBanner } from "../../components/OfflineBanner";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ErrorState, LoadingState } from "../../components/StateViews";
import { TaskListItem } from "../../components/TaskListItem";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { enqueueTaskComplete, enqueueTaskDelete, getPendingCount, isNetworkFailure } from "../../offline/offlineQueue";
import { getJson, setJson } from "../../offline/storage";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatRemaining, formatTimeLabel, todayIso } from "../../utils/date";
import type { FinancialSummary, Task, TaskCounts } from "../../types/models";
import type { HomeStackParamList, MainTabParamList } from "../../navigation/types";

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, "HomeMain">,
  BottomTabScreenProps<MainTabParamList>
>;

const DASHBOARD_CACHE_KEY = "dt_cache_home_dashboard";

interface DashboardCache {
  counts: TaskCounts;
  todaysTasks: Task[];
  reminders: Task[];
  summary: FinancialSummary;
  cachedAt: string;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { user } = useAuth();

  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [todaysTasks, setTodaysTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Task[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setPendingCount(await getPendingCount());
    try {
      const [taskCounts, todayList, upcomingReminders, financeSummary] = await Promise.all([
        tasksApi.getTaskCounts(),
        tasksApi.listTasks({ date: todayIso(), sort: "date_asc" }),
        tasksApi.getUpcomingReminders(),
        financeApi.getFinancialSummary(),
      ]);
      setCounts(taskCounts);
      setTodaysTasks(todayList);
      setReminders(upcomingReminders);
      setSummary(financeSummary);
      setOfflineCachedAt(null);
      await setJson(DASHBOARD_CACHE_KEY, {
        counts: taskCounts,
        todaysTasks: todayList,
        reminders: upcomingReminders,
        summary: financeSummary,
        cachedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await getJson<DashboardCache>(DASHBOARD_CACHE_KEY);
        if (cached) {
          setCounts(cached.counts);
          setTodaysTasks(cached.todaysTasks);
          setReminders(cached.reminders);
          setSummary(cached.summary);
          setOfflineCachedAt(cached.cachedAt);
        } else {
          setError("You're offline and no cached data is available yet.");
        }
      } else {
        setError(getApiErrorMessage(err, "Could not load your dashboard."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleToggleComplete(task: Task) {
    const nextCompleted = !task.completed;
    setTodaysTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
    try {
      await tasksApi.setTaskCompleted(task.id, nextCompleted);
      if (nextCompleted) {
        await cancelTaskReminder(task.reminder.localNotificationId);
        await tasksApi.setTaskNotificationId(task.id, null);
      }
      const taskCounts = await tasksApi.getTaskCounts();
      setCounts(taskCounts);
    } catch (err) {
      if (isNetworkFailure(err)) {
        if (nextCompleted) await cancelTaskReminder(task.reminder.localNotificationId);
        await enqueueTaskComplete(task.id, nextCompleted);
        setPendingCount(await getPendingCount());
        return;
      }
      setTodaysTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      Alert.alert("Couldn't update task", getApiErrorMessage(err));
    }
  }

  function handleDeleteTask(task: Task) {
    Alert.alert("Delete task", `Delete "${task.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelTaskReminder(task.reminder.localNotificationId);
            await tasksApi.deleteTask(task.id);
            setTodaysTasks((prev) => prev.filter((t) => t.id !== task.id));
            setReminders((prev) => prev.filter((t) => t.id !== task.id));
            const taskCounts = await tasksApi.getTaskCounts();
            setCounts(taskCounts);
          } catch (err) {
            if (isNetworkFailure(err)) {
              await enqueueTaskDelete(task.id);
              setTodaysTasks((prev) => prev.filter((t) => t.id !== task.id));
              setReminders((prev) => prev.filter((t) => t.id !== task.id));
              setPendingCount(await getPendingCount());
              return;
            }
            Alert.alert("Couldn't delete task", getApiErrorMessage(err));
          }
        },
      },
    ]);
  }

  function editTask(taskId: string) {
    navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId } });
  }

  if (loading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={{ flex: 1 }}>
    <ScreenContainer onRefresh={load} refreshing={false}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View>
          <Text style={[typography.h1, { color: colors.text }]}>{greeting()}</Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>{user?.mobileNumber}</Text>
        </View>
        <Pressable onPress={() => navigation.navigate("Search")} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="search" size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={{ marginBottom: spacing.lg }} />

      {offlineCachedAt || pendingCount > 0 ? (
        <OfflineBanner cachedAt={offlineCachedAt} pendingCount={pendingCount} />
      ) : null}

      <View style={[styles.summaryRow, { marginBottom: spacing.lg }]}>
        <Card style={[styles.summaryCard, { marginRight: spacing.sm }]}>
          <Text style={[typography.h2, { color: colors.text }]}>{counts?.pending ?? 0}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Pending tasks</Text>
        </Card>
        <Card style={[styles.summaryCard, { marginHorizontal: spacing.sm }]}>
          <Text style={[typography.h2, { color: colors.danger }]}>{counts?.overdue ?? 0}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Overdue</Text>
        </Card>
        <Card style={[styles.summaryCard, { marginLeft: spacing.sm }]}>
          <Text style={[typography.h2, { color: colors.success }]}>{counts?.completed ?? 0}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Completed</Text>
        </Card>
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>Finance summary</Text>
        <View style={styles.summaryRow}>
          <View>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Cash In</Text>
            <Text style={[typography.h3, { color: colors.success }]}>{formatCurrency(summary?.cashIn ?? 0)}</Text>
          </View>
          <View>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Cash Out</Text>
            <Text style={[typography.h3, { color: colors.danger }]}>{formatCurrency(summary?.cashOut ?? 0)}</Text>
          </View>
          <View>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Net</Text>
            <Text style={[typography.h3, { color: colors.text }]}>{formatCurrency(summary?.netFlow ?? 0)}</Text>
          </View>
        </View>
      </Card>

      <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>Quick actions</Text>
      <View style={[styles.quickActionsRow, { marginBottom: spacing.xl }]}>
        <QuickAction
          icon="add-circle-outline"
          label="Add Task"
          onPress={() => navigation.navigate("TasksTab", { screen: "TaskForm", params: undefined })}
        />
        <QuickAction
          icon="arrow-down-circle-outline"
          label="Add Income"
          onPress={() => navigation.navigate("FinanceTab", { screen: "TransactionForm", params: { type: "IN" } })}
        />
        <QuickAction
          icon="arrow-up-circle-outline"
          label="Add Expense"
          onPress={() => navigation.navigate("FinanceTab", { screen: "TransactionForm", params: { type: "OUT" } })}
        />
        <QuickAction
          icon="mic-outline"
          label="Voice Command"
          onPress={() => navigation.navigate("AssistantTab", { autoListen: true })}
        />
        <QuickAction
          icon="chatbubble-ellipses-outline"
          label="Ask AI"
          onPress={() => navigation.navigate("AssistantTab", undefined)}
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
        <Text style={[typography.h3, { color: colors.text }]}>Today's tasks</Text>
        <Pressable onPress={() => navigation.navigate("TasksTab", { screen: "TaskList", params: undefined })} hitSlop={8}>
          <Text style={[typography.captionStrong, { color: colors.primary }]}>View all</Text>
        </Pressable>
      </View>
      {todaysTasks.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.xl }]}>Nothing scheduled for today.</Text>
      ) : (
        <View style={{ marginBottom: spacing.xl }}>
          {todaysTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              onToggleComplete={() => handleToggleComplete(task)}
              onPress={() => editTask(task.id)}
              onDelete={() => handleDeleteTask(task)}
            />
          ))}
        </View>
      )}

      <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>Upcoming reminders</Text>
      {reminders.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.xl }]}>No upcoming reminders.</Text>
      ) : (
        <View style={{ marginBottom: spacing.xl }}>
          {reminders.map((task) => (
            <Pressable key={task.id} onPress={() => editTask(task.id)}>
              <Card style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{task.title}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{formatTimeLabel(task.time)}</Text>
                </View>
                {task.reminder.notifyAt ? (
                  <Badge label={formatRemaining(task.reminder.notifyAt)} tone="primary" />
                ) : null}
                <Pressable onPress={() => handleDeleteTask(task)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
                  <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                </Pressable>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>Recent transactions</Text>
      {!summary || summary.recentTransactions.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>No transactions yet.</Text>
      ) : (
        summary.recentTransactions.map((txn) => (
          <Card key={txn.id} style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{txn.category}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{formatTimeLabel(txn.time)}</Text>
            </View>
            <Text style={[typography.bodyStrong, { color: txn.type === "IN" ? colors.success : colors.danger }]}>
              {txn.type === "IN" ? "+" : "-"}
              {formatCurrency(txn.amount)}
            </Text>
          </Card>
        ))
      )}
    </ScreenContainer>
    <Pressable
      onPress={() => navigation.navigate("AssistantTab", undefined)}
      style={[styles.assistantFab, { backgroundColor: colors.primary, borderRadius: radius.pill }]}
    >
      <Ionicons name="sparkles" size={26} color="#FFFFFF" />
    </Pressable>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.quickAction}>
      <View
        style={[
          styles.quickActionIcon,
          { backgroundColor: colors.primaryMuted, borderRadius: radius.lg, marginBottom: spacing.xs },
        ]}
      >
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  assistantFab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryCard: { flex: 1, alignItems: "center" },
  quickActionsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", columnGap: 16, rowGap: 16 },
  quickAction: { alignItems: "center", width: 72 },
  quickActionIcon: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
});
