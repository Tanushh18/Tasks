import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const addSector = async () => {
    if (!newName.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await api.addProject(newName);
      setNewName("");
      await load();
      navigation.navigate("MediaProject", { projectKey: created.key, label: created.label });
    } catch (e) {
      setAddError(getApiErrorMessage(e));
    } finally {
      setAdding(false);
    }
  };

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
      <View style={[styles.addRow, { marginTop: spacing.md }]}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="Add a sector or area, e.g. Sector 12"
          placeholderTextColor={colors.textFaint}
          maxLength={40}
          accessibilityLabel="New sector or area name"
          returnKeyType="done"
          onSubmitEditing={() => void addSector()}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add sector or area"
          disabled={!newName.trim() || adding}
          onPress={() => void addSector()}
          style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: radius.md, opacity: !newName.trim() || adding ? 0.5 : 1 }]}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>
      {addError ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{addError}</Text> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: StyleSheet.hairlineWidth },
  cover: { width: 64, height: 64 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, height: 44, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  addBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
