import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import * as contactsApi from "../../api/contacts";
import { getApiErrorMessage } from "../../api/client";
import type { UserSearchResult } from "../../api/users";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/StateViews";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import { useAuth } from "../../auth/AuthContext";
import type { ContactsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<ContactsStackParamList, "ContactForm">;

export function ContactFormScreen({ navigation, route }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();
  const { contactId } = route.params ?? {};
  const isEditing = Boolean(contactId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [description, setDescription] = useState("");
  const [sharedWith, setSharedWith] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    if (!contactId) return;
    (async () => {
      try {
        const existing = await contactsApi.getContact(contactId);
        setName(existing.name);
        setNumber(existing.number);
        setDescription(existing.description);
        setSharedWith(existing.sharedWith);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [contactId]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    if (!number.trim()) {
      setError("Enter a phone number.");
      return;
    }
    setError(null);
    setSaving(true);

    const input = {
      name: name.trim(),
      number: number.trim(),
      description: description.trim(),
      sharedWith: sharedWith.map((u) => u.id),
    };

    try {
      if (isEditing && contactId) {
        await contactsApi.updateContact(contactId, input);
      } else {
        await contactsApi.createContact(input);
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this contact."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit contact" : "Add contact"}
      </Text>

      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Priya Sharma" />
      <TextField
        label="Phone number"
        value={number}
        onChangeText={setNumber}
        placeholder="9876543210"
        keyboardType="phone-pad"
      />
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Share with</Text>
      <UserPicker
        mode="multi"
        value={sharedWith}
        onChange={setSharedWith}
        placeholder="Search people by name"
        excludeIds={user ? [user.id] : []}
      />

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      <Button
        label={isEditing ? "Save changes" : "Add contact"}
        size="large"
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}
