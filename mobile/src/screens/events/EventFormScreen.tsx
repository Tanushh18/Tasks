import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as eventsApi from "../../api/familyEvents";
import type { FamilyEventType } from "../../api/familyEvents";
import type { UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import type { MoreStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MoreStackParamList, "EventForm">;

const TYPES: { key: FamilyEventType; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "birthday", label: "Birthday", icon: "gift-outline" },
  { key: "anniversary", label: "Anniversary", icon: "heart-outline" },
  { key: "appointment", label: "Appointment", icon: "medkit-outline" },
  { key: "trip", label: "Trip", icon: "airplane-outline" },
  { key: "dinner", label: "Dinner", icon: "restaurant-outline" },
  { key: "custom", label: "Other", icon: "calendar-outline" },
];

export function EventFormScreen({ navigation, route }: Props) {
  const { colors, feature, spacing, radius, typography } = useTheme();
  const { user } = useAuth();
  const { eventId } = route.params ?? {};
  const isEditing = Boolean(eventId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<FamilyEventType>("custom");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [attendees, setAttendees] = useState<UserSearchResult[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const existing = await eventsApi.getEvent(eventId);
        setTitle(existing.title);
        setType(existing.type);
        setDate(existing.date);
        setTime(existing.time ?? "");
        setAttendees(existing.attendees);
        setReminderEnabled(existing.reminderEnabled);
        setNotes(existing.notes);
        setReadOnly(existing.createdBy?.id !== user?.id);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, user?.id]);

  async function handleSave() {
    setError(null);

    if (!title.trim()) {
      setError("Give this event a title.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError("Date must be in YYYY-MM-DD format.");
      return;
    }
    if (time.trim() && !/^\d{2}:\d{2}$/.test(time.trim())) {
      setError("Time must be in HH:mm format, or left blank.");
      return;
    }

    setSaving(true);
    const input = {
      title: title.trim(),
      type,
      date: date.trim(),
      time: time.trim() || null,
      attendeeIds: attendees.map((a) => a.id),
      reminderEnabled,
      notes: notes.trim(),
    };

    try {
      if (isEditing && eventId) {
        await eventsApi.updateEvent(eventId, input);
      } else {
        await eventsApi.createEvent(input);
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this event."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? (readOnly ? "Event" : "Edit event") : "New event"}
      </Text>

      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Mom's Birthday" editable={!readOnly} />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Type</Text>
      <View style={[styles.typeRow, { marginBottom: spacing.lg }]}>
        {TYPES.map((t) => {
          const active = type === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => !readOnly && setType(t.key)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: active }}
              style={[
                styles.typeChip,
                {
                  backgroundColor: active ? feature.tasks.muted : colors.surface,
                  borderColor: active ? feature.tasks.solid : colors.border,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                },
              ]}
            >
              <Ionicons name={t.icon} size={16} color={active ? feature.tasks.solid : colors.textFaint} />
              <Text
                style={[
                  typography.caption,
                  { color: active ? feature.tasks.solid : colors.textMuted, marginLeft: 6 },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-01-05" editable={!readOnly} keyboardType="numbers-and-punctuation" />
      <TextField label="Time (HH:mm, optional)" value={time} onChangeText={setTime} placeholder="19:00" editable={!readOnly} keyboardType="numbers-and-punctuation" />

      {!readOnly ? (
        <View style={[styles.reminderRow, { marginBottom: spacing.lg }]}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Reminder</Text>
          <Switch
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            accessibilityLabel="Enable reminder"
            trackColor={{ true: feature.tasks.solid, false: colors.border }}
          />
        </View>
      ) : null}

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Attendees</Text>
      {!readOnly ? (
        <UserPicker
          mode="multi"
          value={attendees}
          onChange={setAttendees}
          placeholder="Search people by name"
          excludeIds={user ? [user.id] : []}
        />
      ) : (
        <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.lg }]}>
          {attendees.map((a) => a.name).join(", ") || "No attendees"}
        </Text>
      )}

      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional details"
        multiline
        editable={!readOnly}
      />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      {!readOnly ? (
        <Button
          label={isEditing ? "Save changes" : "Add event"}
          size="large"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: spacing.lg, backgroundColor: feature.tasks.solid }}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { flexDirection: "row", alignItems: "center", height: 36, borderWidth: 1 },
  reminderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
