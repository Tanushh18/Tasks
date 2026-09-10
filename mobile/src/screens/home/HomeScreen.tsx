import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as activityFeedApi from "../../api/activityFeed";
import * as chatApi from "../../api/chat";
import * as financeApi from "../../api/finance";
import * as tasksApi from "../../api/tasks";
import { useAuth } from "../../auth/AuthContext";
import { AppHeader } from "../../components/AppHeader";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { QuickActions, type QuickAction } from "../../components/QuickActions";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard, SkeletonLines } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { SyncBanner } from "../../components/SyncIndicator";
import { buildTimeline, TodayTimeline, type TimelineEntry } from "../../components/TodayTimeline";
import { useFeatureFlags } from "../../features/FeatureFlagsContext";
import { getWidgetPrefs, WIDGET_DEFINITIONS, type WidgetId, type WidgetPrefs } from "../../home/widgets";
import type { HomeStackParamList, MainTabParamList } from "../../navigation/types";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { enqueueTaskComplete, enqueueTaskDelete, getFailedCount, isNetworkFailure } from "../../offline/offlineQueue";
import { scopedKey } from "../../offline/scope";
import { getJson, setJson } from "../../offline/storage";
import { useTheme } from "../../theme/useTheme";
import type { FinancialSummary, Task, TaskCounts, Transaction } from "../../types/models";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, formatTimeLabel, todayIso } from "../../utils/date";

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, "HomeMain">,
  BottomTabScreenProps<MainTabParamList>
>;

/** Namespaced per user (see offline/scope.ts) — this cache holds task counts and spending totals,
 * which must never be shown to a different account that signs in on the same device. */
const DASHBOARD_CACHE_KEY_BASE = "dt_cache_home_dashboard";

const REMINDER_PREVIEW_LIMIT = 3;

interface DashboardCache {
  counts: TaskCounts;
  todaysTasks: Task[];
  reminders: Task[];
  summary: FinancialSummary;
  todaysTransactions: Transaction[];
  cachedAt: string;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Tomorrow at 8:00 AM" — a reminder read the way someone would say it. */
function reminderWhen(task: Task): string {
  return `${formatDateLabel(task.date)} at ${formatTimeLabel(task.time)}`;
}

export function HomeScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow, feature } = useTheme();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();

  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [todaysTasks, setTodaysTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Task[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [todaysTransactions, setTodaysTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [widgetPrefs, setWidgetPrefsState] = useState<WidgetPrefs | null>(null);
  const [activity, setActivity] = useState<activityFeedApi.ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  /** Rough count for the bell badge — the Notifications Centre computes the same signals in
   * full; this only needs a number, not the aggregated list itself. */
  const loadNotificationCount = useCallback(async () => {
    try {
      const [overdueTasks, conversations, failedSyncCount] = await Promise.all([
        tasksApi.listTasks({ status: "overdue" }),
        chatApi.listConversations(),
        getFailedCount(),
      ]);
      const unreadChats = conversations.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0);
      setNotificationCount(overdueTasks.length + unreadChats + failedSyncCount);
    } catch {
      // Best-effort badge — a failed count fetch shouldn't disrupt the rest of the dashboard.
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const today = todayIso();
      const [taskCounts, todayList, upcomingReminders, financeSummary, todayTx] = await Promise.all([
        tasksApi.getTaskCounts(),
        tasksApi.listTasks({ date: today, sort: "date_asc" }),
        tasksApi.getUpcomingReminders(),
        financeApi.getFinancialSummary(),
        financeApi.listTransactions({ from: today, to: today }),
      ]);
      setCounts(taskCounts);
      setTodaysTasks(todayList);
      setReminders(upcomingReminders);
      setSummary(financeSummary);
      setTodaysTransactions(todayTx);
      const cacheKey = scopedKey(DASHBOARD_CACHE_KEY_BASE);
      if (cacheKey) {
        await setJson(cacheKey, {
          counts: taskCounts,
          todaysTasks: todayList,
          reminders: upcomingReminders,
          summary: financeSummary,
          todaysTransactions: todayTx,
          cachedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cacheKey = scopedKey(DASHBOARD_CACHE_KEY_BASE);
        const cached = cacheKey ? await getJson<DashboardCache>(cacheKey) : null;
        if (cached) {
          setCounts(cached.counts);
          setTodaysTasks(cached.todaysTasks);
          setReminders(cached.reminders);
          setSummary(cached.summary);
          setTodaysTransactions(cached.todaysTransactions ?? []);
        } else {
          setError("You're offline and we don't have saved information for this screen yet.");
        }
      } else {
        setError(getApiErrorMessage(err, "We couldn't load your information."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      setActivity(await activityFeedApi.getActivityFeed());
    } catch {
      // Non-critical dashboard content — a failed fetch just leaves the section empty.
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadNotificationCount();
      loadActivity();
      getWidgetPrefs().then(setWidgetPrefsState);
    }, [load, loadNotificationCount, loadActivity])
  );

  const editTask = useCallback(
    (taskId: string) => navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId } }),
    [navigation]
  );

  /** Tasks and money for today, interleaved into the one column the brief asks for. */
  const timeline = useMemo<TimelineEntry[]>(() => {
    const taskEntries: TimelineEntry[] = todaysTasks.map((task) => ({
      id: `task-${task.id}`,
      kind: task.reminder?.enabled ? "reminder" : "task",
      time: task.time,
      title: task.title,
      detail: task.category,
      done: task.completed,
      onPress: () => editTask(task.id),
    }));

    const moneyEntries: TimelineEntry[] = todaysTransactions.map((tx) => ({
      id: `tx-${tx.id}`,
      kind: tx.type === "IN" ? "income" : "expense",
      time: tx.time,
      title: tx.description || tx.category,
      detail: tx.category,
      amount: formatCurrency(tx.amount),
      onPress: () =>
        navigation.navigate("FinanceTab", { screen: "TransactionForm", params: { transactionId: tx.id } }),
    }));

    return buildTimeline([...taskEntries, ...moneyEntries]);
  }, [todaysTasks, todaysTransactions, editTask, navigation]);

  const remainingToday = useMemo(() => todaysTasks.filter((task) => !task.completed).length, [todaysTasks]);

  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [
      {
        key: "add-task",
        label: "Add Task",
        icon: "add-circle",
        tone: feature.tasks.solid,
        toneMuted: feature.tasks.muted,
        onPress: () => navigation.navigate("TasksTab", { screen: "TaskForm", params: undefined }),
      },
      {
        key: "add-expense",
        label: "Add Expense",
        icon: "wallet",
        tone: feature.finance.solid,
        toneMuted: feature.finance.muted,
        onPress: () => navigation.navigate("FinanceTab", { screen: "TransactionForm", params: { type: "OUT" } }),
      },
    ];

    if (flags.ocr) {
      actions.push({
        key: "scan",
        label: "Scan Receipt",
        icon: "camera",
        tone: feature.finance.solid,
        toneMuted: feature.finance.muted,
        onPress: () => navigation.navigate("FinanceTab", { screen: "TransactionForm", params: { type: "OUT" } }),
      });
    }
    if (flags.notes) {
      actions.push({
        key: "add-note",
        label: "Add Note",
        icon: "document-text",
        tone: feature.notes.solid,
        toneMuted: feature.notes.muted,
        onPress: () => navigation.navigate("MoreTab", { screen: "Notes", params: { screen: "NoteForm" } }),
      });
    }
    if (flags.chat) {
      actions.push({
        key: "message",
        label: "Message Family",
        icon: "chatbubbles",
        tone: feature.chat.solid,
        toneMuted: feature.chat.muted,
        onPress: () => navigation.navigate("FamilyTab", { screen: "ChatList" }),
      });
    }
    if (flags.location) {
      actions.push({
        key: "location",
        label: "Share Location",
        icon: "location",
        tone: feature.location.solid,
        toneMuted: feature.location.muted,
        onPress: () => navigation.navigate("FamilyTab", { screen: "LocationSharing" }),
      });
    }

    return actions;
  }, [flags, feature, navigation]);

  const handleToggleComplete = useCallback(async (task: Task) => {
    const nextCompleted = !task.completed;
    setTodaysTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
    try {
      await tasksApi.setTaskCompleted(task.id, nextCompleted);
      if (nextCompleted) {
        await cancelTaskReminder(task.reminder.localNotificationId);
        await tasksApi.setTaskNotificationId(task.id, null);
      }
      setCounts(await tasksApi.getTaskCounts());
    } catch (err) {
      if (isNetworkFailure(err)) {
        if (nextCompleted) await cancelTaskReminder(task.reminder.localNotificationId);
        await enqueueTaskComplete(task.id, nextCompleted);
        return;
      }
      setTodaysTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      Alert.alert("We couldn't update that task", getApiErrorMessage(err));
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    const task = taskPendingDelete;
    if (!task) return;
    setDeleting(true);
    try {
      await cancelTaskReminder(task.reminder.localNotificationId);
      await tasksApi.deleteTask(task.id);
      setTodaysTasks((prev) => prev.filter((t) => t.id !== task.id));
      setReminders((prev) => prev.filter((t) => t.id !== task.id));
      setCounts(await tasksApi.getTaskCounts());
      setTaskPendingDelete(null);
    } catch (err) {
      if (isNetworkFailure(err)) {
        await enqueueTaskDelete(task.id);
        setTodaysTasks((prev) => prev.filter((t) => t.id !== task.id));
        setReminders((prev) => prev.filter((t) => t.id !== task.id));
        setTaskPendingDelete(null);
        return;
      }
      Alert.alert("We couldn't delete that task", getApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [taskPendingDelete]);

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  const overdueCount = counts?.overdue ?? 0;

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "today":
        return (
          <View style={{ marginTop: spacing.xl }} key={id}>
            <SectionHeader
              title="Today"
              subtitle={
                todaysTasks.length === 0 && todaysTransactions.length === 0
                  ? "Nothing yet"
                  : `${remainingToday} task${remainingToday === 1 ? "" : "s"} left${todaysTransactions.length > 0 ? ` · ${todaysTransactions.length} money entr${todaysTransactions.length === 1 ? "y" : "ies"}` : ""}`
              }
              actionLabel={todaysTasks.length > 0 ? "All tasks" : undefined}
              onActionPress={() => navigation.navigate("TasksTab", { screen: "TaskList", params: undefined })}
            />
            {loading ? (
              <SkeletonLines count={5} />
            ) : timeline.length === 0 ? (
              <Card>
                <EmptyState
                  icon="sunny-outline"
                  tone={feature.tasks.solid}
                  toneMuted={feature.tasks.muted}
                  title="Nothing planned yet"
                  subtitle="Add something your family needs to remember."
                  actionLabel="Add Task"
                  onAction={() => navigation.navigate("TasksTab", { screen: "TaskForm", params: undefined })}
                />
              </Card>
            ) : (
              <Card>
                <TodayTimeline entries={timeline} />
              </Card>
            )}
          </View>
        );

      case "money":
        return (
          <View style={{ marginTop: spacing.xl }} key={id}>
            <SectionHeader
              title="Money this month"
              actionLabel="Open"
              onActionPress={() => navigation.navigate("FinanceTab", { screen: "AccountsList", params: undefined })}
            />
            <View style={[styles.statRow, { gap: spacing.md }]}>
              <StatCard
                label="Money in"
                value={summary ? formatCurrency(summary.cashIn) : undefined}
                icon="arrow-down-circle"
                tone={colors.success}
                toneMuted={colors.successMuted}
                style={styles.flex}
              />
              <StatCard
                label="Money out"
                value={summary ? formatCurrency(summary.cashOut) : undefined}
                icon="arrow-up-circle"
                tone={colors.danger}
                toneMuted={colors.dangerMuted}
                style={styles.flex}
              />
            </View>
            <StatCard
              label="Net"
              value={summary ? formatCurrency(summary.netFlow) : undefined}
              detail="Money in minus money out, this month"
              icon="wallet"
              tone={feature.finance.solid}
              toneMuted={feature.finance.muted}
              style={{ marginTop: spacing.md }}
              onPress={() => navigation.navigate("FinanceTab", { screen: "Insights", params: undefined })}
            />
          </View>
        );

      case "comingUp":
        return (
          <View style={{ marginTop: spacing.xl }} key={id}>
            <SectionHeader title="Coming up" />
            {loading ? (
              <SkeletonCard lines={1} />
            ) : reminders.length === 0 ? (
              <Card>
                <EmptyState
                  icon="notifications-outline"
                  tone={feature.tasks.solid}
                  toneMuted={feature.tasks.muted}
                  title="No reminders set"
                  subtitle="You'll see upcoming reminders here."
                />
              </Card>
            ) : (
              reminders.slice(0, REMINDER_PREVIEW_LIMIT).map((task) => (
                <Pressable
                  key={task.id}
                  onPress={() => editTask(task.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${task.title}, ${reminderWhen(task)}`}
                  style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, marginBottom: spacing.sm }]}
                >
                  <Card style={{ minHeight: touchTarget.large }}>
                    <View style={styles.rowCentered}>
                      <View style={[styles.reminderIcon, { backgroundColor: feature.tasks.muted, borderRadius: radius.md }]}>
                        <Ionicons name="notifications" size={20} color={feature.tasks.solid} />
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {task.title}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                          {reminderWhen(task)}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              ))
            )}
          </View>
        );

      case "activity":
        return (
          <View style={{ marginTop: spacing.xl }} key={id}>
            <SectionHeader title="Family activity" subtitle="Not a feed to scroll for fun — just what changed." />
            {activityLoading ? (
              <SkeletonLines count={3} />
            ) : activity.length === 0 ? (
              <Card>
                <EmptyState
                  icon="pulse-outline"
                  tone={feature.contacts.solid}
                  toneMuted={feature.contacts.muted}
                  title="Nothing yet"
                  subtitle="Tasks, expenses and contacts your family adds will show up here."
                />
              </Card>
            ) : (
              <Card>
                {activity.slice(0, 6).map((entry, index) => (
                  <View
                    key={entry.id}
                    style={{
                      paddingVertical: spacing.sm,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={[typography.body, { color: colors.text }]}>
                      <Text style={typography.bodyStrong}>{entry.actorName}</Text> {entry.text}
                      {entry.amount ? ` (${formatCurrency(entry.amount)})` : ""}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        );

      default:
        return null;
    }
  }

  const widgetOrder = widgetPrefs
    ? widgetPrefs.order.filter((id) => !widgetPrefs.hidden.includes(id))
    : WIDGET_DEFINITIONS.map((w) => w.id);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "left", "right"]}>
      <AppHeader
        title={`${greeting()}${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        subtitle="Here's what's happening today"
        actions={[
          {
            icon: "notifications-outline",
            label: "Notifications",
            badgeCount: notificationCount,
            onPress: () => navigation.navigate("NotificationsCenter"),
          },
          {
            icon: "search",
            label: "Search your tasks and money",
            onPress: () => navigation.navigate("Search"),
          },
          {
            icon: "options-outline",
            label: "Customize Home",
            onPress: () => navigation.navigate("CustomizeHome"),
          },
        ]}
      />

      <ScreenContainer onRefresh={load} refreshing={false} edges={["left", "right"]}>
        <SyncBanner />

        {/* Anything that slipped. Stated as a fact with a way to act, never as a scolding. */}
        {overdueCount > 0 ? (
          <Pressable
            onPress={() => navigation.navigate("TasksTab", { screen: "TaskList", params: undefined })}
            accessibilityRole="button"
            accessibilityLabel={`Needs attention. ${overdueCount} ${overdueCount === 1 ? "task is" : "tasks are"} overdue. Opens your tasks.`}
            style={({ pressed }) => [{ marginBottom: spacing.lg, opacity: pressed ? 0.85 : 1 }]}
          >
            <Card style={{ backgroundColor: colors.warningMuted, borderColor: colors.warning }}>
              <View style={styles.rowCentered}>
                <Ionicons name="alert-circle" size={24} color={colors.warning} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>Needs attention</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {overdueCount} {overdueCount === 1 ? "task is" : "tasks are"} past their time
                  </Text>
                </View>
                <Text style={[typography.captionStrong, { color: colors.primary }]}>View</Text>
              </View>
            </Card>
          </Pressable>
        ) : null}

        {/* Quick actions sit above the fold — these are what people open the app for. */}
        <QuickActions actions={quickActions} />

        {/* Everything below is reorderable/hideable from Customize Home. */}
        {widgetOrder.map((id) => renderWidget(id))}
      </ScreenContainer>

      {flags.assistant ? (
        <Pressable
          onPress={() => navigation.navigate("MoreTab", { screen: "Assistant", params: { autoListen: true } })}
          accessibilityRole="button"
          accessibilityLabel="Speak to your assistant"
          accessibilityHint="Opens the assistant and starts listening"
          style={({ pressed }) => [
            styles.assistantFab,
            shadow.raised,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.pill,
              width: touchTarget.large,
              height: touchTarget.large,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          <Ionicons name="mic" size={26} color={colors.onPrimary} />
        </Pressable>
      ) : null}

      <ConfirmationSheet
        visible={taskPendingDelete !== null}
        title="Delete this task?"
        message="This can't be undone."
        details={
          taskPendingDelete
            ? [
                { label: "Task", value: taskPendingDelete.title },
                { label: "When", value: reminderWhen(taskPendingDelete) },
              ]
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setTaskPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowCentered: { flexDirection: "row", alignItems: "center" },
  statRow: { flexDirection: "row" },
  reminderIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  assistantFab: { position: "absolute", right: 20, bottom: 20, alignItems: "center", justifyContent: "center" },
});
