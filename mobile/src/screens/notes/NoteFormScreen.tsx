import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as notesApi from "../../api/notes";
import type { UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import type { NotesStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import type { NoteChecklistItem, NoteColor } from "../../types/models";

type Props = NativeStackScreenProps<NotesStackParamList, "NoteForm">;

const COLOR_SWATCHES: { key: NoteColor; hex: string }[] = [
  { key: "default", hex: "#FFFFFF" },
  { key: "peach", hex: "#FBE3D3" },
  { key: "sage", hex: "#E1EBD9" },
  { key: "sky", hex: "#DDEAF3" },
  { key: "lavender", hex: "#E7E1F2" },
  { key: "sand", hex: "#F1E9D8" },
];

export function NoteFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { user } = useAuth();
  const { noteId, type: initialType } = route.params ?? {};
  const isEditing = Boolean(noteId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"text" | "checklist">(initialType ?? "text");
  const [body, setBody] = useState("");
  const [items, setItems] = useState<NoteChecklistItem[]>([]);
  const [color, setColor] = useState<NoteColor>("default");
  const [pinned, setPinned] = useState(false);
  const [sharedWith, setSharedWith] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    if (!noteId) return;
    (async () => {
      try {
        const existing = await notesApi.getNote(noteId);
        setTitle(existing.title);
        setType(existing.type);
        setBody(existing.body);
        setItems(existing.items);
        setColor(existing.color);
        setPinned(existing.pinned);
        setSharedWith(existing.sharedWith);
        setReadOnly(existing.ownerId.id !== user?.id);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [noteId, user?.id]);

  function updateItem(index: number, patch: Partial<NoteChecklistItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, { text: "", done: false }]);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    const input = {
      title: title.trim(),
      type,
      body: type === "text" ? body : "",
      items: type === "checklist" ? items.filter((item) => item.text.trim().length > 0) : [],
      color,
      pinned,
      sharedWith: sharedWith.map((u) => u.id),
    };

    try {
      if (isEditing && noteId) {
        await notesApi.updateNote(noteId, input);
      } else {
        await notesApi.createNote(input);
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this note."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? (readOnly ? "Note" : "Edit note") : type === "checklist" ? "New checklist" : "New note"}
      </Text>

      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Optional" editable={!readOnly} />

      {type === "text" ? (
        <TextField
          label="Note"
          value={body}
          onChangeText={setBody}
          placeholder="Write something…"
          multiline
          editable={!readOnly}
        />
      ) : (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Items</Text>
          {items.map((item, index) => (
            <View key={index} style={[styles.itemRow, { marginBottom: spacing.sm }]}>
              <Pressable
                onPress={() => !readOnly && updateItem(index, { done: !item.done })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                hitSlop={8}
              >
                <Ionicons
                  name={item.done ? "checkbox" : "square-outline"}
                  size={22}
                  color={item.done ? colors.primary : colors.textFaint}
                />
              </Pressable>
              <TextInput
                value={item.text}
                onChangeText={(text) => updateItem(index, { text })}
                placeholder="List item"
                placeholderTextColor={colors.textFaint}
                editable={!readOnly}
                style={[
                  styles.itemInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    borderRadius: radius.sm,
                    textDecorationLine: item.done ? "line-through" : "none",
                  },
                ]}
              />
              {!readOnly ? (
                <Pressable onPress={() => removeItem(index)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove item">
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {!readOnly ? (
            <Button label="Add item" variant="secondary" onPress={addItem} style={{ marginTop: spacing.xs }} />
          ) : null}
        </View>
      )}

      {!readOnly ? (
        <>
          <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Color</Text>
          <View style={[styles.swatchRow, { marginBottom: spacing.lg }]}>
            {COLOR_SWATCHES.map((swatch) => (
              <Pressable
                key={swatch.key}
                onPress={() => setColor(swatch.key)}
                accessibilityRole="button"
                accessibilityLabel={`${swatch.key} color`}
                accessibilityState={{ selected: color === swatch.key }}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: swatch.hex,
                    borderColor: color === swatch.key ? colors.primary : colors.border,
                    borderWidth: color === swatch.key ? 3 : StyleSheet.hairlineWidth,
                  },
                ]}
              />
            ))}
          </View>

          <View style={[styles.pinRow, { marginBottom: spacing.lg }]}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Pin to top</Text>
            <Switch
              value={pinned}
              onValueChange={setPinned}
              accessibilityLabel="Pin to top"
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>

          <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Share with</Text>
          <UserPicker
            mode="multi"
            value={sharedWith}
            onChange={setSharedWith}
            placeholder="Search people by name"
            excludeIds={user ? [user.id] : []}
          />
        </>
      ) : null}

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      {!readOnly ? (
        <Button
          label={isEditing ? "Save changes" : "Add note"}
          size="large"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemInput: { flex: 1, fontSize: 16, paddingVertical: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth },
  swatchRow: { flexDirection: "row", gap: 12 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  pinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
