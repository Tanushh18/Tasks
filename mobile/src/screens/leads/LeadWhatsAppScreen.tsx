import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { Button } from "../../components/Button";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { getLocalOrigins } from "../../leads/leadStore";
import { BASE_SHEETS, pickTemplateImage } from "../../leads/whatsapp";
import { useTheme } from "../../theme/useTheme";

interface Draft {
  id: string | null;
  name: string;
  rough: string;
  text: string;
  imageUrl: string;
  sheets: string[];
}

const EMPTY: Draft = { id: null, name: "", rough: "", text: "", imageUrl: "", sheets: [] };

/**
 * WhatsApp message templates, shared by everyone. Each template has a message ({name} becomes the lead's name), one fixed
 * image and the sheets it applies to. A sheet uses at most one template: attaching it here moves it off any other.
 */
export function LeadWhatsAppScreen() {
  const { colors, spacing, typography, radius, touchTarget, feature } = useTheme();
  const [templates, setTemplates] = useState<api.WhatsAppTemplate[]>([]);
  const [origins, setOrigins] = useState<string[]>(BASE_SHEETS);
  const [ai, setAi] = useState<api.AiStatus | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [improving, setImproving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.listWhatsAppTemplates().then(setTemplates).catch((e) => Alert.alert("Couldn't load templates", getApiErrorMessage(e)));
    api.getAiStatus().then(setAi).catch(() => setAi(null));
    const merge = (names: string[]) => setOrigins([...new Set([...BASE_SHEETS, ...names])].sort((a, b) => a.localeCompare(b)));
    api
      .listOrigins()
      .then((list) => merge(list.map((o) => o.name)))
      .catch(() => void getLocalOrigins().then((list) => merge(list.map((o) => o.name))));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  // Which template each sheet currently uses, for the "used by …" hint on the chips.
  const usedBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of templates) for (const s of t.sheets) m.set(s.toLowerCase(), t.name);
    return m;
  }, [templates]);

  const openNew = () => {
    setAiError("");
    setDraft({ ...EMPTY });
  };
  const openEdit = (t: api.WhatsAppTemplate) => {
    setAiError("");
    setDraft({ id: t.id, name: t.name, rough: "", text: t.text, imageUrl: t.imageUrl, sheets: [...t.sheets] });
  };

  const improve = async () => {
    if (!draft) return;
    const rough = draft.rough.trim();
    if (!rough) {
      setAiError("Write your rough message first.");
      return;
    }
    setImproving(true);
    setAiError("");
    try {
      const text = await api.improveWhatsAppText(rough);
      setDraft((d) => (d ? { ...d, text } : d));
    } catch (e) {
      // e.g. 503 "AI is not set up on the server": the person can still type the final text by hand.
      setAiError(getApiErrorMessage(e, "Couldn't improve the message."));
    } finally {
      setImproving(false);
    }
  };

  const pickImage = async () => {
    const picked = await pickTemplateImage();
    if (!picked) return;
    if ("error" in picked) {
      Alert.alert("Can't use that image", picked.error);
      return;
    }
    setDraft((d) => (d ? { ...d, imageUrl: picked.dataUrl } : d));
  };

  const toggleSheet = (name: string) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.sheets.some((s) => s.toLowerCase() === name.toLowerCase());
      return { ...d, sheets: has ? d.sheets.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...d.sheets, name] };
    });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return Alert.alert("Name required", "Give the template a name.");
    if (!draft.text.trim()) return Alert.alert("Message required", "Write the message (or use Improve with AI).");
    setSaving(true);
    try {
      const body = { name: draft.name.trim(), text: draft.text.trim(), imageUrl: draft.imageUrl || null, sheets: draft.sheets };
      if (draft.id) await api.updateWhatsAppTemplate(draft.id, body);
      else await api.createWhatsAppTemplate(body);
      setDraft(null);
      load();
    } catch (e) {
      Alert.alert("Couldn't save template", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!draft?.id) return;
    const id = draft.id;
    Alert.alert("Delete template?", "Sheets using it go back to opening WhatsApp without a message.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          api
            .deleteWhatsAppTemplate(id)
            .then(() => {
              setDraft(null);
              load();
            })
            .catch((e) => Alert.alert("Couldn't delete", getApiErrorMessage(e)));
        },
      },
    ]);
  };

  const label = (text: string) => (
    <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>{text}</Text>
  );

  if (draft) {
    return (
      <ScreenContainer>
        <TextField label="Template name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="e.g. Welcome message" />

        <TextField
          label="Write your rough message"
          value={draft.rough}
          onChangeText={(rough) => setDraft({ ...draft, rough })}
          multiline
          placeholder="e.g. hi {name}, plot ki details bhejni thi, kab baat kar sakte hain"
        />
        <Button label={improving ? "Improving…" : "Improve with AI"} variant="secondary" onPress={() => void improve()} disabled={improving} />
        {aiError ? (
          <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>
            {aiError}
          </Text>
        ) : null}

        <View style={{ height: spacing.lg }} />
        <TextField
          label="Final message (edit freely). {name} becomes the lead's name"
          value={draft.text}
          onChangeText={(text) => setDraft({ ...draft, text })}
          multiline
          maxLength={2000}
        />

        {label("Image (optional, up to 2 MB)")}
        {draft.imageUrl ? (
          <Image
            source={{ uri: draft.imageUrl }}
            accessibilityLabel="Template image preview"
            style={[styles.thumb, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm }]}
          />
        ) : null}
        <View style={styles.rowButtons}>
          <Button label={draft.imageUrl ? "Change image" : "Upload image"} variant="secondary" onPress={() => void pickImage()} style={{ flex: 1, marginRight: 8 }} />
          {draft.imageUrl ? <Button label="Remove" variant="ghost" onPress={() => setDraft({ ...draft, imageUrl: "" })} style={{ flex: 1 }} /> : null}
        </View>

        <View style={{ height: spacing.lg }} />
        {label("Use this template for these sheets")}
        <FilterChipGroup>
          {origins.map((name) => {
            const selected = draft.sheets.some((s) => s.toLowerCase() === name.toLowerCase());
            return (
              <FilterChip
                key={name}
                label={name}
                selected={selected}
                icon={selected ? "checkmark" : undefined}
                onPress={() => toggleSheet(name)}
              />
            );
          })}
        </FilterChipGroup>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
          A sheet uses one template. Picking a sheet that already has one moves it here.
        </Text>
        {draft.sheets
          .map((s) => ({ s, other: usedBy.get(s.toLowerCase()) }))
          .filter((x) => x.other && x.other !== draft.name && !templates.find((t) => t.id === draft.id)?.sheets.some((s) => s.toLowerCase() === x.s.toLowerCase()))
          .map((x) => (
            <Text key={x.s} style={[typography.caption, { color: colors.warning, marginTop: 2 }]}>
              {x.s} will move from "{x.other}".
            </Text>
          ))}

        <View style={[styles.rowButtons, { marginTop: spacing.xl }]}>
          <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} style={{ flex: 1, marginRight: 8 }} />
          <Button label={saving ? "Saving…" : "Save"} onPress={() => void save()} disabled={saving} style={{ flex: 1 }} />
        </View>
        {draft.id ? <Button label="Delete template" variant="danger" onPress={remove} style={{ marginTop: spacing.md }} /> : null}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md }]}>
        {ai?.connected ? "AI model connected: Improve with AI is available." : "AI is not set up on the server. You can still type the message yourself."}
      </Text>
      {templates.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.lg }]}>No templates yet.</Text>
      ) : null}
      {templates.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => openEdit(t)}
          accessibilityRole="button"
          accessibilityLabel={`Edit template ${t.name}`}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, minHeight: touchTarget.large, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {t.imageUrl ? <Image source={{ uri: t.imageUrl }} style={[styles.small, { borderRadius: radius.sm }]} /> : (
            <View style={[styles.small, { borderRadius: radius.sm, backgroundColor: feature.leads.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="logo-whatsapp" size={22} color={feature.leads.solid} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{t.name}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>{t.text}</Text>
            <Text style={[typography.caption, { color: feature.leads.solid }]} numberOfLines={1}>
              {t.sheets.length ? `Used for: ${t.sheets.join(", ")}` : "Not attached to any sheet"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
      <Button label="New template" onPress={openNew} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 160, height: 160 },
  small: { width: 48, height: 48 },
  rowButtons: { flexDirection: "row" },
});
