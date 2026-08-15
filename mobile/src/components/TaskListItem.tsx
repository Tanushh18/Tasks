import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { formatDateLabel, formatTimeLabel } from "../utils/date";
import type { Task } from "../types/models";
import { Badge } from "./Badge";
import { Card } from "./Card";

interface Props {
  task: Task;
  onToggleComplete: () => void;
  onPress: () => void;
  onDelete: () => void;
}

const priorityTone: Record<Task["priority"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export function TaskListItem({ task, onToggleComplete, onPress, onDelete }: Props) {
  const { colors, spacing, typography } = useTheme();

  return (
    <Card style={styles.card}>
      <Pressable onPress={onToggleComplete} hitSlop={8} style={{ marginRight: spacing.md, marginTop: 2 }}>
        <Ionicons
          name={task.completed ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={task.completed ? colors.success : colors.textFaint}
        />
      </Pressable>

      <Pressable onPress={onPress} style={styles.flex}>
        <Text
          style={[
            typography.bodyStrong,
            { color: task.completed ? colors.textFaint : colors.text, textDecorationLine: task.completed ? "line-through" : "none" },
          ]}
        >
          {task.title}
        </Text>
        <View style={[styles.metaRow, { marginTop: spacing.xs, gap: spacing.sm }]}>
          <Text style={[typography.caption, { color: task.overdue ? colors.danger : colors.textMuted }]}>
            {formatDateLabel(task.date)} · {formatTimeLabel(task.time)}
          </Text>
          {task.overdue ? <Badge label="Overdue" tone="danger" /> : null}
          <Badge label={task.priority} tone={priorityTone[task.priority]} />
          <Badge label={task.category} tone="neutral" />
        </View>
      </Pressable>

      <Pressable onPress={onDelete} hitSlop={8} style={{ marginLeft: spacing.sm }}>
        <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  flex: { flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
});
