import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/useTheme";
import { labelForMimeType, mimeTypeFromDataUrl } from "../utils/filePicker";
import { openDataUrlFile } from "../utils/openFile";

interface Props {
  dataUrl: string;
  fileName?: string | null;
}

/** Shows an attached file: tap an image to view it full screen, tap a PDF/Word file to open it. */
export function FilePreview({ dataUrl, fileName }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const [viewing, setViewing] = useState(false);
  const mimeType = mimeTypeFromDataUrl(dataUrl);
  const isImage = mimeType?.startsWith("image/") ?? false;

  if (isImage) {
    return (
      <>
        <Pressable
          onPress={() => setViewing(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel="View attached photo full screen"
          style={{ marginBottom: spacing.md }}
        >
          <Image source={{ uri: dataUrl }} style={[styles.preview, { borderRadius: radius.md }]} />
          <View style={[styles.hint, { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: radius.pill }]}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
            <Text style={[typography.caption, { color: "#fff", marginLeft: 4 }]}>Tap to view</Text>
          </View>
        </Pressable>

        <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
          <View style={styles.backdrop}>
            <SafeAreaView style={styles.flex}>
              <Pressable
                onPress={() => setViewing(false)}
                accessibilityRole="button"
                accessibilityLabel="Close photo"
                style={styles.close}
                hitSlop={12}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Image source={{ uri: dataUrl }} style={styles.full} resizeMode="contain" />
            </SafeAreaView>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <Pressable
      onPress={() => openDataUrlFile(dataUrl, fileName)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${fileName ?? labelForMimeType(mimeType)}`}
      style={({ pressed }) => [
        styles.fileCard,
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: spacing.lg,
          marginBottom: spacing.md,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {fileName ?? labelForMimeType(mimeType)}
        </Text>
        <Text style={[typography.caption, { color: colors.primary }]}>Tap to open</Text>
      </View>
      <Ionicons name="open-outline" size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  preview: { width: "100%", height: 200, resizeMode: "cover" },
  hint: { position: "absolute", right: 8, bottom: 8, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
  close: { alignSelf: "flex-end", padding: 16 },
  full: { flex: 1, width: "100%" },
  fileCard: { flexDirection: "row", alignItems: "center" },
});
