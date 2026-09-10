import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, type DateData } from "react-native-calendars";
import * as tasksApi from "../../api/tasks";
import * as financeApi from "../../api/finance";
import * as familyEventsApi from "../../api/familyEvents";
import type { FamilyEvent } from "../../api/familyEvents";
import { getApiErrorMessage } from "../../api/client";
import { BottomSheet } from "../../components/BottomSheet";
import { SegmentedControl } from "../../components/SegmentedControl";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { TaskListItem } from "../../components/TaskListItem";
import { useFeatureFlags } from "../../features/FeatureFlagsContext";
import { cancelTaskReminder } from "../../notifications/notificationService";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, toIsoDate, todayIso } from "../../utils/date";
import type { Task, Transaction } from "../../types/models";
import type { TasksStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<TasksStackParamList, "Calendar">;

type ViewMode = "month" | "agenda";

function monthRange(dateStr: string): { from: string; to: string } {
  const [year, month] = dateStr.split("-").map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function TaskCalendarScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, feature } = useTheme();
  const { flags } = useFeatureFlags();

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [visibleMonth, setVisibleMonth] = useState(todayIso());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([]);
  const [monthEvents, setMonthEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (monthAnchor: string) => {
      setError(null);
      try {
        const { from, to } = monthRange(monthAnchor);
        const [tasks, transactions, events] = await Promise.all([
          tasksApi.listTasks({ from, to, sort: "date_asc" }),
          financeApi.listTransactions({ from, to }),
          flags.familyEvents ? familyEventsApi.listEvents({ from, to }) : Promise.resolve([]),
        ]);
        setMonthTasks(tasks);
        setMonthTransactions(transactions);
        setMonthEvents(events);
      } catch (err) {
        setError(getApiErrorMessage(err, "Could not load your calendar."));
      } finally {
        setLoading(false);
      }
    },
    [flags.familyEvents]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(visibleMonth);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  // One dot per distinct thing happening that day — task, reminder, expense, event — so a busy
  // day reads as busy at a glance, rather than collapsing everything into a single dot.
  const markedDates = useMemo(() => {
    const marks: Record<string, { dots: { key: string; color: string }[] }> = {};
    const addDot = (date: string, key: string, color: string) => {
      if (!marks[date]) marks[date] = { dots: [] };
      if (!marks[date].dots.some((d) => d.key === key)) marks[date].dots.push({ key, color });
    };
    for (const task of monthTasks) {
      addDot(task.date, task.overdue ? "overdue" : task.reminder?.enabled ? "reminder" : "task", task.overdue ? colors.danger : feature.tasks.solid);
    }
    for (const tx of monthTransactions) {
      addDot(tx.date, "money", tx.type === "OUT" ? colors.danger : colors.success);
    }
    for (const event of monthEvents) {
      addDot(event.date, "event", feature.contacts.solid);
    }
    return marks;
  }, [monthTasks, monthTransactions, monthEvents, colors.danger, colors.success, feature.tasks.solid, feature.contacts.solid]);

  const tasksOn = useCallback((date: string) => monthTasks.filter((t) => t.date === date), [monthTasks]);
  const transactionsOn = useCallback((date: string) => monthTransactions.filter((t) => t.date === date), [monthTransactions]);
  const eventsOn = useCallback((date: string) => monthEvents.filter((e) => e.date === date), [monthEvents]);

  const agendaDays = useMemo(() => {
    const dates = new Set<string>([
      ...monthTasks.map((t) => t.date),
      ...monthTransactions.map((t) => t.date),
      ...monthEvents.map((e) => e.date),
    ]);
    return Array.from(dates)
      .filter((d) => d >= todayIso())
      .sort()
      .slice(0, 30);
  }, [monthTasks, monthTransactions, monthEvents]);

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

  function renderDayContent(date: string) {
    const dayTasks = tasksOn(date);
    const dayTx = transactionsOn(date);
    const dayEvents = eventsOn(date);

    if (dayTasks.length === 0 && dayTx.length === 0 && dayEvents.length === 0) {
      return <EmptyState title="Nothing on this day" />;
    }

    return (
      <View>
        {dayEvents.map((event) => (
          <View
            key={event.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Ionicons name="calendar" size={18} color={feature.contacts.solid} style={{ marginRight: spacing.sm }} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{event.title}</Text>
            {event.time ? <Text style={[typography.caption, { color: colors.textMuted }]}>{event.time}</Text> : null}
          </View>
        ))}
        {dayTx.map((tx) => (
          <View
            key={tx.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Ionicons
              name={tx.type === "OUT" ? "arrow-up-circle" : "arrow-down-circle"}
              size={18}
              color={tx.type === "OUT" ? colors.danger : colors.success}
              style={{ marginRight: spacing.sm }}
            />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
              {tx.description || tx.category}
            </Text>
            <Text style={[typography.bodyStrong, { color: tx.type === "OUT" ? colors.danger : colors.success }]}>
              {formatCurrency(tx.amount)}
            </Text>
          </View>
        ))}
        {dayTasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            onToggleComplete={() => handleToggleComplete(task)}
            onPress={() => navigation.navigate("TaskForm", { taskId: task.id })}
            onDelete={() => handleDelete(task)}
          />
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.text }]}>Calendar</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SegmentedControl
          segments={[
            { value: "month", label: "Month" },
            { value: "agenda", label: "Agenda" },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
      </View>

      {loading ? (
        <LoadingState label="Loading…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(visibleMonth); }} />
      ) : viewMode === "month" ? (
        <Calendar
          current={`${visibleMonth}-01`}
          onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
          onMonthChange={(month: DateData) => {
            const anchor = `${month.year}-${String(month.month).padStart(2, "0")}`;
            setVisibleMonth(anchor);
            setLoading(true);
            load(anchor);
          }}
          markingType="multi-dot"
          markedDates={{
            ...markedDates,
            ...(selectedDate
              ? {
                  [selectedDate]: {
                    ...(markedDates[selectedDate] ?? { dots: [] }),
                    selected: true,
                    selectedColor: colors.primary,
                  },
                }
              : {}),
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
          style={{ marginTop: spacing.md }}
        />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          {agendaDays.length === 0 ? (
            <EmptyState title="Nothing coming up" subtitle="Your agenda for the rest of this month is clear." />
          ) : (
            agendaDays.map((date) => (
              <Pressable
                key={date}
                onPress={() => setSelectedDate(date)}
                accessibilityRole="button"
                accessibilityLabel={`Agenda for ${formatDateLabel(date)}`}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, paddingVertical: spacing.sm }]}
              >
                <Text style={[typography.captionStrong, { color: colors.textMuted }]}>{formatDateLabel(date)}</Text>
                {tasksOn(date).map((t) => (
                  <Text key={t.id} style={[typography.body, { color: colors.text, marginTop: 2 }]} numberOfLines={1}>
                    • {t.title}
                  </Text>
                ))}
                {transactionsOn(date).map((tx) => (
                  <Text key={tx.id} style={[typography.body, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                    • {tx.description || tx.category} ({formatCurrency(tx.amount)})
                  </Text>
                ))}
                {eventsOn(date).map((e) => (
                  <Text key={e.id} style={[typography.body, { color: feature.contacts.solid, marginTop: 2 }]} numberOfLines={1}>
                    • {e.title}
                  </Text>
                ))}
              </Pressable>
            ))
          )}
        </View>
      )}

      <BottomSheet
        visible={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        title={selectedDate ? (selectedDate === todayIso() ? "Today" : formatDateLabel(selectedDate)) : ""}
      >
        {selectedDate ? renderDayContent(selectedDate) : null}
      </BottomSheet>

      <Pressable
        onPress={() => navigation.navigate("TaskForm", { initialDate: selectedDate ?? todayIso() })}
        accessibilityRole="button"
        accessibilityLabel="Add task"
        style={({ pressed }) => [
          {
            position: "absolute",
            right: 20,
            bottom: 20,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.primary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.lg,
            height: 48,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={20} color={colors.onPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: 4 }]}>Add task</Text>
      </Pressable>
    </SafeAreaView>
  );
}
