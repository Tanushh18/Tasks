import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as eventsApi from "../../api/familyEvents";
import type { FamilyEvent, FamilyEventType } from "../../api/familyEvents";
import { getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/Card";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { useAuth } from "../../auth/AuthContext";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "EventsList">;

const TYPE_ICONS: Record<FamilyEventType, React.ComponentProps<typeof Ionicons>["name"]> = {
  birthday: "gift-outline",
  anniversary: "heart-outline",
  appointment: "medkit-outline",
  trip: "airplane-outline",
  dinner: "restaurant-outline",
  custom: "calendar-outline",
};

const TABS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
] as const;

export function EventsListScreen({ navigation }: Props) {
  const { colors, feature, spacing, radius, typography, touchTarget, shadow } = useTheme();
  const { user } = useAuth();

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FamilyEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (which: "upcoming" | "past") => {
    setError(null);
    try {
      const result = await eventsApi.listEvents({ when: which });
      setEvents(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load family events."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(tab);
    }, [load, tab])
  );

  async function confirmDelete() {
    const event = pendingDelete;
    if (!event) return;
    setDeleting(true);
    try {
      await eventsApi.deleteEvent(event.id);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      setPendingDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't delete that event."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={["left", "right"]}>
      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={5} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(tab); }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.lg }}>
              <SegmentedControl segments={[...TABS]} value={tab} onChange={setTab} />
            </View>
          }
          renderItem={({ item }) => {
            const isOwner = item.createdBy?.id === user?.id;
            return (
              <Card style={styles.card}>
                <Pressable
                  onPress={() => navigation.navigate("EventForm", { eventId: item.id })}
                  style={({ pressed }) => [styles.flex, styles.row, { opacity: pressed ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open event ${item.title}`}
                >
                  <View
                    style={[styles.iconTile, { backgroundColor: feature.tasks.muted, marginRight: spacing.md }]}
                    accessibilityElementsHidden
                  >
                    <Ionicons name={TYPE_ICONS[item.type]} size={20} color={feature.tasks.solid} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      {item.date}
                      {item.time ? ` · ${item.time}` : ""}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                      {item.attendees.map((a) => a.name).join(", ")}
                    </Text>
                  </View>
                </Pressable>
                {isOwner ? (
                  <Pressable
                    onPress={() => setPendingDelete(item)}
                    hitSlop={8}
                    style={{ marginLeft: spacing.sm }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.title}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title={tab === "upcoming" ? "No upcoming events" : "No past events"}
              subtitle={tab === "upcoming" ? "Add a birthday, trip or appointment to get started." : undefined}
              actionLabel={tab === "upcoming" ? "Add event" : undefined}
              onAction={tab === "upcoming" ? () => navigation.navigate("EventForm", undefined) : undefined}
              icon="calendar-outline"
              tone={feature.tasks.solid}
              toneMuted={feature.tasks.muted}
            />
          }
        />
      )}

      <Pressable
        onPress={() => navigation.navigate("EventForm", undefined)}
        accessibilityRole="button"
        accessibilityLabel="Add event"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: feature.tasks.solid,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
        <Text style={[typography.bodyStrong, { color: "#FFFFFF", marginLeft: spacing.xs }]}>Add event</Text>
      </Pressable>

      <ConfirmationSheet
        visible={pendingDelete !== null}
        title="Delete this event?"
        message="This can't be undone."
        details={pendingDelete ? [{ label: "Title", value: pendingDelete.title }] : undefined}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  card: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  iconTile: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
