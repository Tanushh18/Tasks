import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as tasksApi from "../../api/tasks";
import { getApiErrorMessage } from "../../api/client";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { TaskListItem } from "../../components/TaskListItem";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { useTheme } from "../../theme/useTheme";
import type { Task } from "../../types/models";
import type { TasksStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<TasksStackParamList, "TaskList">;

type StatusFilter = "all" | "pending" | "completed" | "overdue";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
];

export function TaskListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (statusFilter: StatusFilter, searchTerm: string) => {
    setError(null);
    try {
      const result = await tasksApi.listTasks({
        status: statusFilter,
        search: searchTerm.trim() || undefined,
        sort: "date_asc",
      });
      setTasks(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load tasks."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(status, search);
    }, [status, search, load])
  );

  async function handleToggleComplete(task: Task) {
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
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      Alert.alert("Couldn't update task", getApiErrorMessage(err));
    }
  }

  function handleDelete(task: Task) {
    Alert.alert("Delete task", `Delete "${task.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelTaskReminder(task.reminder.localNotificationId);
            await tasksApi.deleteTask(task.id);
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
          } catch (err) {
            Alert.alert("Couldn't delete task", getApiErrorMessage(err));
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <Text style={[typography.h1, { color: colors.text }]}>Tasks</Text>
          <Pressable onPress={() => navigation.navigate("Calendar")} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="calendar-outline" size={24} color={colors.textMuted} />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tasks…"
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((filter) => {
            const active = filter.key === status;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setStatus(filter.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderRadius: radius.pill,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              >
                <Text style={[typography.captionStrong, { color: active ? "#FFFFFF" : colors.textMuted }]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <LoadingState label="Loading tasks…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(status, search); }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 }}
          renderItem={({ item }) => (
            <TaskListItem
              task={item}
              onToggleComplete={() => handleToggleComplete(item)}
              onPress={() => navigation.navigate("TaskForm", { taskId: item.id })}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState title="No tasks here" subtitle="Tap the + button to add your first task." />
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("TaskForm", undefined)}
        style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.pill }]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, height: 44 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: { height: 34, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
