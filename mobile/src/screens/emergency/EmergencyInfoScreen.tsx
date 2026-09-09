import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as emergencyApi from "../../api/emergencyInfo";
import type { EmergencyContact } from "../../api/emergencyInfo";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import type { EmergencyStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<EmergencyStackParamList, "EmergencyInfoMain">;

// This screen edits only the signed-in user's own record. Family members can already
// find it via the family member list -> "Emergency info" (visible to everyone, since
// the point of this feature is that someone else can find it in an emergency); this
// screen is where each person maintains their own sheet.
export function EmergencyInfoScreen(_props: Props) {
  const { colors, spacing, typography } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [medicalNotes, setMedicalNotes] = useState("");
  const [homeInfo, setHomeInfo] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const info = await emergencyApi.getOwnEmergencyInfo();
        setContacts(info.emergencyContacts);
        setMedicalNotes(info.medicalNotes);
        setHomeInfo(info.homeInfo);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateContact(index: number, patch: Partial<EmergencyContact>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  function addContact() {
    setContacts((prev) => [...prev, { name: "", phone: "", relation: "" }]);
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const cleanedContacts = contacts.filter((c) => c.name.trim() && c.phone.trim());
    try {
      // Do not log `medicalNotes`, `homeInfo`, or `cleanedContacts` anywhere — this is
      // sensitive personal data.
      const updated = await emergencyApi.updateOwnEmergencyInfo({
        emergencyContacts: cleanedContacts,
        medicalNotes,
        homeInfo,
      });
      setContacts(updated.emergencyContacts);
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save your emergency info."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.sm }]}>
        Emergency Info
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.lg }]}>
        Visible to every family member on this app, so someone can find it quickly in an emergency.
      </Text>

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        Emergency contacts
      </Text>
      {contacts.map((contact, index) => (
        <View key={index} style={[styles.contactRow, { marginBottom: spacing.sm }]}>
          <View style={styles.contactFields}>
            <TextInput
              value={contact.name}
              onChangeText={(text) => updateContact(index, { name: text })}
              placeholder="Name"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`Contact ${index + 1} name`}
              style={[styles.input, { color: colors.text, borderColor: colors.border, marginBottom: 6 }]}
            />
            <TextInput
              value={contact.phone}
              onChangeText={(text) => updateContact(index, { phone: text })}
              placeholder="Phone"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              accessibilityLabel={`Contact ${index + 1} phone`}
              style={[styles.input, { color: colors.text, borderColor: colors.border, marginBottom: 6 }]}
            />
            <TextInput
              value={contact.relation}
              onChangeText={(text) => updateContact(index, { relation: text })}
              placeholder="Relation (optional)"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`Contact ${index + 1} relation`}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
          </View>
          <Pressable
            onPress={() => removeContact(index)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove contact ${index + 1}`}
            style={{ marginLeft: spacing.sm }}
          >
            <Ionicons name="close-circle" size={22} color={colors.textFaint} />
          </Pressable>
        </View>
      ))}
      <Button label="Add contact" variant="secondary" onPress={addContact} style={{ marginBottom: spacing.lg }} />

      <TextField
        label="Medical notes"
        value={medicalNotes}
        onChangeText={setMedicalNotes}
        placeholder="Allergies, conditions, medications…"
        multiline
      />
      <TextField
        label="Home info"
        value={homeInfo}
        onChangeText={setHomeInfo}
        placeholder="Address, gate code, where the spare key is…"
        multiline
      />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}
      {saved ? (
        <Text style={[typography.caption, { color: colors.primary, marginTop: spacing.md, marginBottom: spacing.md }]}>
          Saved.
        </Text>
      ) : null}

      <Button label="Save" size="large" onPress={handleSave} loading={saving} style={{ marginTop: spacing.lg }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  contactRow: { flexDirection: "row", alignItems: "flex-start" },
  contactFields: { flex: 1 },
  input: { fontSize: 16, paddingVertical: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8 },
});
