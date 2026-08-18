import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import * as tasksApi from "../../api/tasks";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { cancelTaskReminder, ensureNotificationSetup, scheduleTaskReminder } from "../../notifications/notificationService";
import { enqueueTaskCreate, enqueueTaskDelete, enqueueTaskUpdate, isNetworkFailure } from "../../offline/offlineQueue";
import { useTheme } from "../../theme/useTheme";
import { formatDateLabel, formatTimeLabel, toHm, toIsoDate, todayIso } from "../../utils/date";
import type { Priority, RecurrenceType, Task } from "../../types/models";
import type { TasksStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<TasksStackParamList, "TaskForm">;

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const RECURRENCES: { key: RecurrenceType; label: string }[] = [
  { key: "none", label: "One-time" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function timeStringToDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function TaskFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const taskId = route.params?.taskId;
  const isEditing = Boolean(taskId);

  const [loading, setLoading] = useState(isEditing);
  const [existingTask, setExistingTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(
    route.params?.initialDate ? new Date(`${route.params.initialDate}T00:00:00`) : new Date()
  );
  const [time, setTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [priority, setPriority] = useState<Priority>("medium");
  const [category, setCategory] = useState("General");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceType>("none");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!taskId) return;
    (async () => {
      try {
        const task = await tasksApi.getTask(taskId);
        setExistingTask(task);
        setTitle(task.title);
        setDescription(task.description);
        setDate(timeStringToDate(task.date, task.time));
        setTime(timeStringToDate(task.date, task.time));
        setPriority(task.priority);
        setCategory(task.category);
        setReminderEnabled(task.reminder.enabled);
        setRecurrence(task.recurrence.type);
        setNotes(task.notes);
      } catch (err) {
        setError(getApiErrorMessage(err, "Could not load this task."));
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  async function handleReminderToggle(next: boolean) {
    if (next) {
      const granted = await ensureNotificationSetup();
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "Enable notifications for this app in your device settings to receive task reminders."
        );
        return;
      }
    }
    setReminderEnabled(next);
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setSaving(true);

    const input = {
      title: title.trim(),
      description,
      date: toIsoDate(date),
      time: toHm(time),
      priority,
      category: category.trim() || "General",
      reminder: { enabled: reminderEnabled },
      recurrence: { type: recurrence },
      notes,
    };

    try {
      const saved = isEditing && taskId ? await tasksApi.updateTask(taskId, input) : await tasksApi.createTask(input);

      const notificationId = await scheduleTaskReminder(saved);
      await tasksApi.setTaskNotificationId(saved.id, notificationId);

      navigation.goBack();
    } catch (err) {
      if (isNetworkFailure(err)) {
        // No connection reached the server at all — queue it locally rather than losing the
        // change. It'll sync (and its reminder get (re)scheduled) automatically once back online.
        if (isEditing && taskId) {
          await enqueueTaskUpdate(taskId, input);
        } else {
          await enqueueTaskCreate(input);
        }
        Alert.alert("Saved offline", "No connection right now — this will sync automatically once you're back online.");
        navigation.goBack();
        return;
      }
      setError(getApiErrorMessage(err, "Could not save this task."));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!taskId || !existingTask) return;
    Alert.alert("Delete task", `Delete "${existingTask.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelTaskReminder(existingTask.reminder.localNotificationId);
            await tasksApi.deleteTask(taskId);
            navigation.goBack();
          } catch (err) {
            if (isNetworkFailure(err)) {
              await enqueueTaskDelete(taskId);
              Alert.alert("Deleted offline", "No connection right now — this will sync automatically once you're back online.");
              navigation.goBack();
              return;
            }
            Alert.alert("Couldn't delete task", getApiErrorMessage(err));
          }
        },
      },
    ]);
  }

  if (loading) return <LoadingState label="Loading task…" />;

  return (
    <ScreenContainer>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit Task" : "New Task"}
      </Text>

      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Pay electricity bill" />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details"
        multiline
      />

      <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg }}>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[styles.pickerChip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Date</Text>
          <Text style={[typography.body, { color: colors.text }]}>{formatDateLabel(toIsoDate(date))}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowTimePicker(true)}
          style={[styles.pickerChip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text style={[typography.captionStrong, { color: colors.textMuted }]}>Time</Text>
          <Text style={[typography.body, { color: colors.text }]}>{formatTimeLabel(toHm(time))}</Text>
        </Pressable>
      </View>

      {showDatePicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={new Date(`${todayIso()}T00:00:00`)}
          onChange={(_event, selected) => {
            setShowDatePicker(false);
            if (selected) setDate(selected);
          }}
        />
      ) : null}
      {showTimePicker ? (
        <DateTimePicker
          value={time}
          mode="time"
          onChange={(_event, selected) => {
            setShowTimePicker(false);
            if (selected) setTime(selected);
          }}
        />
      ) : null}

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Priority</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
        {PRIORITIES.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPriority(p)}
            style={[
              styles.chip,
              {
                backgroundColor: priority === p ? colors.primary : colors.surfaceAlt,
                borderRadius: radius.pill,
              },
            ]}
          >
            <Text style={{ color: priority === p ? "#FFFFFF" : colors.textMuted, fontWeight: "600", textTransform: "capitalize" }}>
              {p}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextField label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Bills, Work, Personal" />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Repeat</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" }}>
        {RECURRENCES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRecurrence(r.key)}
            style={[
              styles.chip,
              { backgroundColor: recurrence === r.key ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill },
            ]}
          >
            <Text style={{ color: recurrence === r.key ? "#FFFFFF" : colors.textMuted, fontWeight: "600" }}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.row, { marginBottom: spacing.lg }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Reminder notification</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Notify me at the scheduled date and time</Text>
        </View>
        <Switch value={reminderEnabled} onValueChange={handleReminderToggle} />
      </View>

      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline />

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={isEditing ? "Save changes" : "Create task"} onPress={handleSave} loading={saving} />

      {isEditing ? (
        <Button label="Delete task" onPress={handleDelete} variant="danger" style={{ marginTop: spacing.md }} />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pickerChip: { flex: 1, borderWidth: 1, padding: 12 },
  chip: { paddingHorizontal: 16, height: 36, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center" },
});
