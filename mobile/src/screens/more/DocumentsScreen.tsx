import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as docsApi from "../../api/sharedDocuments";
import type { SharedDocument } from "../../api/sharedDocuments";
import { useAuth } from "../../auth/AuthContext";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { useTheme } from "../../theme/useTheme";
import { pickDocumentFile } from "../../utils/filePicker";

/** A plain shared list of documents (IDs, PDFs): everyone can open, add (file or Drive link) and remove their own. */
export function DocumentsScreen() {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();
  const [docs, setDocs] = useState<SharedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDocs(await docsApi.listSharedDocuments());
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't load the documents."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const openAdd = () => {
    setTitle("");
    setLink("");
    setFile(null);
    setAdding(true);
  };

  const pick = async () => {
    const picked = await pickDocumentFile();
    if (!picked) return;
    setFile({ dataUrl: picked.dataUrl, fileName: picked.fileName });
    setLink("");
    if (!title.trim()) setTitle(picked.fileName.replace(/\.[^.]+$/, ""));
  };

  const save = async () => {
    if (!title.trim()) return Alert.alert("Add a title");
    if (!file && !link.trim()) return Alert.alert("Upload a file or paste a Google Drive link");
    setBusy(true);
    try {
      const doc = await docsApi.addSharedDocument(
        file ? { title: title.trim(), fileData: file.dataUrl, fileName: file.fileName } : { title: title.trim(), link: link.trim() }
      );
      setDocs((d) => [doc, ...d]);
      setAdding(false);
    } catch (e) {
      Alert.alert("Couldn't add the document", getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (doc: SharedDocument) =>
    Linking.openURL(doc.url).catch(() => Alert.alert("Couldn't open this document"));

  const remove = (doc: SharedDocument) =>
    Alert.alert("Delete this document?", doc.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          docsApi
            .deleteSharedDocument(doc.id)
            .then(() => setDocs((d) => d.filter((x) => x.id !== doc.id)))
            .catch((e) => Alert.alert("Couldn't delete", getApiErrorMessage(e))),
      },
    ]);

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>Shared with everyone</Text>
        <Button label="Add" onPress={openAdd} />
      </View>
      {loading ? (
        <SkeletonLines count={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          subtitle="Upload a PDF or paste a Google Drive link. Everyone can see these."
          icon="document-outline"
          tone={colors.primary}
          toneMuted={colors.primaryMuted}
          actionLabel="Add document"
          onAction={openAdd}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {docs.map((doc) => (
            <Card key={doc.id} style={[styles.row, { marginBottom: spacing.md }]}>
              <Pressable onPress={() => void open(doc)} accessibilityRole="button" accessibilityLabel={`Open ${doc.title}`} style={styles.main}>
                <Ionicons name={doc.kind === "link" ? "logo-google" : "document-text-outline"} size={22} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{doc.title}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {[doc.kind === "link" ? "Drive link" : "File", doc.createdByName && `added by ${doc.createdByName}`].filter(Boolean).join(" • ")}
                  </Text>
                </View>
              </Pressable>
              {user?.isAdmin || user?.id === doc.createdBy ? (
                <Pressable onPress={() => remove(doc)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${doc.title}`}>
                  <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      )}

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add document" subtitle="Upload a file or paste a Google Drive link" avoidKeyboard>
        <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Aadhaar card" autoCapitalize="words" />
        <Button
          label={file ? `File: ${file.fileName}` : "Upload PDF / document"}
          variant="secondary"
          onPress={() => void pick()}
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="Or Google Drive link"
          value={link}
          onChangeText={(t) => {
            setLink(t);
            if (t.trim()) setFile(null);
          }}
          placeholder="https://drive.google.com/…"
          autoCapitalize="none"
          keyboardType="url"
        />
        <View style={[styles.buttons, { gap: spacing.md }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
          <Button label="Add" onPress={() => void save()} loading={busy} style={{ flex: 1 }} />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  main: { flex: 1, flexDirection: "row", alignItems: "center" },
  buttons: { flexDirection: "row", marginTop: 8 },
});
