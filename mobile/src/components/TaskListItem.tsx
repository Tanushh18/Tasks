import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useTheme } from "../theme/useTheme";
import { formatDateLabel, formatTimeLabel } from "../utils/date";
import type { Priority, Task } from "../types/models";
import { Badge } from "./Badge";
import { BottomSheet, SheetActionList } from "./BottomSheet";
import { Card } from "./Card";

interface Props {
  task: Task;
  onToggleComplete: () => void;
  onPress: () => void;
  onDelete: () => void;
  onShare?: () => void;
  /** Bumps priority up or down one step; used by the long-press menu (and, where it doesn't
   * conflict with complete/delete, a swipe) so priority can change without opening the form. */
  onChangePriority?: (direction: "up" | "down") => void;
  /** id -> name for anyone this task is assigned to or shared with — resolved by the screen
   * from the family roster, since the API only returns ids on the task itself. */
  userNames?: Record<string, string>;
}

/** "normal" gets no badge at all — most tasks are normal, and badging every
 * one of them turns the list into noise rather than signal. */
const priorityTone: Record<Task["priority"], "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  important: "warning",
  normal: "neutral",
  low: "neutral",
};

const PRIORITY_ORDER: Priority[] = ["low", "normal", "important", "urgent"];

export function TaskListItem({ task, onToggleComplete, onPress, onDelete, onShare, onChangePriority, userNames }: Props) {
  const { colors, spacing, typography } = useTheme();
  const swipeRef = useRef<Swipeable>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // A small bounce when a task is marked complete — enough to register as a
  // response to the tap, not so much it slows down someone checking off a
  // long list quickly (spec §33: "keep animations fast and subtle").
  const checkScale = useRef(new Animated.Value(1)).current;
  const wasCompleted = useRef(task.completed);
  useEffect(() => {
    if (task.completed && !wasCompleted.current) {
      checkScale.setValue(0.7);
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }).start();
    }
    wasCompleted.current = task.completed;
  }, [task.completed, checkScale]);

  const checklist = task.checklist ?? [];
  const checklistDone = checklist.filter((item) => item.done).length;

  const assignedToName = task.assignedTo ? userNames?.[task.assignedTo] : undefined;
  const sharedWithNames = (task.sharedWith ?? []).map((id) => userNames?.[id]).filter(Boolean) as string[];

  function closeSwipe() {
    swipeRef.current?.close();
  }

  function renderLeftActions() {
    // Right swipe (drag reveals from the left) — complete/uncomplete.
    return (
      <Pressable
        onPress={() => {
          onToggleComplete();
          closeSwipe();
        }}
        accessibilityRole="button"
        accessibilityLabel={task.completed ? "Mark task incomplete" : "Mark task complete"}
        style={[styles.swipeAction, { backgroundColor: colors.successMuted }]}
      >
        <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        <Text style={[typography.captionStrong, { color: colors.success, marginTop: 2 }]}>
          {task.completed ? "Undo" : "Done"}
        </Text>
      </Pressable>
    );
  }

  function renderRightActions() {
    // Left swipe (drag reveals from the right) — delete.
    return (
      <Pressable
        onPress={() => {
          closeSwipe();
          onDelete();
        }}
        accessibilityRole="button"
        accessibilityLabel="Delete task"
        style={[styles.swipeAction, { backgroundColor: colors.dangerMuted }]}
      >
        <Ionicons name="trash" size={24} color={colors.danger} />
        <Text style={[typography.captionStrong, { color: colors.danger, marginTop: 2 }]}>Delete</Text>
      </Pressable>
    );
  }

  const priorityActions =
    onChangePriority && [
      {
        icon: "arrow-up-circle-outline" as const,
        label: "Raise priority",
        onPress: () => {
          setMenuVisible(false);
          onChangePriority("up");
        },
      },
      {
        icon: "arrow-down-circle-outline" as const,
        label: "Lower priority",
        onPress: () => {
          setMenuVisible(false);
          onChangePriority("down");
        },
      },
    ];

  return (
    <>
      <Swipeable
        ref={swipeRef}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        overshootLeft={false}
        overshootRight={false}
      >
        <Pressable
          onLongPress={() => onChangePriority && setMenuVisible(true)}
          accessibilityLabel={onChangePriority ? `${task.title}, long press for priority options` : undefined}
        >
          <Card style={styles.card}>
            <Pressable
              onPress={onToggleComplete}
              accessibilityRole="button"
              accessibilityLabel={task.completed ? "Mark task incomplete" : "Mark task complete"}
              hitSlop={8}
              style={{ marginRight: spacing.md, marginTop: 2 }}
            >
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Ionicons
                  name={task.completed ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={task.completed ? colors.success : colors.textFaint}
                />
              </Animated.View>
            </Pressable>

            <Pressable onPress={onPress} style={styles.flex} accessibilityRole="button" accessibilityLabel={`Open ${task.title}`}>
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
                {checklist.length > 0 ? (
                  <Badge label={`${checklistDone}/${checklist.length}`} tone="neutral" />
                ) : null}
                {task.assignedBy ? <Badge label={`Shared by ${task.assignedBy.name}`} tone="primary" /> : null}
                {assignedToName ? <Badge label={`Assigned to ${assignedToName}`} tone="primary" /> : null}
                {sharedWithNames.length > 0 ? (
                  <Badge label={`Shared with ${sharedWithNames.join(", ")}`} tone="primary" />
                ) : null}
              </View>
            </Pressable>

            {onShare ? (
              <Pressable
                onPress={onShare}
                accessibilityRole="button"
                accessibilityLabel={`Share ${task.title}`}
                hitSlop={8}
                style={{ marginLeft: spacing.sm }}
              >
                <Ionicons name="share-outline" size={20} color={colors.textFaint} />
              </Pressable>
            ) : null}

            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${task.title}`}
              hitSlop={8}
              style={{ marginLeft: spacing.sm }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
            </Pressable>
          </Card>
        </Pressable>
      </Swipeable>

      {/* Long-press menu — the non-gesture equivalent of the priority swipe, required so the
       * action stays reachable for screen-reader and motor-impaired users. */}
      {onChangePriority ? (
        <BottomSheet visible={menuVisible} onClose={() => setMenuVisible(false)} title={task.title}>
          <SheetActionList actions={priorityActions || []} />
        </BottomSheet>
      ) : null}
    </>
  );
}

export function nextPriority(priority: Priority, direction: "up" | "down"): Priority {
  const index = PRIORITY_ORDER.indexOf(priority);
  const nextIndex = direction === "up" ? Math.min(index + 1, PRIORITY_ORDER.length - 1) : Math.max(index - 1, 0);
  return PRIORITY_ORDER[nextIndex];
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  flex: { flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  swipeAction: { width: 76, alignItems: "center", justifyContent: "center", marginBottom: 10, borderRadius: 12 },
});
