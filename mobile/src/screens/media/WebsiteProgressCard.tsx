import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/shineMedia";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { FilterChip, FilterChipRow } from "../../components/FilterChip";
import { SegmentedControl } from "../../components/SegmentedControl";
import { TextField } from "../../components/TextField";
import { useTheme } from "../../theme/useTheme";

/** Progress %, stage and ETA the ShineOne website shows for one project. */
export function WebsiteProgressCard({ projectKey }: { projectKey: string }) {
  const { colors, spacing, typography, radius } = useTheme();
  const [project, setProject] = useState<api.SiteProject | null>(null);
  const [draft, setDraft] = useState<api.SiteProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getSite();
      const p = res.projects.find((x) => x.key === projectKey) ?? null;
      setProject(p);
      setDraft(p);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Couldn't load the website progress.</Text>
        <Button label="Try again" variant="secondary" onPress={load} style={{ marginTop: spacing.sm }} />
      </Card>
    );
  }
  if (!project || !draft) return null;

  const completed = draft.status === "Completed";
  const changed = JSON.stringify(project) !== JSON.stringify(draft);
  const step = (d: number) => setDraft({ ...draft, progress: Math.max(0, Math.min(100, draft.progress + d)) });

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.updateSiteProject(projectKey, {
        status: draft.status,
        progress: draft.progress,
        stage: completed ? "" : draft.stage,
        eta: draft.eta,
        area: draft.area,
      });
      const p = res.projects.find((x) => x.key === projectKey) ?? null;
      setProject(p);
      setDraft(p);
    } catch (e) {
      Alert.alert("Couldn't save", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={[typography.h2, { color: colors.text }]}>Website progress</Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md }]}>
        What the ShineOne website shows for this project.
      </Text>

      <SegmentedControl
        segments={[{ value: "Ongoing", label: "Ongoing" }, { value: "Completed", label: "Completed" }]}
        value={draft.status}
        onChange={(status) => setDraft({ ...draft, status, progress: status === "Completed" ? 100 : draft.progress })}
      />

      {!completed ? (
        <>
          <View style={[styles.stepper, { marginTop: spacing.md }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Decrease progress by 5" onPress={() => step(-5)}
              style={[styles.stepBtn, { borderColor: colors.border, borderRadius: radius.md }]}>
              <Ionicons name="remove" size={22} color={colors.text} />
            </Pressable>
            <Text accessibilityLabel={`Progress ${draft.progress} percent`} style={[typography.h1, { color: colors.text, minWidth: 90, textAlign: "center" }]}>
              {draft.progress}%
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Increase progress by 5" onPress={() => step(5)}
              style={[styles.stepBtn, { borderColor: colors.border, borderRadius: radius.md }]}>
              <Ionicons name="add" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.surfaceAlt, marginVertical: spacing.sm }]}>
            <View style={{ width: `${draft.progress}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 3 }} />
          </View>

          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm, marginBottom: 6 }]}>Current stage</Text>
          <FilterChipRow>
            {api.SITE_STAGES.map((s) => (
              <FilterChip key={s} label={s} selected={draft.stage === s} onPress={() => setDraft({ ...draft, stage: draft.stage === s ? "" : s })} />
            ))}
          </FilterChipRow>

          <View style={{ marginTop: spacing.md }}>
            <TextField label="Expected handover" value={draft.eta} placeholder="e.g. June 2026" maxLength={40}
              onChangeText={(eta) => setDraft({ ...draft, eta })} />
          </View>
        </>
      ) : null}

      <Button label={changed ? "Save to website" : "Saved"} onPress={save} loading={saving} disabled={!changed}
        style={{ marginTop: spacing.md }} accessibilityHint="Updates the ShineOne website within a minute" />
    </Card>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  stepBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
});
