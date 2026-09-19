import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as vaultApi from "../../api/vaultDocuments";
import type { VaultDocumentCategory } from "../../api/vaultDocuments";
import { Button } from "../../components/Button";
import { ConfirmationSheet } from "../../components/ConfirmationSheet";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import type { VaultStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { labelForMimeType, mimeTypeFromDataUrl, pickDocumentFile, pickImage, showFilePickerSheet } from "../../utils/filePicker";

type Props = NativeStackScreenProps<VaultStackParamList, "VaultForm">;

const CATEGORIES: { key: VaultDocumentCategory; label: string }[] = [
  { key: "insurance", label: "Insurance" },
  { key: "warranty", label: "Warranty" },
  { key: "vehicle", label: "Vehicle" },
  { key: "property", label: "Property" },
  { key: "other", label: "Other" },
];

export function VaultFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { documentId } = route.params ?? {};
  const isEditing = Boolean(documentId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VaultDocumentCategory>("other");
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const existing = await vaultApi.getVaultDocument(documentId);
        setTitle(existing.title);
        setCategory(existing.category);
        setFileData(existing.fileData);
        setNotes(existing.notes);
        setExpiresAt(existing.expiresAt);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId]);

  async function handlePick(source: "camera" | "library" | "document") {
    const picked = source === "document" ? await pickDocumentFile() : await pickImage(source);
    if (!picked) return;
    setFileData(picked.dataUrl);
    setFileName(picked.fileName);
  }

  function handlePickPress() {
    showFilePickerSheet(handlePick, "Add file");
  }

  async function handleSave() {
    setError(null);
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (!fileData) {
      setError("Please add a file for this document.");
      return;
    }
    setSaving(true);
    const input = { title: title.trim(), category, fileData, notes, expiresAt };
    try {
      if (isEditing && documentId) {
        await vaultApi.updateVaultDocument(documentId, input);
      } else {
        await vaultApi.createVaultDocument(input);
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
      await vaultApi.deleteVaultDocument(documentId);
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this document."));
    } finally {
      setDeleting(false);
      setPendingDeleteConfirm(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  const mimeType = mimeTypeFromDataUrl(fileData);
  const isImage = mimeType?.startsWith("image/") ?? false;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit document" : "Add document"}
      </Text>

      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Car Insurance Policy" />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Category</Text>
      <View style={[styles.chipRow, { marginBottom: spacing.lg }]}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: category === c.key }}
            style={[
              styles.chip,
              {
                borderRadius: radius.pill,
                borderColor: category === c.key ? colors.primary : colors.border,
                backgroundColor: category === c.key ? colors.primaryMuted : "transparent",
              },
            ]}
          >
            <Text style={[typography.caption, { color: category === c.key ? colors.primary : colors.textMuted }]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Document file</Text>
      {fileData ? (
        isImage ? (
          <Image source={{ uri: fileData }} style={[styles.preview, { borderRadius: radius.md, marginBottom: spacing.md }]} />
        ) : (
          <View
            style={[
              styles.filePreview,
              {
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.md,
                marginBottom: spacing.md,
                padding: spacing.lg,
              },
            ]}
          >
            <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
            <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: spacing.md, flexShrink: 1 }]}>
              {fileName ?? labelForMimeType(mimeType)}
            </Text>
          </View>
        )
      ) : null}
      <Button
        label={fileData ? "Replace file" : "Add file"}
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
  preview: { width: "100%", height: 200, resizeMode: "cover" },
  filePreview: { flexDirection: "row", alignItems: "center" },
});
