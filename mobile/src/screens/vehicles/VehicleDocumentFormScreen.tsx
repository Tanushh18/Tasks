import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as vehicleDocumentsApi from "../../api/vehicleDocuments";
import type { VehicleDocumentType } from "../../api/vehicleDocuments";
import { Button } from "../../components/Button";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { ScreenContainer } from "../../components/ScreenContainer";
import { FilePreview } from "../../components/FilePreview";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import type { VehicleStackParamList } from "../../navigation/types";
import { ensureNotificationSetup, scheduleVehicleDocumentReminder } from "../../notifications/notificationService";
import { useTheme } from "../../theme/useTheme";
import { formatDateLabel, toIsoDate } from "../../utils/date";
import { pickDocumentFile, pickImage, showFilePickerSheet } from "../../utils/filePicker";

type Props = NativeStackScreenProps<VehicleStackParamList, "VehicleDocumentForm">;

const TYPES: { key: VehicleDocumentType; label: string }[] = [
  { key: "pollution", label: "Pollution" },
  { key: "insurance", label: "Insurance" },
  { key: "registration", label: "Registration" },
  { key: "service", label: "Service" },
  { key: "warranty", label: "Warranty" },
  { key: "other", label: "Other" },
];

export function VehicleDocumentFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { vehicleId, documentId } = route.params!;
  const isEditing = Boolean(documentId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<VehicleDocumentType>("other");
  const [customLabel, setCustomLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [localNotificationId, setLocalNotificationId] = useState<string | null>(null);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const existing = await vehicleDocumentsApi.getVehicleDocument(vehicleId, documentId);
        setType(existing.type);
        setCustomLabel(existing.customLabel || "");
        setExpiresAt(existing.expiresAt ? new Date(existing.expiresAt) : null);
        setReminderEnabled(existing.reminderEnabled);
        setFileData(existing.fileData || null);
        setFileName(existing.fileName || null);
        setNotes(existing.notes);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [vehicleId, documentId]);

  async function handlePick(source: "camera" | "library" | "document") {
    const picked = source === "document" ? await pickDocumentFile() : await pickImage(source);
    if (!picked) return;
    setFileData(picked.dataUrl);
    setFileName(picked.fileName);
  }

  function handlePickPress() {
    showFilePickerSheet(handlePick, "Attach file");
  }

  async function handleReminderToggle(next: boolean) {
    if (next) {
      const granted = await ensureNotificationSetup();
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "Enable notifications for this app in your device settings to receive document reminders."
        );
        return;
      }
    }
    setReminderEnabled(next);
  }

  async function handleSave() {
    setError(null);
    if (type === "other" && !customLabel.trim()) {
      setError("Please enter a label for this document.");
      return;
    }
    setSaving(true);

    const label = type === "other" ? customLabel.trim() : TYPES.find((t) => t.key === type)!.label;
    // The backend expects a full ISO 8601 datetime (zod's `.datetime()`), not the date-only
    // "YYYY-MM-DD" string `toIsoDate` produces for display — send `toISOString()` instead.
    const expiresAtIso = expiresAt ? expiresAt.toISOString() : null;
    const input = {
      type,
      customLabel: customLabel.trim(),
      expiresAt: expiresAtIso,
      reminderEnabled,
      fileData: fileData ?? undefined,
      fileName: fileName ?? undefined,
      notes,
    };

    try {
      const saved =
        isEditing && documentId
          ? await vehicleDocumentsApi.updateVehicleDocument(vehicleId, documentId, input)
          : await vehicleDocumentsApi.createVehicleDocument(vehicleId, input);

      try {
        await scheduleVehicleDocumentReminder({
          id: saved.id,
          label,
          expiresAt: expiresAtIso,
          reminderEnabled,
          localNotificationId,
        });
      } catch {
        // Never block saving the document on a notification scheduling failure.
      }

      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this document."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!documentId) return;
    setDeleting(true);
    try {
      await vehicleDocumentsApi.deleteVehicleDocument(vehicleId, documentId);
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this document."));
    } finally {
      setDeleting(false);
      setPendingDeleteConfirm(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit document" : "Add document"}
      </Text>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Type</Text>
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {TYPES.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setType(t.key)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: type === t.key }}
            style={[
              styles.chip,
              {
                borderRadius: radius.pill,
                borderColor: type === t.key ? colors.primary : colors.border,
                backgroundColor: type === t.key ? colors.primaryMuted : "transparent",
              },
            ]}
          >
            <Text style={[typography.caption, { color: type === t.key ? colors.primary : colors.textMuted }]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {type === "other" ? (
        <TextField
          label="Label"
          value={customLabel}
          onChangeText={setCustomLabel}
          placeholder="e.g. Road Tax Receipt"
        />
      ) : null}

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Expiry date</Text>
      <Pressable
        onPress={() => setShowDatePicker(true)}
        style={[
          styles.pickerChip,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.lg },
        ]}
      >
        <Text style={[typography.body, { color: expiresAt ? colors.text : colors.textFaint }]}>
          {expiresAt ? formatDateLabel(toIsoDate(expiresAt)) : "Not set"}
        </Text>
        {expiresAt ? (
          <Pressable onPress={() => setExpiresAt(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear expiry date">
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </Pressable>
      {showDatePicker ? (
        <DateTimePicker
          value={expiresAt ?? new Date()}
          mode="date"
          onChange={(_event, selected) => {
            setShowDatePicker(false);
            if (selected) setExpiresAt(selected);
          }}
        />
      ) : null}

      <View style={[styles.row, { marginBottom: spacing.lg }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Remind me before this expires</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Notified 3 days before the expiry date</Text>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={handleReminderToggle}
          accessibilityLabel="Remind me before this expires"
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>File</Text>
      {fileData ? <FilePreview dataUrl={fileData} fileName={fileName} /> : null}
      <Button
        label={fileData ? "Replace file" : "Attach file"}
        variant="secondary"
        onPress={handlePickPress}
        style={{ marginBottom: spacing.lg }}
        accessibilityLabel={fileData ? "Replace attached file" : "Attach file"}
      />

      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      <Button
        label={isEditing ? "Save changes" : "Add document"}
        size="large"
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.lg }}
      />

      {isEditing ? (
        <Button
          label="Delete document"
          variant="danger"
          onPress={() => setPendingDeleteConfirm(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <ConfirmationSheet
        visible={pendingDeleteConfirm}
        title="Delete this document?"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteConfirm(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth },
  pickerChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    padding: 12,
  },
  row: { flexDirection: "row", alignItems: "center" },
});
