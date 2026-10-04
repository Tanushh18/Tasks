import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/shineMedia";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonList } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";
import { WebsiteProgressCard } from "./WebsiteProgressCard";

const GAP = 6;
const COLUMNS = 3;

export function MediaProjectScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { width } = useWindowDimensions();
  const route = useRoute();
  const { projectKey } = route.params as { projectKey: string; label: string };
  const [items, setItems] = useState<api.MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; fraction: number } | null>(null);
  const [viewing, setViewing] = useState<api.MediaItem | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listProjects();
      setItems(res.projects.find((p) => p.key === projectKey)?.items ?? []);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, [projectKey]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const add = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos so you can add them.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;

    const files: api.PickedMedia[] = result.assets.map((a) => ({
      uri: a.uri,
      kind: a.type === "video" ? "video" : "image",
      fileName: a.fileName,
      mimeType: a.mimeType,
    }));
    setProgress({ index: 0, total: files.length, fraction: 0 });
    const { uploaded, error: uploadError } = await api.uploadMany(projectKey, files, setProgress);
    setProgress(null);
    if (uploadError) {
      Alert.alert(
        uploaded > 0 ? `${uploaded} of ${files.length} added` : "Couldn't add",
        `${uploadError}\n\nVideos can be up to 100 MB.`
      );
    }
    await load();
  };

  const remove = (item: api.MediaItem) =>
    Alert.alert(
      item.kind === "video" ? "Delete this video?" : "Delete this photo?",
      "It will be removed from the ShineOne Estate website too. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteMedia(item);
              setViewing(null);
              await load();
            } catch (e) {
              Alert.alert("Couldn't delete", getApiErrorMessage(e));
            }
          },
        },
      ]
    );

  const open = (item: api.MediaItem) => {
    if (item.kind === "video") void Linking.openURL(item.url);
    else setViewing(item);
  };

  const size = (Math.min(width, 640) - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  if (!loaded) {
    return (
      <ScreenContainer>
        <SkeletonList count={4} />
      </ScreenContainer>
    );
  }
  if (error && items.length === 0) {
    return (
      <ScreenContainer>
        <ErrorState message={error} onRetry={() => void load()} />
      </ScreenContainer>
    );
  }

  return (
    <>
      <ScreenContainer
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load();
        }}
      >
        <WebsiteProgressCard projectKey={projectKey} />
        <Button
          label={progress ? `Uploading ${progress.index + 1} of ${progress.total} · ${Math.round(progress.fraction * 100)}%` : "Add photos or videos"}
          onPress={add}
          loading={!!progress}
        />
        <Text style={[typography.caption, { color: colors.textMuted, marginVertical: spacing.sm }]}>
          Tap to open. Press and hold to delete. Changes show on the website within a minute or two.
        </Text>
        {items.length === 0 ? (
          <EmptyState title="Nothing here yet" subtitle="Add the first photo or video for this project." />
        ) : (
          <View style={styles.grid}>
            {items.map((item) => (
              <Pressable
                key={item.publicId}
                accessibilityRole="imagebutton"
                accessibilityLabel={item.kind === "video" ? "Video" : "Photo"}
                accessibilityHint="Press and hold to delete"
                onPress={() => open(item)}
                onLongPress={() => remove(item)}
                style={{ width: size, height: size, marginRight: GAP, marginBottom: GAP }}
              >
                <Image source={{ uri: item.thumb }} style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }} />
                {item.kind === "video" ? (
                  <View style={styles.play}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScreenContainer>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing ? <Image source={{ uri: viewing.url }} style={styles.full} resizeMode="contain" /> : null}
          <View style={styles.viewerBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setViewing(null)} style={styles.viewerBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete photo" onPress={() => viewing && remove(viewing)} style={styles.viewerBtn}>
              <Ionicons name="trash-outline" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  play: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" },
  full: { width: "100%", height: "80%" },
  viewerBar: { position: "absolute", top: 40, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  viewerBtn: { padding: 10 },
});
