import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/shineMedia";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonList } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import { useTheme } from "../../theme/useTheme";

export function MediaScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const navigation = useNavigation<{ navigate: (name: string, params: object) => void }>();
  const [projects, setProjects] = useState<api.MediaProject[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
      setConfigured(res.configured);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!loaded) {
    return (
      <ScreenContainer>
        <SkeletonList count={5} />
      </ScreenContainer>
    );
  }
  if (error && projects.length === 0) {
    return (
      <ScreenContainer>
        <ErrorState message={error} onRetry={() => void load()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.md }]}>
        Photos and videos you add here appear on the ShineOne Estate website.
      </Text>
      {!configured ? (
        <Text style={[typography.body, { color: colors.danger, marginBottom: spacing.md }]}>
          The website photo service isn't set up on the server yet.
        </Text>
      ) : null}
      {projects.map((p) => {
        const photos = p.items.filter((i) => i.kind === "image").length;
        const videos = p.items.length - photos;
        const cover = p.items[0];
        return (
          <Pressable
            key={p.key}
            accessibilityRole="button"
            accessibilityLabel={`${p.label}, ${photos} photos, ${videos} videos`}
            onPress={() => navigation.navigate("MediaProject", { projectKey: p.key, label: p.label })}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.sm }]}
          >
            {cover ? (
              <Image source={{ uri: cover.thumb }} style={[styles.cover, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]} />
            ) : (
              <View style={[styles.cover, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="images-outline" size={24} color={colors.textFaint} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.h2, { color: colors.text }]}>{p.label}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {photos} {photos === 1 ? "photo" : "photos"} · {videos} {videos === 1 ? "video" : "videos"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </Pressable>
        );
      })}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: StyleSheet.hairlineWidth },
  cover: { width: 64, height: 64 },
});
