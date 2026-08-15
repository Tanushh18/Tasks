import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, type DateData } from "react-native-calendars";
import * as tasksApi from "../../api/tasks";
import { getApiErrorMessage } from "../../api/client";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { TaskListItem } from "../../components/TaskListItem";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { useTheme } from "../../theme/useTheme";
import { toIsoDate, todayIso } from "../../utils/date";
import type { Task } from "../../types/models";
import type { TasksStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<TasksStackParamList, "Calendar">;

function monthRange(dateStr: string): { from: string; to: string } {
  const [year, month] = dateStr.split("-").map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function TaskCalendarScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const [visibleMonth, setVisibleMonth] = useState(todayIso());
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (monthAnchor: string) => {
    setError(null);
    try {
      const { from, to } = monthRange(monthAnchor);
      const tasks = await tasksApi.listTasks({ from, to, sort: "date_asc" });
      setMonthTasks(tasks);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load tasks."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(visibleMonth);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, { marked: boolean; dotColor: string }> = {};
    for (const task of monthTasks) {
      marks[task.date] = { marked: true, dotColor: task.overdue ? colors.danger : colors.primary };
    }
    return marks;
  }, [monthTasks, colors.primary, colors.danger]);

  const selectedTasks = monthTasks.filter((t) => t.date === selectedDate);

  async function handleToggleComplete(task: Task) {
    const nextCompleted = !task.completed;
    setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
    try {
      await tasksApi.setTaskCompleted(task.id, nextCompleted);
      if (nextCompleted) {
        await cancelTaskReminder(task.reminder.localNotificationId);
        await tasksApi.setTaskNotificationId(task.id, null);
      }
    } catch {
      setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }

  async function handleDelete(task: Task) {
    try {
      await cancelTaskReminder(task.reminder.localNotificationId);
      await tasksApi.deleteTask(task.id);
      setMonthTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      // best-effort; the list will self-correct on next focus/reload
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.text }]}>Calendar</Text>
        <View style={{ width: 24 }} />
      </View>

      <Calendar
        current={`${visibleMonth}-01`}
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        onMonthChange={(month: DateData) => {
          const anchor = `${month.year}-${String(month.month).padStart(2, "0")}`;
          setVisibleMonth(anchor);
          setLoading(true);
          load(anchor);
        }}
        markedDates={{
          ...markedDates,
          [selectedDate]: { ...(markedDates[selectedDate] ?? { marked: false, dotColor: colors.primary }), selected: true, selectedColor: colors.primary } as never,
        }}
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.background,
          textSectionTitleColor: colors.textMuted,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: "#FFFFFF",
          todayTextColor: colors.primary,
          dayTextColor: colors.text,
          textDisabledColor: colors.textFaint,
          dotColor: colors.primary,
          monthTextColor: colors.text,
          arrowColor: colors.primary,
        }}
        style={{ marginBottom: spacing.md }}
      />

      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={[typography.h3, { color: colors.text }]}>{selectedDate === todayIso() ? "Today" : selectedDate}</Text>
          <Pressable
            onPress={() => navigation.navigate("TaskForm", { initialDate: selectedDate })}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primaryMuted, borderRadius: radius.pill, paddingHorizontal: 12, height: 32 }}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={[typography.captionStrong, { color: colors.primary, marginLeft: 2 }]}>Add task</Text>
          </Pressable>
        </View>

        {loading ? (
          <LoadingState label="Loading…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => { setLoading(true); load(visibleMonth); }} />
        ) : selectedTasks.length === 0 ? (
          <EmptyState title="No tasks on this day" />
        ) : (
          selectedTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              onToggleComplete={() => handleToggleComplete(task)}
              onPress={() => navigation.navigate("TaskForm", { taskId: task.id })}
              onDelete={() => handleDelete(task)}
            />
          ))
        )}
      </View>
    </SafeAreaView>
  );
}
