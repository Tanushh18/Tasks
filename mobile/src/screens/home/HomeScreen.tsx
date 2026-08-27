import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as financeApi from "../../api/finance";
import * as tasksApi from "../../api/tasks";
import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { OfflineBanner } from "../../components/OfflineBanner";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { TaskListItem } from "../../components/TaskListItem";
import type { HomeStackParamList, MainTabParamList } from "../../navigation/types";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { enqueueTaskComplete, enqueueTaskDelete, getPendingCount, isNetworkFailure } from "../../offline/offlineQueue";
import { scopedKey } from "../../offline/scope";
import { getJson, setJson } from "../../offline/storage";
import { useTheme } from "../../theme/useTheme";
import type { FinancialSummary, Task, TaskCounts } from "../../types/models";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, formatTimeLabel, todayIso } from "../../utils/date";

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, "HomeMain">,
  BottomTabScreenProps<MainTabParamList>
>;

/** Namespaced per user (see offline/scope.ts) — this cache holds task counts and spending totals,
 * which must never be shown to a different account that signs in on the same device. */
const DASHBOARD_CACHE_KEY_BASE = "dt_cache_home_dashboard";

/** Enough to see what today looks like without turning Home into the full task list. */
const TODAY_PREVIEW_LIMIT = 4;
const REMINDER_PREVIEW_LIMIT = 3;

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

/** "Tomorrow at 8:00 AM" — a reminder read the way someone would say it. */
function reminderWhen(task: Task): string {
  return `${formatDateLabel(task.date)} at ${formatTimeLabel(task.time)}`;
}

export function HomeScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();
  const { user } = useAuth();

  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [todaysTasks, setTodaysTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Task[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const cacheKey = scopedKey(DASHBOARD_CACHE_KEY_BASE);
      if (cacheKey) {
        await setJson(cacheKey, {
          counts: taskCounts,
          todaysTasks: todayList,
          reminders: upcomingReminders,
          summary: financeSummary,
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
          setOfflineCachedAt(cached.cachedAt);
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remainingToday = useMemo(() => todaysTasks.filter((task) => !task.completed).length, [todaysTasks]);

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
        setPendingCount(await getPendingCount());
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
        setPendingCount(await getPendingCount());
        setTaskPendingDelete(null);
        return;
      }
      Alert.alert("We couldn't delete that task", getApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [taskPendingDelete]);

  const editTask = useCallback(
    (taskId: string) => navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId } }),
    [navigation]
  );

  if (loading) return <LoadingState label="Getting your day ready…" />;
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

  return (
    <View style={styles.flex}>
      <ScreenContainer onRefresh={load} refreshing={false}>
        {/* 1 — Who and where. */}
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={[typography.h1, { color: colors.text }]}>{greeting()}</Text>
            {user?.mobileNumber ? (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {user.mobileNumber}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => navigation.navigate("Search")}
            accessibilityRole="button"
            accessibilityLabel="Search your tasks and money"
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerAction,
              {
                minWidth: touchTarget.min,
                minHeight: touchTarget.min,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
        </View>

        {offlineCachedAt || pendingCount > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <OfflineBanner cachedAt={offlineCachedAt} pendingCount={pendingCount} />
          </View>
        ) : null}

        {/* 2 — Anything that slipped. Stated as a fact with a way to act, never as a scolding. */}
        {overdueCount > 0 ? (
          <Pressable
            onPress={() => navigation.navigate("TasksTab", { screen: "TaskList", params: undefined })}
            accessibilityRole="button"
            accessibilityLabel={`Needs attention. ${overdueCount} ${overdueCount === 1 ? "task is" : "tasks are"} overdue. Opens your tasks.`}
            style={({ pressed }) => [{ marginTop: spacing.lg, opacity: pressed ? 0.85 : 1 }]}
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

        {/* 3 — What do I need to do? */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title="Today's tasks"
            subtitle={
              todaysTasks.length === 0
                ? "Nothing planned"
                : `${remainingToday} of ${todaysTasks.length} still to do`
            }
            actionLabel={todaysTasks.length > 0 ? "View all" : undefined}
            onActionPress={() => navigation.navigate("TasksTab", { screen: "TaskList", params: undefined })}
          />

          {todaysTasks.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing planned yet"
                subtitle="Add something you don't want to forget."
                actionLabel="Add Task"
                onAction={() => navigation.navigate("TasksTab", { screen: "TaskForm", params: undefined })}
              />
            </Card>
          ) : (
            <>
              {todaysTasks.slice(0, TODAY_PREVIEW_LIMIT).map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  onToggleComplete={() => handleToggleComplete(task)}
                  onPress={() => editTask(task.id)}
                  onDelete={() => setTaskPendingDelete(task)}
                />
              ))}
              {todaysTasks.length > TODAY_PREVIEW_LIMIT ? (
                <Pressable
                  onPress={() => navigation.navigate("TasksTab", { screen: "TaskList", params: undefined })}
                  accessibilityRole="button"
                  style={{ paddingVertical: spacing.md, minHeight: touchTarget.min }}
                >
                  <Text style={[typography.captionStrong, { color: colors.primary }]}>
                    {`Show ${todaysTasks.length - TODAY_PREVIEW_LIMIT} more`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {/* 4 — The four things people come here to do. */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Quick actions" />
          <View style={styles.quickGrid}>
            <QuickAction
              icon="add-circle"
              label="Add Task"
              onPress={() => navigation.navigate("TasksTab", { screen: "TaskForm", params: undefined })}
            />
            <QuickAction
              icon="wallet"
              label="Add Expense"
              onPress={() => navigation.navigate("FinanceTab", { screen: "TransactionForm", params: { type: "OUT" } })}
            />
            <QuickAction
              icon="chatbubble-ellipses"
              label="Ask Assistant"
              onPress={() => navigation.navigate("AssistantTab", undefined)}
            />
            <QuickAction
              icon="calendar"
              label="View Calendar"
              onPress={() => navigation.navigate("TasksTab", { screen: "Calendar", params: undefined })}
            />
          </View>
        </View>

        {/* 5 — What's coming up. */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Coming up" />
          {reminders.length === 0 ? (
            <Card>
              <EmptyState title="No reminders set" subtitle="You'll see upcoming reminders here." />
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
                    <View
                      style={[
                        styles.reminderIcon,
                        { backgroundColor: colors.primaryMuted, borderRadius: radius.md },
                      ]}
                    >
                      <Ionicons name="notifications" size={20} color={colors.primary} />
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

        {/* 6 — Money, last: useful context rather than the headline. */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title="Money this month"
            actionLabel="Open"
            onActionPress={() => navigation.navigate("FinanceTab", { screen: "AccountsList", params: undefined })}
          />
          <Card>
            {/* A real ₹0 is meaningful, so nothing is rendered until the totals actually arrive. */}
            {summary === null ? (
              <View accessibilityRole="progressbar" accessibilityLabel="Loading your money summary">
                <Skeleton height={28} width="55%" />
                <Skeleton height={16} width="80%" style={{ marginTop: spacing.md }} />
              </View>
            ) : (
              <>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Balance</Text>
                <Text style={[typography.amount, { color: colors.text, marginTop: 2 }]}>
                  {formatCurrency(summary.netFlow)}
                </Text>
                <View style={[styles.moneyRow, { marginTop: spacing.lg }]}>
                  <View style={styles.flex}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Money in</Text>
                    <Text style={[typography.h3, { color: colors.success, marginTop: 2 }]}>
                      {formatCurrency(summary.cashIn)}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Money out</Text>
                    <Text style={[typography.h3, { color: colors.danger, marginTop: 2 }]}>
                      {formatCurrency(summary.cashOut)}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </Card>
        </View>
      </ScreenContainer>

      <Pressable
        onPress={() => navigation.navigate("AssistantTab", { autoListen: true })}
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
          },
        ]}
      >
        <Ionicons name="mic" size={26} color={colors.onPrimary} />
      </Pressable>

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
  const { colors, radius, spacing, typography, touchTarget } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.lg,
          minHeight: touchTarget.large + spacing.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.quickActionIcon,
          { backgroundColor: colors.primaryMuted, borderRadius: radius.md, marginBottom: spacing.sm },
        ]}
      >
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <Text style={[typography.captionStrong, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerAction: { alignItems: "center", justifyContent: "center" },
  rowCentered: { flexDirection: "row", alignItems: "center" },
  reminderIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  moneyRow: { flexDirection: "row", gap: 16 },
  // Two per row so each target stays large and the labels never truncate on a 320pt screen.
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickAction: { flexGrow: 1, flexBasis: "47%", borderWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
  quickActionIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  assistantFab: { position: "absolute", right: 20, bottom: 20, alignItems: "center", justifyContent: "center" },
});
