import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as tasksApi from "../../api/tasks";
import type { UserSearchResult } from "../../api/users";
import { AssignSheet } from "../../components/AssignSheet";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { TaskListItem } from "../../components/TaskListItem";
import type { TasksStackParamList } from "../../navigation/types";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { enqueueTaskComplete, enqueueTaskDelete, isNetworkFailure } from "../../offline/offlineQueue";
import { useTheme } from "../../theme/useTheme";
import type { Task } from "../../types/models";
import { formatDateLabel, formatTimeLabel, toIsoDate, todayIso } from "../../utils/date";

type Props = NativeStackScreenProps<TasksStackParamList, "TaskList">;

/** Time-based groupings rather than status jargon — "Today" and "Upcoming" are what people ask for. */
type FilterKey = "today" | "upcoming" | "completed" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

const EMPTY_COPY: Record<FilterKey, { title: string; subtitle: string }> = {
  today: { title: "Nothing planned today", subtitle: "Enjoy it, or add something you need to remember." },
  upcoming: { title: "Nothing coming up", subtitle: "Add a task and it'll show up here." },
  completed: { title: "Nothing completed yet", subtitle: "Finished tasks will collect here." },
  all: { title: "No tasks yet", subtitle: "Add the first thing you don't want to forget." },
};

/** Long enough to avoid a request per keystroke, short enough to feel immediate. */
const SEARCH_DEBOUNCE_MS = 300;

function filtersFor(key: FilterKey, search: string): tasksApi.TaskFilters {
  const trimmed = search.trim() || undefined;
  const base: tasksApi.TaskFilters = { search: trimmed, sort: "date_asc" };

  switch (key) {
    case "today":
      return { ...base, status: "pending", date: todayIso() };
    case "upcoming":
      return { ...base, status: "pending", from: toIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000)) };
    case "completed":
      return { ...base, status: "completed" };
    default:
      return { ...base, status: "all" };
  }
}

export function TaskListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterKey>("today");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [taskPendingShare, setTaskPendingShare] = useState<Task | null>(null);
  const [sharing, setSharing] = useState(false);

  // Debounce typing, and tag each request so a slow earlier response can never overwrite a newer
  // one when the user keeps typing (spec §91).
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (key: FilterKey, searchTerm: string) => {
    const seq = ++requestSeq.current;
    setError(null);
    try {
      const result = await tasksApi.listTasks(filtersFor(key, searchTerm));
      if (seq !== requestSeq.current) return;
      setTasks(result);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(getApiErrorMessage(err, "We couldn't load your tasks."));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(filter, debouncedSearch);
    }, [filter, debouncedSearch, load])
  );

  const handleToggleComplete = useCallback(async (task: Task) => {
    const nextCompleted = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
    try {
      const updated = await tasksApi.setTaskCompleted(task.id, nextCompleted);
      if (nextCompleted) {
        await cancelTaskReminder(task.reminder.localNotificationId);
        await tasksApi.setTaskNotificationId(task.id, null);
      }
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      if (isNetworkFailure(err)) {
        if (nextCompleted) await cancelTaskReminder(task.reminder.localNotificationId);
        await enqueueTaskComplete(task.id, nextCompleted);
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
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
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setTaskPendingDelete(null);
    } catch (err) {
      if (isNetworkFailure(err)) {
        await enqueueTaskDelete(task.id);
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        setTaskPendingDelete(null);
        return;
      }
      Alert.alert("We couldn't delete that task", getApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [taskPendingDelete]);

  const handleShare = useCallback(
    async (user: UserSearchResult) => {
      const task = taskPendingShare;
      if (!task) return;
      setSharing(true);
      try {
        await tasksApi.assignTask(task.id, user.id);
        setTaskPendingShare(null);
        Alert.alert("Shared", `Shared a copy with ${user.name}`);
      } catch (err) {
        Alert.alert("We couldn't share that task", getApiErrorMessage(err));
      } finally {
        setSharing(false);
      }
    },
    [taskPendingShare]
  );

  const summary = useMemo(() => {
    if (tasks.length === 0) return undefined;
    const remaining = tasks.filter((task) => !task.completed).length;
    if (filter === "completed") return `${tasks.length} completed`;
    return `${remaining} still to do`;
  }, [tasks, filter]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
              Tasks
            </Text>
            {summary ? (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{summary}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => navigation.navigate("Calendar")}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
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
            <Ionicons name="calendar" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              marginTop: spacing.lg,
              minHeight: touchTarget.comfortable,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your tasks"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search your tasks"
            style={[styles.searchInput, { color: colors.text, minHeight: touchTarget.comfortable }]}
          />
          {search ? (
            <Pressable
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.filterRow, { marginTop: spacing.md }]}>
          {FILTERS.map(({ key, label }) => {
            const active = key === filter;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setLoading(true);
                  setFilter(key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderRadius: radius.pill,
                    paddingHorizontal: spacing.lg,
                  },
                ]}
              >
                <Text
                  style={[typography.captionStrong, { color: active ? colors.onPrimary : colors.textMuted }]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
            load(filter, debouncedSearch);
          }}
        />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TaskListItem
              task={item}
              onToggleComplete={() => handleToggleComplete(item)}
              onPress={() => navigation.navigate("TaskForm", { taskId: item.id })}
              onDelete={() => setTaskPendingDelete(item)}
              onShare={() => setTaskPendingShare(item)}
            />
          )}
          ListEmptyComponent={
            debouncedSearch.trim() ? (
              <EmptyState
                title="Nothing matched that"
                subtitle={`No tasks found for "${debouncedSearch.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setSearch("")}
              />
            ) : (
              <EmptyState
                title={EMPTY_COPY[filter].title}
                subtitle={EMPTY_COPY[filter].subtitle}
                actionLabel="Add Task"
                onAction={() => navigation.navigate("TaskForm", undefined)}
              />
            )
          }
        />
      )}

      {/* Labelled rather than a bare "+", so the action is obvious (spec §74). */}
      <Pressable
        onPress={() => navigation.navigate("TaskForm", undefined)}
        accessibilityRole="button"
        accessibilityLabel="Add task"
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
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>Add Task</Text>
      </Pressable>

      <ConfirmationSheet
        visible={taskPendingDelete !== null}
        title="Delete this task?"
        message="This can't be undone."
        details={
          taskPendingDelete
            ? [
                { label: "Task", value: taskPendingDelete.title },
                {
                  label: "When",
                  value: `${formatDateLabel(taskPendingDelete.date)} at ${formatTimeLabel(taskPendingDelete.time)}`,
                },
              ]
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setTaskPendingDelete(null)}
      />

      <AssignSheet
        visible={taskPendingShare !== null}
        title={taskPendingShare ? `Share "${taskPendingShare.title}"` : "Share task"}
        busy={sharing}
        onShare={handleShare}
        onCancel={() => setTaskPendingShare(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerAction: { alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { height: 40, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
